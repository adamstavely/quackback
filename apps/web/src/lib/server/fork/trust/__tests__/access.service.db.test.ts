/**
 * Requests for restricted documents (plans/v2/70-trust-security.md §5, D-TS3):
 * one open request per person per document, approvals that expire, and a
 * support request that is best effort.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { auditLog, eq, principal, user } from '@/lib/server/db'
import {
  forkTrustAccessRequests,
  forkTrustDocumentGroups,
  forkTrustDocuments,
} from '@/lib/server/fork/db'

const tickets = vi.hoisted(() => ({ fail: false, created: 0 }))

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))
vi.mock('@/lib/server/domains/tickets/requester.service', () => ({
  createMyTicket: async () => {
    if (tickets.fail) throw new Error('support tickets are off')
    tickets.created++
    return { id: `ticket_${tickets.created}` }
  },
}))
vi.mock('@/lib/server/domains/tickets/ticket-type.service', () => ({
  listTicketTypes: async () => [{ id: 'ticket_type_1', slug: 'trust-access-request' }],
  createTicketType: async () => ({ id: 'ticket_type_1' }),
}))
vi.mock('@/lib/server/domains/tickets/ticket-message.service', () => ({
  sendTicketMessage: async () => ({}),
}))
vi.mock('@/lib/server/domains/tickets/ticket-status.service', () => ({
  listTicketStatuses: async () => [{ id: 'ticket_status_closed', category: 'closed' }],
}))
vi.mock('@/lib/server/domains/tickets/ticket.service', () => ({
  setTicketStatus: async () => ({}),
}))

const access = await import('../access.service')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: forkTrustAccessRequests.id }).from(forkTrustAccessRequests).limit(0)
  },
})

if (fixture.available) {
  beforeEach(async () => {
    tickets.fail = false
    tickets.created = 0
    await fixture.begin()
    await clearTrustTables()
  })
  afterEach(() => fixture.rollback())
  afterAll(() => fixture.close())
}

async function person(role: 'admin' | 'user' = 'user') {
  const userId = createId('user') as UserId
  const principalId = createId('principal') as PrincipalId
  await testDb.insert(user).values({ id: userId, name: 'P', email: `p-${userId}@example.com` })
  await testDb
    .insert(principal)
    .values({ id: principalId, userId, role, type: 'user', createdAt: new Date() })
  return {
    principalId,
    audit: { userId, email: 'p@example.com', role, type: 'user' as const },
    actor: { principalId, role, principalType: 'user', segmentIds: new Set() } as never,
  }
}

async function doc(accessLevel: 'open' | 'restricted', withFile = true) {
  const [group] = await testDb
    .insert(forkTrustDocumentGroups)
    .values({ name: 'Reports' })
    .returning()
  const [row] = await testDb
    .insert(forkTrustDocuments)
    .values({
      groupId: group!.id,
      title: 'SOC 2 report',
      access: accessLevel,
      published: true,
      storageKey: withFile ? 'fork-trust/2026/11/x-report.pdf' : null,
      fileName: withFile ? 'report.pdf' : null,
    })
    .returning()
  return row!
}

describe.skipIf(!fixture.available)('trust access requests (real Postgres)', () => {
  it('records a request, opens a support request, and refuses a second open one', async () => {
    const requester = await person()
    const d = await doc('restricted')
    await access.requestDocumentAccess(requester, d.id, 'Vendor review')

    const [row] = await testDb.select().from(forkTrustAccessRequests)
    expect(row).toMatchObject({ state: 'pending', reason: 'Vendor review', ticketId: 'ticket_1' })
    const audits = await testDb.select().from(auditLog).where(eq(auditLog.targetId, row!.id))
    expect(audits.map((a) => a.eventType)).toEqual(['fork_trust.access_requested'])

    await expect(access.requestDocumentAccess(requester, d.id, null)).rejects.toThrow(
      'already waiting'
    )
    const states = await access.accessForViewer(requester.principalId, [d.id])
    expect(states.get(d.id)).toEqual({ state: 'pending' })
  })

  it('keeps the request when the support request cannot be opened', async () => {
    tickets.fail = true
    const requester = await person()
    const d = await doc('restricted')
    await access.requestDocumentAccess(requester, d.id, null)
    const [row] = await testDb.select().from(forkTrustAccessRequests)
    expect(row).toMatchObject({ state: 'pending', ticketId: null })
  })

  it('refuses requests for open documents and documents without a file', async () => {
    const requester = await person()
    await expect(
      access.requestDocumentAccess(requester, (await doc('open')).id, null)
    ).rejects.toThrow('does not need a request')
    await expect(
      access.requestDocumentAccess(requester, (await doc('restricted', false)).id, null)
    ).rejects.toThrow('not available')
  })

  it('grants until the approval runs out, and a revoke ends it at once', async () => {
    const requester = await person()
    const admin = await person('admin')
    const d = await doc('restricted')
    await access.requestDocumentAccess(requester, d.id, null)
    const [row] = await testDb.select().from(forkTrustAccessRequests)

    await access.decideAccessRequest(admin, row!.id, { decision: 'approve', days: 7 })
    expect(await access.hasLiveGrant(requester.principalId, d.id)).toBe(true)
    const granted = (await access.accessForViewer(requester.principalId, [d.id])).get(d.id)
    expect(granted?.state).toBe('granted')

    await expect(
      access.decideAccessRequest(admin, row!.id, { decision: 'approve' })
    ).rejects.toThrow('already been decided')

    await access.decideAccessRequest(admin, row!.id, { decision: 'revoke' })
    expect(await access.hasLiveGrant(requester.principalId, d.id)).toBe(false)

    const events = await testDb.select().from(auditLog).where(eq(auditLog.targetId, row!.id))
    expect(events.map((e) => e.eventType).sort()).toEqual(
      [
        'fork_trust.access_approved',
        'fork_trust.access_requested',
        'fork_trust.access_revoked',
      ].sort()
    )
  })

  it('shows an approval that has run out as expired, with no grant', async () => {
    const requester = await person()
    const admin = await person('admin')
    const d = await doc('restricted')
    await access.requestDocumentAccess(requester, d.id, null)
    const [row] = await testDb.select().from(forkTrustAccessRequests)
    await access.decideAccessRequest(admin, row!.id, { decision: 'approve', days: 1 })
    await testDb
      .update(forkTrustAccessRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(forkTrustAccessRequests.id, row!.id))

    expect(await access.hasLiveGrant(requester.principalId, d.id)).toBe(false)
    const listed = await access.listAccessRequests()
    expect(listed.find((r) => r.id === row!.id)?.state).toBe('expired')
  })

  it('lets someone ask again after a decline', async () => {
    const requester = await person()
    const admin = await person('admin')
    const d = await doc('restricted')
    await access.requestDocumentAccess(requester, d.id, null)
    const [row] = await testDb.select().from(forkTrustAccessRequests)
    await access.decideAccessRequest(admin, row!.id, { decision: 'decline', note: 'Not needed' })
    expect((await access.accessForViewer(requester.principalId, [d.id])).get(d.id)).toEqual({
      state: 'declined',
    })
    await access.requestDocumentAccess(requester, d.id, 'Second try')
    expect((await access.accessForViewer(requester.principalId, [d.id])).get(d.id)).toEqual({
      state: 'pending',
    })
  })
})

/** Start each test from empty trust tables (inside the test's rolled-back transaction). */
async function clearTrustTables() {
  const t = await import('@/lib/server/fork/db')
  await testDb.delete(t.forkTrustComplianceItems)
  await testDb.delete(t.forkTrustControls)
  await testDb.delete(t.forkTrustControlGroups)
  await testDb.delete(t.forkTrustSubprocessors)
  await testDb.delete(t.forkTrustAccessRequests)
  await testDb.delete(t.forkTrustDocuments)
  await testDb.delete(t.forkTrustDocumentGroups)
}
