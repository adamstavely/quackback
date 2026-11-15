import type { PrincipalId } from '@quackback/ids'
import { forkTrustSubscriptions, forkTrustUpdates } from '@/lib/server/fork/db'
import { and, db, desc, eq, isNull, principal, sql, user } from '@/lib/server/db'
import { recordAuditEventInTransaction } from '@/lib/server/audit/log'
import type { ForkAuditEventType } from '@/lib/server/fork/audit-events'
import { logger } from '@/lib/server/logger'
import { NotFoundError } from '@/lib/shared/errors'
import type { TrustUpdateValues } from '@/lib/shared/fork/trust/schema'
import type { TrustUpdate, TrustUpdatesAdmin } from '@/lib/shared/fork/trust/types'
import type { TrustPageUpdate } from '@/lib/shared/fork/trust/portal'
import type { TrustWriter } from './trust.service'

const log = logger.child({ component: 'fork-trust-updates' })

/**
 * Updates on the Trust & Security page and the people who hear about them
 * (plans/v2/70-trust-security.md §5, D-TS8). Publishing tells every active
 * subscriber once, by email and in the notification bell; `notified_at` is
 * claimed by the statement that finds it empty, so nothing is sent twice.
 */

type Row = typeof forkTrustUpdates.$inferSelect

/** How many published updates the portal shows. */
const PORTAL_LIMIT = 50

/** The in-app notification type; the bell links it to /trust/updates (seam T-20). */
export const TRUST_UPDATE_NOTIFICATION = 'fork_trust_update'

const toDto = (row: Row): TrustUpdate => ({
  id: row.id,
  title: row.title,
  body: row.body,
  linkUrl: row.linkUrl,
  linkLabel: row.linkLabel,
  status: row.status as TrustUpdate['status'],
  publishedAt: row.publishedAt?.toISOString() ?? null,
  notifiedAt: row.notifiedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
})

export async function getTrustUpdatesAdmin(): Promise<TrustUpdatesAdmin> {
  const [rows, [count]] = await Promise.all([
    db
      .select()
      .from(forkTrustUpdates)
      .orderBy(
        sql`${forkTrustUpdates.publishedAt} DESC NULLS FIRST`,
        desc(forkTrustUpdates.updatedAt)
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(forkTrustSubscriptions)
      .where(isNull(forkTrustSubscriptions.unsubscribedAt)),
  ])
  return { updates: rows.map(toDto), subscribers: count?.n ?? 0 }
}

export async function listPublishedUpdates(): Promise<TrustPageUpdate[]> {
  const rows = await db
    .select()
    .from(forkTrustUpdates)
    .where(eq(forkTrustUpdates.status, 'published'))
    .orderBy(desc(forkTrustUpdates.publishedAt))
    .limit(PORTAL_LIMIT)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
  }))
}

async function load(id: string): Promise<Row> {
  const [row] = await db.select().from(forkTrustUpdates).where(eq(forkTrustUpdates.id, id))
  if (!row) throw new NotFoundError('TRUST_UPDATE_NOT_FOUND', 'That update no longer exists')
  return row
}

async function write(
  writer: TrustWriter,
  event: ForkAuditEventType,
  id: string,
  before: Row | null,
  change: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<Row | null>
): Promise<Row | null> {
  return db.transaction(async (tx) => {
    const after = await change(tx)
    await recordAuditEventInTransaction(tx, {
      event,
      actor: writer.audit,
      headers: writer.headers,
      target: { type: 'fork_trust_update', id },
      before: before ? { title: before.title, status: before.status } : null,
      after: after ? { title: after.title, status: after.status } : null,
      metadata: { principalId: writer.principalId },
    })
    return after
  })
}

/** Create a draft, or edit an update in place (a published one stays published, unannounced). */
export async function saveTrustUpdate(
  writer: TrustWriter,
  values: TrustUpdateValues
): Promise<TrustUpdate> {
  const fields = {
    title: values.title,
    body: values.body,
    linkUrl: values.linkUrl,
    linkLabel: values.linkUrl ? values.linkLabel : null,
    updatedByPrincipalId: writer.principalId,
    updatedAt: new Date(),
  }
  if (!values.id) {
    const id = crypto.randomUUID()
    const row = await write(writer, 'fork_trust.created', id, null, async (tx) => {
      const [created] = await tx
        .insert(forkTrustUpdates)
        .values({ id, ...fields })
        .returning()
      return created ?? null
    })
    return toDto(row!)
  }
  const before = await load(values.id)
  const row = await write(writer, 'fork_trust.updated', values.id, before, async (tx) => {
    const [updated] = await tx
      .update(forkTrustUpdates)
      .set(fields)
      .where(eq(forkTrustUpdates.id, values.id!))
      .returning()
    return updated ?? null
  })
  return toDto(row!)
}

/**
 * Publish an update. The first publish claims `notified_at` and tells
 * subscribers after the transaction commits; later ones only change the status.
 * The returned promise is the delivery, for callers (and tests) that want to wait.
 */
export async function publishTrustUpdate(
  writer: TrustWriter,
  id: string
): Promise<{ notified: Promise<number> | null }> {
  const before = await load(id)
  let claimed: Row | null = null
  await write(writer, 'fork_trust.update_published', id, before, async (tx) => {
    const now = new Date()
    const [published] = await tx
      .update(forkTrustUpdates)
      .set({
        status: 'published',
        publishedAt: before.publishedAt ?? now,
        updatedByPrincipalId: writer.principalId,
        updatedAt: now,
      })
      .where(eq(forkTrustUpdates.id, id))
      .returning()
    const [claim] = await tx
      .update(forkTrustUpdates)
      .set({ notifiedAt: now })
      .where(and(eq(forkTrustUpdates.id, id), isNull(forkTrustUpdates.notifiedAt)))
      .returning()
    claimed = claim ?? null
    return published ?? null
  })
  if (!claimed) return { notified: null }
  const notified = notifySubscribers(claimed).catch((err: unknown) => {
    log.error({ err, updateId: id }, 'trust update notifications failed')
    return 0
  })
  return { notified }
}

export async function unpublishTrustUpdate(writer: TrustWriter, id: string): Promise<void> {
  const before = await load(id)
  await write(writer, 'fork_trust.update_unpublished', id, before, async (tx) => {
    const [row] = await tx
      .update(forkTrustUpdates)
      .set({ status: 'draft', updatedByPrincipalId: writer.principalId, updatedAt: new Date() })
      .where(eq(forkTrustUpdates.id, id))
      .returning()
    return row ?? null
  })
}

export async function deleteTrustUpdate(writer: TrustWriter, id: string): Promise<void> {
  const before = await load(id)
  await write(writer, 'fork_trust.deleted', id, before, async (tx) => {
    await tx.delete(forkTrustUpdates).where(eq(forkTrustUpdates.id, id))
    return null
  })
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export async function isSubscribed(principalId: PrincipalId): Promise<boolean> {
  const [row] = await db
    .select({ unsubscribedAt: forkTrustSubscriptions.unsubscribedAt })
    .from(forkTrustSubscriptions)
    .where(eq(forkTrustSubscriptions.principalId, principalId))
  return !!row && row.unsubscribedAt === null
}

/** Subscribe or unsubscribe; unsubscribing keeps the row, so it can be undone. */
export async function setSubscribed(principalId: PrincipalId, subscribed: boolean): Promise<void> {
  const unsubscribedAt = subscribed ? null : new Date()
  await db
    .insert(forkTrustSubscriptions)
    .values({ principalId, unsubscribedAt })
    .onConflictDoUpdate({ target: forkTrustSubscriptions.principalId, set: { unsubscribedAt } })
}

// ── Delivery ─────────────────────────────────────────────────────────────────

/** Tell every active subscriber, in the bell and by email. Returns how many were told. */
async function notifySubscribers(update: Row): Promise<number> {
  const recipients = await db
    .select({ principalId: forkTrustSubscriptions.principalId, email: user.email })
    .from(forkTrustSubscriptions)
    .innerJoin(principal, eq(principal.id, forkTrustSubscriptions.principalId))
    .leftJoin(user, eq(user.id, principal.userId))
    .where(isNull(forkTrustSubscriptions.unsubscribedAt))
  if (recipients.length === 0) return 0

  const { createNotificationsBatch } =
    await import('@/lib/server/domains/notifications/notification.service')
  type NotificationInput = Parameters<typeof createNotificationsBatch>[0][number]
  await createNotificationsBatch(
    recipients.map((r): NotificationInput => ({
      principalId: r.principalId,
      // A fork type: stored as text, shown with the bell's default icon.
      type: TRUST_UPDATE_NOTIFICATION as NotificationInput['type'],
      title: update.title,
      body: update.body.slice(0, 200),
      metadata: { trustUpdateId: update.id },
    }))
  )

  const emails = recipients.flatMap((r) => (r.email ? [r.email] : []))
  if (emails.length > 0) await emailSubscribers(update, emails)
  return recipients.length
}

async function emailSubscribers(update: Row, to: string[]): Promise<void> {
  const mail = await import('@quackback/email')
  if (!mail.isEmailConfigured()) return
  const { assertSendingIdentityPermitted } =
    await import('@/lib/server/domains/channel-accounts/outbound-identity')
  const { buildHookContext } = await import('@/lib/server/events/hook-context')
  const context = await buildHookContext()
  const from = await assertSendingIdentityPermitted(mail.getEmailFrom())
  const { subject, html, text } = renderUpdateEmail(update, {
    workspaceName: context?.workspaceName ?? 'Quackback',
    pageUrl: `${context?.portalBaseUrl ?? ''}/trust/updates`,
  })
  for (const address of to) {
    // One at a time: a few hundred subscribers at most on an intranet, and a
    // failure for one address must not stop the rest.
    await mail
      .sendRawEmail({ from, to: address, subject, html, text })
      .catch((err: unknown) => log.warn({ err, updateId: update.id }, 'trust update email failed'))
  }
}

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Plain, self-contained email: the update, its link, and where to unsubscribe. */
export function renderUpdateEmail(
  update: Pick<Row, 'title' | 'body' | 'linkUrl' | 'linkLabel'>,
  ctx: { workspaceName: string; pageUrl: string }
): { subject: string; html: string; text: string } {
  const subject = `${ctx.workspaceName} Trust & Security: ${update.title}`
  const paragraphs = update.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const link = update.linkUrl
    ? `<p style="margin:0 0 12px"><a href="${escape(update.linkUrl)}">${escape(update.linkLabel || update.linkUrl)}</a></p>`
    : ''
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">` +
    `<h1 style="font-size:18px;margin:0 0 12px">${escape(update.title)}</h1>${paragraphs}${link}` +
    `<p style="margin:24px 0 0;font-size:13px;color:#555">You get these because you subscribed on ` +
    `<a href="${escape(ctx.pageUrl)}">${escape(ctx.workspaceName)} Trust &amp; Security</a>. ` +
    `Unsubscribe there at any time.</p></div>`
  const text = [
    update.title,
    '',
    update.body,
    ...(update.linkUrl ? ['', `${update.linkLabel || 'Link'}: ${update.linkUrl}`] : []),
    '',
    `You get these because you subscribed on ${ctx.workspaceName} Trust & Security.`,
    `Unsubscribe at ${ctx.pageUrl}`,
  ].join('\n')
  return { subject, html, text }
}
