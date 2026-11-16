import type { PrincipalId } from '@quackback/ids'
import {
  forkTrustSubscriptions,
  forkTrustUpdateDeliveries,
  forkTrustUpdates,
} from '@/lib/server/fork/db'
import { and, db, desc, eq, inArray, isNull, lt, or, principal, sql, user } from '@/lib/server/db'
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
 * (plans/v2/70-trust-security.md §5, D-TS8). The first publish queues one
 * delivery per subscriber per channel (bell, email) in the same transaction,
 * claiming `notified_at` so a later publish queues nothing; the deliveries are
 * then worked off and stay visible until sent (review 2026-11-15, finding 3).
 */

type Row = typeof forkTrustUpdates.$inferSelect
type Delivery = typeof forkTrustUpdateDeliveries.$inferSelect

/** Rows claimed per round, and how long a `sending` claim holds before a crash is assumed. */
const DELIVERY_BATCH = 50
const DELIVERY_LEASE_MS = 10 * 60 * 1000

/** How many published updates the portal shows. */
const PORTAL_LIMIT = 50

/** The in-app notification type; the bell links it to /trust/updates (seam T-20). */
export const TRUST_UPDATE_NOTIFICATION = 'fork_trust_update'

type Counts = NonNullable<TrustUpdate['delivery']>

const toDto = (row: Row, delivery: Counts | null = null): TrustUpdate => ({
  id: row.id,
  title: row.title,
  body: row.body,
  linkUrl: row.linkUrl,
  linkLabel: row.linkLabel,
  status: row.status as TrustUpdate['status'],
  publishedAt: row.publishedAt?.toISOString() ?? null,
  notifiedAt: row.notifiedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
  delivery,
})

export async function getTrustUpdatesAdmin(): Promise<TrustUpdatesAdmin> {
  const [rows, [count], states] = await Promise.all([
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
    db
      .select({
        updateId: forkTrustUpdateDeliveries.updateId,
        state: forkTrustUpdateDeliveries.state,
        n: sql<number>`count(*)::int`,
      })
      .from(forkTrustUpdateDeliveries)
      .groupBy(forkTrustUpdateDeliveries.updateId, forkTrustUpdateDeliveries.state),
  ])
  const counts = new Map<string, Counts>()
  for (const s of states) {
    const c = counts.get(s.updateId) ?? { total: 0, sent: 0, pending: 0, failed: 0, skipped: 0 }
    c.total += s.n
    // A row mid-send counts as pending: it is neither done nor failed yet.
    const key = s.state === 'sending' ? 'pending' : (s.state as keyof Omit<Counts, 'total'>)
    c[key] += s.n
    counts.set(s.updateId, c)
  }
  return {
    updates: rows.map((row) => toDto(row, counts.get(row.id) ?? null)),
    subscribers: count?.n ?? 0,
  }
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
 * Publish an update. The first publish claims `notified_at` and, in the same
 * transaction, queues a delivery per active subscriber per channel; after it
 * commits, the queue is worked off. Later publishes only change the status.
 * The returned promise is that first run, for callers (and tests) that wait.
 */
export async function publishTrustUpdate(
  writer: TrustWriter,
  id: string
): Promise<{ notified: Promise<DeliveryRun> | null }> {
  const before = await load(id)
  let queued = false
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
    if (claim) {
      const subscribers = await tx
        .select({ principalId: forkTrustSubscriptions.principalId, email: user.email })
        .from(forkTrustSubscriptions)
        .innerJoin(principal, eq(principal.id, forkTrustSubscriptions.principalId))
        .leftJoin(user, eq(user.id, principal.userId))
        .where(isNull(forkTrustSubscriptions.unsubscribedAt))
      const rows = subscribers.flatMap((s) => [
        { updateId: id, principalId: s.principalId, channel: 'in_app' },
        ...(s.email ? [{ updateId: id, principalId: s.principalId, channel: 'email' }] : []),
      ])
      if (rows.length > 0) {
        await tx.insert(forkTrustUpdateDeliveries).values(rows).onConflictDoNothing()
      }
      queued = true
    }
    return published ?? null
  })
  if (!queued) return { notified: null }
  return { notified: runDeliveries(id) }
}

/**
 * Work off an update's queued deliveries again: anything pending, anything a
 * crash left mid-send, and (when asked) anything that failed. For the admin's
 * Retry button; runs in the background like the first run.
 */
export async function retryTrustUpdateDeliveries(
  id: string
): Promise<{ notified: Promise<DeliveryRun> }> {
  await load(id)
  return { notified: runDeliveries(id, { retryFailed: true }) }
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

export interface DeliveryRun {
  sent: number
  failed: number
  skipped: number
}

/** Never throws: a failure is recorded on its row, and the run reports counts. */
async function runDeliveries(
  updateId: string,
  opts: { retryFailed?: boolean } = {}
): Promise<DeliveryRun> {
  const run: DeliveryRun = { sent: 0, failed: 0, skipped: 0 }
  try {
    const startedAt = new Date()
    let mailer: Mailer | null | undefined
    for (;;) {
      const batch = await claimDeliveries(updateId, startedAt, opts.retryFailed ?? false)
      if (batch.length === 0) break
      const [update] = await db
        .select()
        .from(forkTrustUpdates)
        .where(eq(forkTrustUpdates.id, updateId))
      if (!update) break
      for (const delivery of batch) {
        const outcome = await deliver(update, delivery, async () => {
          if (mailer === undefined) mailer = await loadMailer(update)
          return mailer
        })
        run[outcome]++
      }
    }
  } catch (err) {
    log.error({ err, updateId }, 'trust update deliveries stopped')
  }
  return run
}

/**
 * Claim the next batch: pending rows, rows whose `sending` claim has lapsed
 * (a crash mid-send), and on a retry rows that failed before this run began
 * (so a row that fails again in this run is not picked up twice). SKIP LOCKED
 * lets a second run work alongside without taking the same rows.
 */
async function claimDeliveries(
  updateId: string,
  startedAt: Date,
  retryFailed: boolean
): Promise<Delivery[]> {
  const d = forkTrustUpdateDeliveries
  const lapsed = new Date(Date.now() - DELIVERY_LEASE_MS)
  const due = db
    .select({ id: d.id })
    .from(d)
    .where(
      and(
        eq(d.updateId, updateId),
        or(
          eq(d.state, 'pending'),
          and(eq(d.state, 'sending'), lt(d.claimedAt, lapsed)),
          retryFailed ? and(eq(d.state, 'failed'), lt(d.claimedAt, startedAt)) : undefined
        )
      )
    )
    .orderBy(d.createdAt)
    .limit(DELIVERY_BATCH)
    .for('update', { skipLocked: true })
  return db
    .update(d)
    .set({ state: 'sending', claimedAt: new Date(), attempts: sql`${d.attempts} + 1` })
    .where(inArray(d.id, due))
    .returning()
}

type Outcome = keyof DeliveryRun

async function deliver(
  update: Row,
  delivery: Delivery,
  mailer: () => Promise<Mailer | null>
): Promise<Outcome> {
  const d = forkTrustUpdateDeliveries
  const finish = (state: 'sent' | 'failed' | 'skipped', lastError: string | null = null) =>
    db
      .update(d)
      .set({ state, lastError, sentAt: state === 'sent' ? new Date() : null })
      .where(eq(d.id, delivery.id))
  try {
    // Someone who unsubscribed after the publish is not told.
    if (!(await isSubscribed(delivery.principalId))) {
      await finish('skipped', 'unsubscribed')
      return 'skipped'
    }
    if (delivery.channel === 'in_app') {
      // The notice and the row's "sent" commit together: exactly once.
      const { createNotificationsBatch } =
        await import('@/lib/server/domains/notifications/notification.service')
      type NotificationInput = Parameters<typeof createNotificationsBatch>[0][number]
      await db.transaction(async (tx) => {
        await createNotificationsBatch(
          [
            {
              principalId: delivery.principalId,
              // A fork type: stored as text, shown with the bell's default icon.
              type: TRUST_UPDATE_NOTIFICATION as NotificationInput['type'],
              title: update.title,
              body: update.body.slice(0, 200),
              metadata: { trustUpdateId: update.id },
            },
          ],
          tx
        )
        await tx
          .update(d)
          .set({ state: 'sent', lastError: null, sentAt: new Date() })
          .where(eq(d.id, delivery.id))
      })
      return 'sent'
    }
    const m = await mailer()
    if (!m) {
      await finish('skipped', 'email is not configured')
      return 'skipped'
    }
    const [to] = await db
      .select({ email: user.email })
      .from(principal)
      .innerJoin(user, eq(user.id, principal.userId))
      .where(eq(principal.id, delivery.principalId))
    if (!to?.email) {
      await finish('skipped', 'no email address')
      return 'skipped'
    }
    // The row id keys the send, so a retry after a crash past the provider's
    // acceptance is delivered once.
    const result = await m.send(`fork-trust-update-delivery:${delivery.id}`, to.email)
    if (!result.sent) {
      await finish('failed', result.reason ?? 'not sent')
      return 'failed'
    }
    await finish('sent')
    return 'sent'
  } catch (err) {
    log.warn({ err, updateId: update.id, deliveryId: delivery.id }, 'trust update delivery failed')
    const message = err instanceof Error ? err.message : String(err)
    await finish('failed', message.slice(0, 300)).catch(() => {})
    return 'failed'
  }
}

interface Mailer {
  send: (key: string, to: string) => Promise<{ sent: boolean; reason?: string }>
}

/** The rendered email and a guarded sender, or null when email is not set up. */
async function loadMailer(update: Row): Promise<Mailer | null> {
  const mail = await import('@quackback/email')
  if (!mail.isEmailConfigured()) return null
  const { assertSendingIdentityPermitted } =
    await import('@/lib/server/domains/channel-accounts/outbound-identity')
  const { buildHookContext } = await import('@/lib/server/events/hook-context')
  const context = await buildHookContext()
  const from = await assertSendingIdentityPermitted(mail.getEmailFrom())
  const { subject, html, text } = renderUpdateEmail(update, {
    workspaceName: context?.workspaceName ?? 'Quackback',
    pageUrl: `${context?.portalBaseUrl ?? ''}/trust/updates`,
  })
  return {
    send: (key, to) =>
      mail.withEmailIdempotencyKey(key, () => mail.sendRawEmail({ from, to, subject, html, text })),
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
