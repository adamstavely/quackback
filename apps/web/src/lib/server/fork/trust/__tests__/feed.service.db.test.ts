/**
 * The controls feed (plans/v2/70-trust-security.md §5, phase 5 gate): only
 * controls with an integration ID change; a status change is audited, a
 * repeat check only moves "last checked".
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { auditLog, eq, principal, user } from '@/lib/server/db'
import { forkTrustControlGroups, forkTrustControls } from '@/lib/server/fork/db'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

const { setIntegrationControlStatus } = await import('../feed.service')
const { saveTrustItem } = await import('../trust.service')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: forkTrustControls.externalId }).from(forkTrustControls).limit(0)
  },
})

if (fixture.available) {
  beforeEach(async () => {
    await fixture.begin()
    await testDb.delete(forkTrustControls)
    await testDb.delete(forkTrustControlGroups)
  })
  afterEach(() => fixture.rollback())
  afterAll(() => fixture.close())
}

async function writer() {
  const userId = createId('user') as UserId
  const principalId = createId('principal') as PrincipalId
  await testDb.insert(user).values({ id: userId, name: 'K', email: `k-${userId}@example.com` })
  await testDb
    .insert(principal)
    .values({ id: principalId, userId, role: 'admin', type: 'user', createdAt: new Date() })
  return {
    principalId,
    audit: { userId, email: 'k@example.com', role: 'admin', type: 'api_key' as const },
    source: 'api' as const,
  }
}

async function controls(w: Awaited<ReturnType<typeof writer>>) {
  const [group] = await testDb.insert(forkTrustControlGroups).values({ name: 'G' }).returning()
  const fed = await saveTrustItem<{ id: string; source: string }>(w, {
    entity: 'control',
    values: {
      groupId: group!.id,
      name: 'S3 encryption',
      description: null,
      status: 'in_progress',
      externalId: 'aws.s3.encryption',
    },
  })
  const manual = await saveTrustItem<{ id: string; source: string }>(w, {
    entity: 'control',
    values: {
      groupId: group!.id,
      name: 'Training',
      description: null,
      status: 'in_place',
      externalId: null,
    },
  })
  return { group: group!, fed, manual }
}

describe.skipIf(!fixture.available)('controls feed (real Postgres)', () => {
  it('an integration ID makes a control tool-fed, and IDs are unique', async () => {
    const w = await writer()
    const { group, fed, manual } = await controls(w)
    expect(fed.source).toBe('integration')
    expect(manual.source).toBe('manual')
    await expect(
      saveTrustItem(w, {
        entity: 'control',
        values: {
          groupId: group.id,
          name: 'Copy',
          description: null,
          status: 'in_place',
          externalId: 'aws.s3.encryption',
        },
      })
    ).rejects.toThrow('already uses that integration ID')
  })

  it('sets a tool-fed control, auditing only a change of status', async () => {
    const w = await writer()
    const { fed } = await controls(w)

    const first = await setIntegrationControlStatus(w, 'aws.s3.encryption', {
      status: 'in_place',
      checkedAt: '2026-11-14T09:00:00Z',
    })
    expect(first).toMatchObject({ id: fed.id, status: 'in_place', changed: true })

    const second = await setIntegrationControlStatus(w, 'aws.s3.encryption', {
      status: 'in_place',
      checkedAt: '2026-11-14T10:00:00Z',
    })
    expect(second.changed).toBe(false)
    const [row] = await testDb
      .select()
      .from(forkTrustControls)
      .where(eq(forkTrustControls.id, fed.id))
    expect(row!.lastCheckedAt?.toISOString()).toBe('2026-11-14T10:00:00.000Z')

    const audits = await testDb.select().from(auditLog).where(eq(auditLog.targetId, fed.id))
    const fromFeed = audits.filter(
      (a) => (a.metadata as { source?: string } | null)?.source === 'api'
    )
    expect(fromFeed).toHaveLength(1)
  })

  it('leaves hand-kept controls alone and reports unknown IDs', async () => {
    const w = await writer()
    const { manual } = await controls(w)
    await testDb
      .update(forkTrustControls)
      .set({ externalId: 'legacy.id' })
      .where(eq(forkTrustControls.id, manual.id))
    await expect(
      setIntegrationControlStatus(w, 'legacy.id', { status: 'not_applicable' })
    ).rejects.toThrow('managed by hand')
    await expect(
      setIntegrationControlStatus(w, 'nobody.has.this', { status: 'in_place' })
    ).rejects.toThrow('No control has')
    const [row] = await testDb
      .select()
      .from(forkTrustControls)
      .where(eq(forkTrustControls.id, manual.id))
    expect(row!.status).toBe('in_place')
  })
})
