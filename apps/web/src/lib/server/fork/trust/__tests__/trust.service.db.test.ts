/**
 * Trust & Security admin writes (plans/v2/70-trust-security.md, phase 1):
 * ordering, parents, deletes, reorder and settings, each with its audit row.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { auditLog, eq, principal, user } from '@/lib/server/db'
import { forkTrustControls } from '@/lib/server/fork/db'
import { trustItemInputSchema, type TrustItemInput } from '@/lib/shared/fork/trust/schema'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

const service = await import('../trust.service')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: forkTrustControls.id }).from(forkTrustControls).limit(0)
  },
})

if (fixture.available) {
  beforeEach(() => fixture.begin())
  afterEach(() => fixture.rollback())
  afterAll(() => fixture.close())
}

async function writer() {
  const userId = createId('user') as UserId
  const principalId = createId('principal') as PrincipalId
  await testDb
    .insert(user)
    .values({ id: userId, name: 'Admin', email: `trust-${userId}@example.com` })
  await testDb
    .insert(principal)
    .values({ id: principalId, userId, role: 'admin', type: 'user', createdAt: new Date() })
  return {
    principalId,
    audit: { userId, email: 'admin@example.com', role: 'admin' as const, type: 'user' as const },
  }
}

const save = <T>(w: Awaited<ReturnType<typeof writer>>, input: TrustItemInput) =>
  service.saveTrustItem<T & { id: string; position: number }>(w, trustItemInputSchema.parse(input))

describe.skipIf(!fixture.available)('trust service (real Postgres)', () => {
  it('adds items at the end of their list and audits each write', async () => {
    const w = await writer()
    const a = await save(w, { entity: 'subprocessor', values: sub('Alpha') })
    const b = await save(w, { entity: 'subprocessor', values: sub('Beta') })
    expect([a.position, b.position]).toEqual([0, 1])

    const rows = await testDb.select().from(auditLog).where(eq(auditLog.targetId, b.id))
    expect(rows.map((r) => [r.eventType, r.targetType])).toEqual([
      ['fork_trust.created', 'fork_trust_subprocessor'],
    ])
  })

  it('orders controls within their group, and moving one puts it at the end of the new group', async () => {
    const w = await writer()
    const g1 = await save(w, { entity: 'controlGroup', values: { name: 'Infrastructure' } })
    const g2 = await save(w, { entity: 'controlGroup', values: { name: 'Access' } })
    const c1 = await save<{ groupId: string }>(w, {
      entity: 'control',
      values: { groupId: g1.id, name: 'Backups', status: 'in_place' },
    })
    await save(w, {
      entity: 'control',
      values: { groupId: g2.id, name: 'SSO', status: 'in_place' },
    })
    expect(c1.position).toBe(0)

    const moved = await save<{ groupId: string }>(w, {
      entity: 'control',
      values: { id: c1.id, groupId: g2.id, name: 'Backups', status: 'in_progress' },
    })
    expect(moved.groupId).toBe(g2.id)
    expect(moved.position).toBe(1)
  })

  it('refuses a control in a group that does not exist', async () => {
    const w = await writer()
    await expect(
      save(w, {
        entity: 'control',
        values: { groupId: crypto.randomUUID(), name: 'Orphan', status: 'in_place' },
      })
    ).rejects.toThrow('control group')
  })

  it('keeps a document group while it has documents; a control group takes its controls', async () => {
    const w = await writer()
    const docs = await save(w, { entity: 'documentGroup', values: { name: 'Policies' } })
    await save(w, {
      entity: 'document',
      values: { groupId: docs.id, title: 'Policy', access: 'open', published: true },
    })
    await expect(service.deleteTrustItem(w, 'documentGroup', docs.id)).rejects.toThrow(
      'documents in this group'
    )

    const group = await save(w, { entity: 'controlGroup', values: { name: 'Privacy' } })
    await save(w, {
      entity: 'control',
      values: { groupId: group.id, name: 'X', status: 'in_place' },
    })
    await service.deleteTrustItem(w, 'controlGroup', group.id)
    const left = await testDb
      .select()
      .from(forkTrustControls)
      .where(eq(forkTrustControls.groupId, group.id))
    expect(left).toHaveLength(0)
  })

  it('reorders a whole list, and refuses a partial or stale one', async () => {
    const w = await writer()
    const items = []
    for (const name of ['A', 'B', 'C']) {
      items.push(await save(w, { entity: 'subprocessor', values: sub(name) }))
    }
    const [a, b, c] = items.map((i) => i.id) as [string, string, string]
    await service.reorderTrustItems(w, 'subprocessor', [c, a, b])
    const data = await service.getTrustAdminData()
    expect(data.subprocessors.map((s) => s.name)).toEqual(['C', 'A', 'B'])

    await expect(service.reorderTrustItems(w, 'subprocessor', [a, b])).rejects.toThrow(
      'list changed'
    )
  })

  it('saves page settings and turns the page on', async () => {
    const w = await writer()
    const config = await service.updateTrustConfig(w, {
      intro: 'How we protect your data.',
      contactEmail: 'security@example.com',
      policyUrl: 'https://intranet.example/policy',
      policyLabel: 'Data handling policy',
      faqCategoryId: null,
      grantDays: 14,
      controlsReviewedAt: null,
    })
    expect(config.grantDays).toBe(14)
    expect(await service.setTrustEnabled(w, true)).toBe(true)
    const data = await service.getTrustAdminData()
    expect(data.enabled).toBe(true)
    expect(data.config.contactEmail).toBe('security@example.com')
  })
})

function sub(name: string) {
  return { name, purpose: 'Email delivery', location: 'EU' }
}
