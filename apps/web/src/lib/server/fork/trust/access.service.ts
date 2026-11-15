import type { PrincipalId, TicketId, TicketTypeId } from '@quackback/ids'
import { forkTrustAccessRequests, forkTrustDocuments } from '@/lib/server/fork/db'
import { and, db, desc, eq, gt, inArray, principal, user, type Transaction } from '@/lib/server/db'
import { recordAuditEventInTransaction } from '@/lib/server/audit/log'
import type { ForkAuditEventType } from '@/lib/server/fork/audit-events'
import { logger } from '@/lib/server/logger'
import type { Actor } from '@/lib/server/policy/types'
import { ConflictError, NotFoundError, ValidationError } from '@/lib/shared/errors'
import type { TrustAccessRequest, TrustDocumentAccess } from '@/lib/shared/fork/trust/types'
import { trustConfig } from './settings'
import type { TrustWriter } from './trust.service'

const log = logger.child({ component: 'fork-trust-access' })

/**
 * Requests for restricted Trust & Security documents (plans/v2/70-trust-security.md
 * §5, D-TS3). A request is a row here, plus (when support tickets are on) a
 * private support request so it lands in the team's inbox. Approving grants
 * access until `expires_at`; expiry is checked when access is read.
 */

const TICKET_TYPE_SLUG = 'trust-access-request'

type Row = typeof forkTrustAccessRequests.$inferSelect

/** A request that currently grants access. */
const isLiveGrant = (row: Pick<Row, 'state' | 'expiresAt'>, now = new Date()) =>
  row.state === 'approved' && (row.expiresAt === null || row.expiresAt > now)

/**
 * What one viewer may do with each restricted document: `granted` (with its
 * end), `pending`, `declined` (they may ask again) or `none`.
 */
export async function accessForViewer(
  principalId: PrincipalId,
  documentIds: string[]
): Promise<Map<string, TrustDocumentAccess>> {
  const result = new Map<string, TrustDocumentAccess>()
  if (documentIds.length === 0) return result
  const rows = await db
    .select()
    .from(forkTrustAccessRequests)
    .where(
      and(
        eq(forkTrustAccessRequests.requesterPrincipalId, principalId),
        inArray(forkTrustAccessRequests.documentId, documentIds)
      )
    )
    .orderBy(desc(forkTrustAccessRequests.createdAt))
  // A live approval wins, then an open request, then a decline (they may ask again).
  const rank = { granted: 3, pending: 2, declined: 1 } as const
  const now = new Date()
  for (const row of rows) {
    const next: TrustDocumentAccess | null = isLiveGrant(row, now)
      ? { state: 'granted', expiresAt: row.expiresAt?.toISOString() ?? null }
      : row.state === 'pending'
        ? { state: 'pending' }
        : row.state === 'declined'
          ? { state: 'declined' }
          : null
    const current = result.get(row.documentId)
    if (next && (!current || rank[next.state] > rank[current.state])) {
      result.set(row.documentId, next)
    }
  }
  return result
}

export async function hasLiveGrant(principalId: PrincipalId, documentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: forkTrustAccessRequests.id })
    .from(forkTrustAccessRequests)
    .where(
      and(
        eq(forkTrustAccessRequests.requesterPrincipalId, principalId),
        eq(forkTrustAccessRequests.documentId, documentId),
        eq(forkTrustAccessRequests.state, 'approved'),
        gt(forkTrustAccessRequests.expiresAt, new Date())
      )
    )
    .limit(1)
  return !!row
}

async function audit(
  tx: Transaction,
  writer: Pick<TrustWriter, 'audit' | 'headers' | 'principalId'>,
  event: ForkAuditEventType,
  id: string,
  before: unknown,
  after: unknown
) {
  await recordAuditEventInTransaction(tx, {
    event,
    actor: writer.audit,
    headers: writer.headers,
    target: { type: 'fork_trust_access_request', id },
    before,
    after,
    metadata: { principalId: writer.principalId },
  })
}

/** The hidden ticket type access requests are filed under; made on first use. */
async function accessTicketType(): Promise<TicketTypeId> {
  const { createTicketType, listTicketTypes } =
    await import('@/lib/server/domains/tickets/ticket-type.service')
  const existing = (await listTicketTypes()).find((t) => t.slug === TICKET_TYPE_SLUG)
  if (existing) return existing.id as TicketTypeId
  const created = await createTicketType({
    name: 'Trust access request',
    slug: TICKET_TYPE_SLUG,
    category: 'customer',
    intakeVisible: false,
  })
  return created.id as TicketTypeId
}

/**
 * A signed-in person asks for a restricted document. One open request per
 * person per document. The support request is best effort: if support tickets
 * are off, or opening one fails, the request still reaches the admin's Access
 * requests list.
 */
export async function requestDocumentAccess(
  requester: TrustWriter & { actor: Actor },
  documentId: string,
  reason: string | null
): Promise<void> {
  const [doc] = await db
    .select()
    .from(forkTrustDocuments)
    .where(eq(forkTrustDocuments.id, documentId))
    .limit(1)
  if (!doc || !doc.published || !doc.storageKey) {
    throw new NotFoundError('TRUST_DOCUMENT_NOT_FOUND', 'That document is not available')
  }
  if (doc.access !== 'restricted') {
    throw new ValidationError('TRUST_DOCUMENT_OPEN', 'This document does not need a request')
  }
  if (await hasLiveGrant(requester.principalId, documentId)) {
    throw new ConflictError('TRUST_ACCESS_GRANTED', 'You already have access to this document')
  }

  let row: Row
  try {
    row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(forkTrustAccessRequests)
        .values({ documentId, requesterPrincipalId: requester.principalId, reason })
        .returning()
      await audit(tx, requester, 'fork_trust.access_requested', created!.id, null, {
        documentId,
        reason,
      })
      return created!
    })
  } catch (error) {
    const code =
      (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code
    if (code === '23505') {
      throw new ConflictError(
        'TRUST_ACCESS_PENDING',
        'Your request is already waiting for a decision'
      )
    }
    throw error
  }

  try {
    const { createMyTicket } = await import('@/lib/server/domains/tickets/requester.service')
    const ticket = await createMyTicket(requester.actor, {
      title: `Access request: ${doc.title}`,
      description: [
        `Requested access to the restricted document "${doc.title}" on the Trust & Security page.`,
        reason ? `Reason: ${reason}` : null,
        'Approve or decline it in Admin › Trust & Security › Access requests.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      ticketTypeId: await accessTicketType(),
      customAttributes: { forkTrustAccessRequestId: row.id, documentId },
    })
    await db
      .update(forkTrustAccessRequests)
      .set({ ticketId: ticket.id })
      .where(eq(forkTrustAccessRequests.id, row.id))
  } catch (error) {
    log.warn(
      { err: error, requestId: row.id },
      'trust access request saved without a support ticket'
    )
  }
}

export async function listAccessRequests(): Promise<TrustAccessRequest[]> {
  const rows = await db
    .select({
      request: forkTrustAccessRequests,
      documentTitle: forkTrustDocuments.title,
      requesterName: principal.displayName,
      requesterEmail: user.email,
    })
    .from(forkTrustAccessRequests)
    .innerJoin(forkTrustDocuments, eq(forkTrustDocuments.id, forkTrustAccessRequests.documentId))
    .innerJoin(principal, eq(principal.id, forkTrustAccessRequests.requesterPrincipalId))
    .leftJoin(user, eq(user.id, principal.userId))
    .orderBy(desc(forkTrustAccessRequests.createdAt))
    .limit(500)
  const now = new Date()
  return rows.map(({ request, documentTitle, requesterName, requesterEmail }) => ({
    id: request.id,
    documentId: request.documentId,
    documentTitle,
    requesterName: requesterName ?? requesterEmail ?? 'Unknown',
    requesterEmail: requesterEmail ?? null,
    state:
      request.state === 'approved' && request.expiresAt && request.expiresAt <= now
        ? 'expired'
        : (request.state as TrustAccessRequest['state']),
    reason: request.reason,
    decisionNote: request.decisionNote,
    ticketId: request.ticketId,
    createdAt: request.createdAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
    expiresAt: request.expiresAt?.toISOString() ?? null,
  }))
}

export type AccessDecision =
  | { decision: 'approve'; days?: number; note?: string | null }
  | { decision: 'decline'; note?: string | null }
  | { decision: 'revoke'; note?: string | null }

/**
 * Approve or decline a pending request, or revoke an approved one. The
 * decision is the record; replying to and closing the support request are
 * best effort, so a ticket the team already closed never blocks a decision.
 */
export async function decideAccessRequest(
  writer: TrustWriter & { actor: Actor },
  id: string,
  input: AccessDecision
): Promise<void> {
  const config = await trustConfig.read()
  const days = input.decision === 'approve' ? (input.days ?? config.grantDays) : 0
  const note = input.note?.trim() || null

  const { before, after, title } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(forkTrustAccessRequests)
      .where(eq(forkTrustAccessRequests.id, id))
      .limit(1)
      .for('update')
    if (!row) throw new NotFoundError('TRUST_ACCESS_NOT_FOUND', 'That request no longer exists')
    const allowed = input.decision === 'revoke' ? row.state === 'approved' : row.state === 'pending'
    if (!allowed) {
      throw new ConflictError('TRUST_ACCESS_DECIDED', 'This request has already been decided')
    }
    const now = new Date()
    const state =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'decline'
          ? 'declined'
          : 'revoked'
    const [updated] = await tx
      .update(forkTrustAccessRequests)
      .set({
        state,
        decisionNote: note,
        decidedByPrincipalId: writer.principalId,
        decidedAt: now,
        expiresAt:
          input.decision === 'approve'
            ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
            : input.decision === 'revoke'
              ? now
              : null,
        updatedAt: now,
      })
      .where(eq(forkTrustAccessRequests.id, id))
      .returning()
    const event: ForkAuditEventType =
      input.decision === 'approve'
        ? 'fork_trust.access_approved'
        : input.decision === 'decline'
          ? 'fork_trust.access_declined'
          : 'fork_trust.access_revoked'
    await audit(
      tx,
      writer,
      event,
      id,
      { state: row.state },
      { state, expiresAt: updated!.expiresAt, note }
    )
    const [doc] = await tx
      .select({ title: forkTrustDocuments.title })
      .from(forkTrustDocuments)
      .where(eq(forkTrustDocuments.id, row.documentId))
    return { before: row, after: updated!, title: doc?.title ?? 'the document' }
  })

  if (!before.ticketId || input.decision === 'revoke') return
  await answerTicket(writer.actor, before.ticketId as TicketId, after, title, note)
}

async function answerTicket(
  actor: Actor,
  ticketId: TicketId,
  request: Row,
  title: string,
  note: string | null
): Promise<void> {
  try {
    const { sendTicketMessage } =
      await import('@/lib/server/domains/tickets/ticket-message.service')
    const message =
      request.state === 'approved'
        ? `Your request for "${title}" is approved. You can download it from the Trust & Security page until ${request.expiresAt?.toISOString().slice(0, 10)}.`
        : `Your request for "${title}" was declined.`
    await sendTicketMessage(actor, {
      ticketId,
      content: note ? `${message}\n\n${note}` : message,
    })
    const [{ listTicketStatuses }, { setTicketStatus }] = await Promise.all([
      import('@/lib/server/domains/tickets/ticket-status.service'),
      import('@/lib/server/domains/tickets/ticket.service'),
    ])
    const closed = (await listTicketStatuses()).find((s) => s.category === 'closed')
    if (closed) await setTicketStatus(ticketId, closed.id, actor)
  } catch (error) {
    log.warn({ err: error, ticketId }, 'trust access decision saved; answering its ticket failed')
  }
}
