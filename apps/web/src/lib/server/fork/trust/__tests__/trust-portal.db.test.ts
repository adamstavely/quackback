/** The portal page's content: groups hold their own controls, in order; only public fields. */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { forkTrustControlGroups, forkTrustControls } from '@/lib/server/fork/db'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

const { buildTrustPageContent } = await import('../portal')

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

describe.skipIf(!fixture.available)('trust page content (real Postgres)', () => {
  it('puts each control under its group, in position order, without admin fields', async () => {
    const [a, b] = await testDb
      .insert(forkTrustControlGroups)
      .values([
        { name: 'Second', position: 1 },
        { name: 'First', position: 0 },
      ])
      .returning()
    await testDb.insert(forkTrustControls).values([
      { groupId: b!.id, name: 'Later', status: 'in_progress', position: 1 },
      { groupId: b!.id, name: 'Earlier', status: 'in_place', position: 0 },
      { groupId: a!.id, name: 'Other', status: 'not_applicable', position: 0 },
    ])

    const content = await buildTrustPageContent({ principalId: null } as never)
    expect(content.controlGroups.map((g) => g.name)).toEqual(['First', 'Second'])
    expect(content.controlGroups[0]!.controls).toEqual([
      expect.objectContaining({ name: 'Earlier', status: 'in_place' }),
      expect.objectContaining({ name: 'Later', status: 'in_progress' }),
    ])
    expect(Object.keys(content.controlGroups[0]!.controls[0]!).sort()).toEqual(
      ['description', 'id', 'name', 'status'].sort()
    )
    expect(content.faq).toEqual([])
  })
})
