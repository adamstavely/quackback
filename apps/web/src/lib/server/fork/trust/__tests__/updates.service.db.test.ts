/**
 * Trust & Security updates (plans/v2/70-trust-security.md §5, phase 4 gate):
 * one email and one notification per subscriber per update, and an
 * unsubscribe is honoured.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { auditLog, eq, inAppNotifications, principal, user } from '@/lib/server/db'
import {
  forkTrustSubscriptions,
  forkTrustUpdateDeliveries,
  forkTrustUpdates,
} from '@/lib/server/fork/db'

const mail = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; html: string }[],
  keys: [] as string[],
  down: false,
}))

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))
vi.mock('@quackback/email', () => ({
  isEmailConfigured: () => true,
  getEmailFrom: () => 'Acme <noreply@example.com>',
  sendRawEmail: async (options: { to: string; subject: string; html: string }) => {
    if (mail.down) throw new Error('mail provider unavailable')
    mail.sent.push(options)
    return { sent: true }
  },
  withEmailIdempotencyKey: (key: string, fn: () => unknown) => {
    mail.keys.push(key)
    return fn()
  },
}))
vi.mock('@/lib/server/domains/channel-accounts/outbound-identity', () => ({
  assertSendingIdentityPermitted: async (from: string) => from,
}))
vi.mock('@/lib/server/events/hook-context', () => ({
  buildHookContext: async () => ({
    workspaceName: 'Acme',
    portalBaseUrl: 'https://help.example.com',
    logoUrl: null,
  }),
}))

const updates = await import('../updates.service')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: forkTrustUpdates.id }).from(forkTrustUpdates).limit(0)
  },
})

if (fixture.available) {
  beforeEach(async () => {
    mail.sent = []
    mail.keys = []
    mail.down = false
    await fixture.begin()
    await testDb.delete(forkTrustSubscriptions)
    await testDb.delete(forkTrustUpdates)
  })
  afterEach(() => fixture.rollback())
  afterAll(() => fixture.close())
}

async function person(role: 'admin' | 'user' = 'user') {
  const userId = createId('user') as UserId
  const principalId = createId('principal') as PrincipalId
  const email = `p-${userId}@example.com`
  await testDb.insert(user).values({ id: userId, name: 'P', email })
  await testDb
    .insert(principal)
    .values({ id: principalId, userId, role, type: 'user', createdAt: new Date() })
  return {
    principalId,
    email,
    audit: { userId, email, role, type: 'user' as const },
  }
}

const notificationsFor = (principalId: PrincipalId) =>
  testDb.select().from(inAppNotifications).where(eq(inAppNotifications.principalId, principalId))

describe.skipIf(!fixture.available)('trust updates (real Postgres)', () => {
  it('tells each active subscriber once, by email and in the bell', async () => {
    const admin = await person('admin')
    const alice = await person()
    const bob = await person()
    const carol = await person()
    await updates.setSubscribed(alice.principalId, true)
    await updates.setSubscribed(bob.principalId, true)
    await updates.setSubscribed(bob.principalId, false)

    const draft = await updates.saveTrustUpdate(admin, {
      title: 'New SOC 2 report',
      body: 'The 2026 report is in Documents.\n\nAsk for access there.',
      linkUrl: null,
      linkLabel: null,
    })
    expect(draft.status).toBe('draft')
    expect(await updates.listPublishedUpdates()).toEqual([])

    const first = await updates.publishTrustUpdate(admin, draft.id)
    expect(await first.notified).toEqual({ sent: 2, failed: 0, skipped: 0 })
    expect(mail.sent.map((m) => m.to)).toEqual([alice.email])
    expect(mail.sent[0]!.subject).toBe('Acme Trust & Security: New SOC 2 report')
    expect(mail.sent[0]!.html).toContain('https://help.example.com/trust/updates')
    const [bell] = await notificationsFor(alice.principalId)
    expect(bell).toMatchObject({ type: 'fork_trust_update', title: 'New SOC 2 report' })
    expect(await notificationsFor(bob.principalId)).toHaveLength(0)
    expect(await notificationsFor(carol.principalId)).toHaveLength(0)

    // Unpublish, edit and publish again: nothing more is sent.
    await updates.unpublishTrustUpdate(admin, draft.id)
    await updates.saveTrustUpdate(admin, {
      ...draft,
      title: 'SOC 2 report',
      linkUrl: null,
      linkLabel: null,
    })
    const again = await updates.publishTrustUpdate(admin, draft.id)
    expect(again.notified).toBeNull()
    expect(mail.sent).toHaveLength(1)
    expect(await notificationsFor(alice.principalId)).toHaveLength(1)

    const [published] = await updates.listPublishedUpdates()
    expect(published).toMatchObject({ id: draft.id, title: 'SOC 2 report' })

    const events = await testDb.select().from(auditLog).where(eq(auditLog.targetId, draft.id))
    expect(events.map((e) => e.eventType)).toEqual(
      expect.arrayContaining([
        'fork_trust.created',
        'fork_trust.update_published',
        'fork_trust.update_unpublished',
      ])
    )
  })

  it('escapes what admins write in the email', () => {
    const { html, text } = updates.renderUpdateEmail(
      { title: '<b>Hi</b>', body: 'a & b', linkUrl: 'https://x.test/?a=1&b="2"', linkLabel: null },
      { workspaceName: 'Acme', pageUrl: 'https://help.example.com/trust/updates' }
    )
    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;')
    expect(html).toContain('a &amp; b')
    expect(html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"')
    expect(text).toContain('Unsubscribe at https://help.example.com/trust/updates')
  })

  it('reports subscribers and lets someone resubscribe', async () => {
    const someone = await person()
    expect(await updates.isSubscribed(someone.principalId)).toBe(false)
    await updates.setSubscribed(someone.principalId, true)
    await updates.setSubscribed(someone.principalId, false)
    await updates.setSubscribed(someone.principalId, true)
    expect(await updates.isSubscribed(someone.principalId)).toBe(true)
    expect((await updates.getTrustUpdatesAdmin()).subscribers).toBe(1)
  })

  // Review 2026-11-15, finding 3: a mail outage must not lose notices for good.
  it('keeps failed emails, and sends them once when retried after recovery', async () => {
    const admin = await person('admin')
    const alice = await person()
    await updates.setSubscribed(alice.principalId, true)
    const draft = await updates.saveTrustUpdate(admin, {
      title: 'Pen test results',
      body: 'Summary is in Documents.',
      linkUrl: null,
      linkLabel: null,
    })

    mail.down = true
    const first = await updates.publishTrustUpdate(admin, draft.id)
    expect(await first.notified).toEqual({ sent: 1, failed: 1, skipped: 0 })
    expect(await notificationsFor(alice.principalId)).toHaveLength(1)
    let [counts] = (await updates.getTrustUpdatesAdmin()).updates
    expect(counts!.delivery).toMatchObject({ total: 2, sent: 1, failed: 1 })

    // Publishing again does not resend; a retry after recovery does, once.
    await updates.unpublishTrustUpdate(admin, draft.id)
    expect((await updates.publishTrustUpdate(admin, draft.id)).notified).toBeNull()
    mail.down = false
    const retried = await updates.retryTrustUpdateDeliveries(draft.id)
    expect(await retried.notified).toEqual({ sent: 1, failed: 0, skipped: 0 })
    expect(mail.sent.map((m) => m.to)).toEqual([alice.email])
    const again = await updates.retryTrustUpdateDeliveries(draft.id)
    expect(await again.notified).toEqual({ sent: 0, failed: 0, skipped: 0 })
    expect(mail.sent).toHaveLength(1)
    expect(await notificationsFor(alice.principalId)).toHaveLength(1)
    ;[counts] = (await updates.getTrustUpdatesAdmin()).updates
    expect(counts!.delivery).toMatchObject({ total: 2, sent: 2, failed: 0, pending: 0 })
  })

  it('picks up a notice a crash left mid-send, keyed by its row so the provider dedupes', async () => {
    const admin = await person('admin')
    const alice = await person()
    await updates.setSubscribed(alice.principalId, true)
    const draft = await updates.saveTrustUpdate(admin, {
      title: 'Policy update',
      body: 'New retention policy.',
      linkUrl: null,
      linkLabel: null,
    })
    mail.down = true
    await (
      await updates.publishTrustUpdate(admin, draft.id)
    ).notified
    // Simulate a process that claimed the email and died before recording it.
    await testDb
      .update(forkTrustUpdateDeliveries)
      .set({ state: 'sending', claimedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(forkTrustUpdateDeliveries.channel, 'email'))
    mail.down = false
    const run = await updates.retryTrustUpdateDeliveries(draft.id)
    expect(await run.notified).toMatchObject({ sent: 1 })
    const [row] = await testDb
      .select()
      .from(forkTrustUpdateDeliveries)
      .where(eq(forkTrustUpdateDeliveries.channel, 'email'))
    expect(row).toMatchObject({ state: 'sent', lastError: null })
    expect(mail.keys).toContain(`fork-trust-update-delivery:${row!.id}`)
  })

  it('skips someone who unsubscribed between the publish and the send', async () => {
    const admin = await person('admin')
    const alice = await person()
    await updates.setSubscribed(alice.principalId, true)
    const draft = await updates.saveTrustUpdate(admin, {
      title: 'Subprocessor change',
      body: 'We added a vendor.',
      linkUrl: null,
      linkLabel: null,
    })
    mail.down = true
    await (
      await updates.publishTrustUpdate(admin, draft.id)
    ).notified
    await updates.setSubscribed(alice.principalId, false)
    mail.down = false
    const run = await updates.retryTrustUpdateDeliveries(draft.id)
    expect(await run.notified).toEqual({ sent: 0, failed: 0, skipped: 1 })
    expect(mail.sent).toHaveLength(0)
  })
})
