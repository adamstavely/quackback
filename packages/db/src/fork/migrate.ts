import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { PgDialect } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import type postgres from 'postgres'

/**
 * The fork's migration lineage (conventions §3).
 *
 * Upstream's migrator tracks one high-water `when`, so a fork migration placed
 * in upstream's folder would collide with the next upstream number and could
 * make a later upstream migration with a lower `when` skip silently. The fork
 * keeps its own folder and its own ledger instead: the same drizzle migrator,
 * pointed at `drizzle-fork/` and recording into `drizzle.__fork_migrations`.
 * The two high-water marks never meet.
 *
 * It runs after upstream's lineage, on the connection that holds upstream's
 * migration advisory lock (seam F-1 in `migrate-runtime.ts`), so fork DDL can
 * reference upstream tables and two replicas never race each other.
 */

export const FORK_MIGRATIONS_TABLE = '__fork_migrations'
export const FORK_MIGRATIONS_SCHEMA = 'drizzle'

/**
 * Where the fork SQL lives. Images set `FORK_MIGRATIONS_FOLDER` (see
 * `apps/web/Dockerfile.fork`), because a bundled migrate script cannot find the
 * folder relative to itself; in the repo it sits beside upstream's `drizzle/`.
 */
export const FORK_MIGRATIONS_DIR =
  process.env['FORK_MIGRATIONS_FOLDER']?.trim() ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle-fork')

export class ForkMigrationsFolderMissing extends Error {
  constructor(folder: string) {
    super(
      `Fork migrations folder not found at ${folder}. Build the image with ` +
        `apps/web/Dockerfile.fork, or set FORK_MIGRATIONS_FOLDER to packages/db/drizzle-fork.`
    )
    this.name = 'ForkMigrationsFolderMissing'
  }
}

export interface ForkMigrationsResult {
  /** Tags applied by this run, in order. Empty when the lineage was current. */
  applied: string[]
}

/** Applies every pending fork migration. Idempotent: a current lineage is a no-op. */
export async function runForkMigrations(
  sql: postgres.Sql,
  migrationsFolder: string = FORK_MIGRATIONS_DIR
): Promise<ForkMigrationsResult> {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json')
  // Fail closed: a deployment without the fork SQL would boot with fork tables
  // missing, and every fork read would then fail at request time instead.
  if (!existsSync(journalPath)) throw new ForkMigrationsFolderMissing(migrationsFolder)

  const migrations = readMigrationFiles({ migrationsFolder })
  const lastApplied = await forkHighWaterMark(sql)
  const pending = migrations.filter((m) => lastApplied === null || lastApplied < m.folderMillis)
  if (pending.length === 0) return { applied: [] }

  const session = drizzle(sql)._.session as unknown as Parameters<PgDialect['migrate']>[1]
  await new PgDialect().migrate(migrations, session, {
    migrationsFolder,
    migrationsTable: FORK_MIGRATIONS_TABLE,
    migrationsSchema: FORK_MIGRATIONS_SCHEMA,
  })

  const tags = journalTags(migrationsFolder)
  return { applied: pending.map((m) => tags.get(m.folderMillis) ?? String(m.folderMillis)) }
}

/** The newest `when` recorded in the fork ledger, or null before the first run. */
export async function forkHighWaterMark(sql: postgres.Sql): Promise<number | null> {
  const [ledger] = await sql.unsafe<{ ledger: string | null }[]>(
    `SELECT to_regclass('${FORK_MIGRATIONS_SCHEMA}.${FORK_MIGRATIONS_TABLE}')::text AS ledger`
  )
  if (!ledger?.ledger) return null
  const [row] = await sql.unsafe<{ created_at: string | null }[]>(
    `SELECT created_at FROM ${FORK_MIGRATIONS_SCHEMA}.${FORK_MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`
  )
  return row?.created_at == null ? null : Number(row.created_at)
}

function journalTags(migrationsFolder: string): Map<number, string> {
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  ) as { entries: { tag: string; when: number }[] }
  return new Map(journal.entries.map((e) => [e.when, e.tag]))
}
