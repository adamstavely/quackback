import { createHash } from 'node:crypto'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import type { Sql } from 'postgres'
import { PERMISSION_CATALOGUE, SYSTEM_ROLE_DEFS, SYSTEM_ROLE_PERMISSIONS } from '../rbac-catalogue'
import { FORK_MIGRATIONS_DIR, FORK_MIGRATIONS_SCHEMA, FORK_MIGRATIONS_TABLE } from './migrate'

/** Immutable per-release receipts let older replicas coexist with an expanded schema. */
export function forkCatalogueReceipt(): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([PERMISSION_CATALOGUE, SYSTEM_ROLE_DEFS, SYSTEM_ROLE_PERMISSIONS]))
    .digest('hex')
  return `migration.catalogue.${hash}`
}

/** Reads actual tenant state, never the control registry's belief about it. */
export async function missingForkRequirements(sql: Sql): Promise<string[]> {
  const bundled = readMigrationFiles({ migrationsFolder: FORK_MIGRATIONS_DIR })
  const [tables] = await sql.unsafe<{ ledger: string | null; settings: string | null }[]>(
    `SELECT to_regclass('${FORK_MIGRATIONS_SCHEMA}.${FORK_MIGRATIONS_TABLE}')::text AS ledger,
            to_regclass('public.fork_settings')::text AS settings`
  )
  if (!tables?.ledger || !tables.settings) return ['fork schema']
  const applied = await sql.unsafe<{ created_at: string; hash: string }[]>(
    `SELECT created_at, hash FROM ${FORK_MIGRATIONS_SCHEMA}.${FORK_MIGRATIONS_TABLE}`
  )
  const missing = bundled
    .filter(
      (m) => !applied.some((a) => Number(a.created_at) === m.folderMillis && a.hash === m.hash)
    )
    .map((m) => `fork migration ${m.folderMillis}`)
  const rows = await sql`SELECT key FROM public.fork_settings WHERE key = ${forkCatalogueReceipt()}`
  if (rows.length === 0) missing.push('fork permission catalogue')
  return missing
}

/** Only called AFTER seedSystemData succeeds, while holding the migration lock. */
export async function recordForkCatalogue(sql: Sql): Promise<void> {
  await sql`INSERT INTO public.fork_settings (key, value)
    VALUES (${forkCatalogueReceipt()}, '{"seeded":true}'::jsonb)
    ON CONFLICT (key) DO NOTHING`
}
