/** The portal page's content: groups hold their own controls, in order; only public fields. */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import {
  forkTrustControlGroups,
  forkTrustControls,
  forkTrustDocumentGroups,
  forkTrustDocuments,
} from '@/lib/server/fork/db'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

const { buildTrustHubSummary, buildTrustPageContent } = await import('../portal')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: forkTrustControls.id }).from(forkTrustControls).limit(0)
  },
})

if (fixture.available) {
  beforeEach(async () => {
    await fixture.begin()
    await clearTrustTables()
  })
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

describe.skipIf(!fixture.available)('trust hub summary (real Postgres)', () => {
  it('counts applicable controls and published documents that have a file', async () => {
    const [group] = await testDb.insert(forkTrustControlGroups).values({ name: 'G' }).returning()
    await testDb.insert(forkTrustControls).values([
      { groupId: group!.id, name: 'A', status: 'in_place' },
      { groupId: group!.id, name: 'B', status: 'in_place' },
      { groupId: group!.id, name: 'C', status: 'in_progress' },
      { groupId: group!.id, name: 'D', status: 'not_applicable' },
    ])
    const [docs] = await testDb.insert(forkTrustDocumentGroups).values({ name: 'R' }).returning()
    await testDb.insert(forkTrustDocuments).values([
      { groupId: docs!.id, title: 'Live', published: true, storageKey: 'fork-trust/a.pdf' },
      { groupId: docs!.id, title: 'No file', published: true },
      { groupId: docs!.id, title: 'Draft', published: false, storageKey: 'fork-trust/b.pdf' },
    ])

    const summary = await buildTrustHubSummary()
    expect(summary).toMatchObject({ controlsInPlace: 2, controlsTotal: 3, documents: 1 })
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
