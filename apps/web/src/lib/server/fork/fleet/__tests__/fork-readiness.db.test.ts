import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
// oxlint-disable-next-line no-restricted-imports -- integration test exercises the real migration executor
import { runMigrations } from '@quackback/db/migrate'
import { missingForkRequirements, forkCatalogueReceipt } from '@quackback/db/fork/readiness'
// oxlint-disable-next-line no-restricted-imports -- compare the real upstream ledger before and after
import { readAppliedLedger } from '@quackback/db/schema-version'
vi.mock('@/lib/server/workspaces/pool-cache', () => ({ resolveWorkspacePassword: async () => '' }))
import { migrateDirect } from '@/lib/server/fleet/migrator'
import { ensureWorkspaceSchemaCurrent } from '@/lib/server/fleet/ensure-schema-current'
const dsn = process.env.FORK_REVIEW_DATABASE_URL
// This suite deliberately removes fork tables. Only an explicit disposable DB is allowed.
if (
  dsn &&
  (!['127.0.0.1', 'localhost'].includes(new URL(dsn).hostname) ||
    !new URL(dsn).pathname.endsWith('_review'))
)
  throw new Error('Use a disposable local *_review database')
const sql = dsn ? postgres(dsn, { max: 1, onnotice: () => {} }) : null

describe.skipIf(!dsn)('fork release readiness on a real database', () => {
  beforeAll(async () => {
    await runMigrations(dsn)
  }, 180_000)
  afterAll(async () => {
    await sql?.end()
  })
  it('repairs an upstream-current tenant with no fork lineage through serving catch-up', async () => {
    const before = await readAppliedLedger(sql!)
    await sql!.unsafe(
      'DROP TABLE fork_announcements, fork_announcement_revision, fork_settings CASCADE'
    )
    await sql!.unsafe('DROP TABLE drizzle.__fork_migrations')
    expect(await missingForkRequirements(sql!)).not.toEqual([])
    await ensureWorkspaceSchemaCurrent({
      workspaceKey: 'review',
      sql: sql!,
      directConnectionString: dsn!,
    })
    expect(await missingForkRequirements(sql!)).toEqual([])
    expect(await readAppliedLedger(sql!)).toEqual(before)
  }, 180_000)
  it('reconciles a fork-only permission release without losing populated fork settings', async () => {
    await sql!`INSERT INTO fork_settings (key, value) VALUES ('review-retain', '{"retained":true}')`
    await sql!`DELETE FROM fork_settings WHERE key = ${forkCatalogueReceipt()}`
    // Simulate a previous catalogue without the newly introduced permission.
    await sql!`DELETE FROM permissions WHERE key = 'announcement.manage'`
    const outcome = await migrateDirect('review', dsn!, { skipConcurrentIndexes: true })
    expect(outcome.ok).toBe(true)
    expect(await missingForkRequirements(sql!)).toEqual([])
    expect(await sql!`SELECT key FROM permissions WHERE key = 'announcement.manage'`).toHaveLength(
      1
    )
    expect(await sql!`SELECT value FROM fork_settings WHERE key = 'review-retain'`).toHaveLength(1)
  }, 180_000)
  it('is idempotent once both lineages and the catalogue are ready', async () => {
    const result = await migrateDirect('review', dsn!)
    expect(result.code).toBe('already_current')
  }, 180_000)
  it('refuses an earlier fork-ledger hole instead of silently skipping it', async () => {
    await sql!.unsafe(
      'DELETE FROM drizzle.__fork_migrations WHERE created_at = (SELECT min(created_at) FROM drizzle.__fork_migrations)'
    )
    const result = await migrateDirect('review', dsn!, { skipConcurrentIndexes: true })
    expect(result.ok).toBe(false)
    expect(await missingForkRequirements(sql!)).not.toEqual([])
  }, 180_000)
})
