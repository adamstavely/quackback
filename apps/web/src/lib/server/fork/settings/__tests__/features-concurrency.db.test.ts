/**
 * Review 2026-11-15, finding 8: two admins toggling different fork features at
 * the same time must both win. Runs two real transactions on separate
 * connections against the test database (committing, then restoring the row),
 * because the shared rolled-back test transaction cannot interleave.
 */
import { afterAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import { createDbTestFixture } from '@/lib/server/__tests__/db-test-fixture'
import { forkSettings } from '@/lib/server/fork/db'
import { setForkFeature } from '../features'

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ key: forkSettings.key }).from(forkSettings).limit(0)
  },
})
afterAll(() => fixture.close())

describe.skipIf(!fixture.available)('fork feature toggles (two real connections)', () => {
  it('keeps both changes when two features are toggled at once', async () => {
    const url = process.env.DATABASE_URL!
    const a = postgres(url, { max: 1 })
    const b = postgres(url, { max: 1 })
    const dbA = drizzle(a)
    const dbB = drizzle(b)
    const [original] = await dbA.select().from(forkSettings).where(eq(forkSettings.key, 'features'))
    try {
      await dbA
        .insert(forkSettings)
        .values({ key: 'features', value: { trust: false, announcements: false } })
        .onConflictDoUpdate({
          target: forkSettings.key,
          set: { value: { trust: false, announcements: false } },
        })

      let second: Promise<unknown> | null = null
      await dbA.transaction(async (txA) => {
        await setForkFeature('trust', true, null, txA as never)
        // B starts while A still holds the row; it must wait, then merge.
        second = dbB.transaction((txB) => setForkFeature('announcements', true, null, txB as never))
        await new Promise((resolve) => setTimeout(resolve, 150))
      })
      await second

      const [row] = await dbA.select().from(forkSettings).where(eq(forkSettings.key, 'features'))
      expect(row!.value).toMatchObject({ trust: true, announcements: true })
    } finally {
      if (original) {
        await dbA
          .update(forkSettings)
          .set({ value: original.value })
          .where(eq(forkSettings.key, 'features'))
      } else {
        await dbA.delete(forkSettings).where(eq(forkSettings.key, 'features'))
      }
      await a.end()
      await b.end()
    }
  })
})
