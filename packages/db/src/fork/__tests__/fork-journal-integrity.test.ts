import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The fork lineage follows upstream's journal discipline (see
 * `migration-journal-integrity.test.ts`): the migrator runs every entry whose
 * `when` is above the ledger's newest, so an out-of-order `when` is silently
 * skipped on an upgraded database. Plus the fork's own schema rules
 * (conventions §3.5): fork tables are `fork_`-prefixed and fork SQL never
 * alters an upstream table.
 */

const FORK_DIR = join(import.meta.dirname, '../../../drizzle-fork')

type JournalEntry = { idx: number; when: number; tag: string }

const journal = JSON.parse(readFileSync(join(FORK_DIR, 'meta/_journal.json'), 'utf-8')) as {
  entries: JournalEntry[]
}
const sqlFiles = readdirSync(FORK_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

describe('fork migration journal', () => {
  it('numbers entries 0..n-1 with matching four-digit tag prefixes', () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i)
      expect(entry.tag.slice(0, 4)).toBe(String(i).padStart(4, '0'))
    })
  })

  it('has strictly increasing `when` values', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i]!.when).toBeGreaterThan(journal.entries[i - 1]!.when)
    }
  })

  it('has exactly one SQL file per entry', () => {
    expect(sqlFiles).toEqual(journal.entries.map((e) => `${e.tag}.sql`))
  })
})

describe('fork migration SQL', () => {
  const statements = sqlFiles.flatMap((file) =>
    readFileSync(join(FORK_DIR, file), 'utf-8')
      .split('--> statement-breakpoint')
      .map((sql) => ({ file, sql: sql.trim() }))
  )

  it('creates only fork_-prefixed tables', () => {
    for (const { file, sql } of statements) {
      for (const [, table] of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)"/gi)) {
        expect(table, file).toMatch(/^fork_/)
      }
    }
  })

  it('never alters an upstream table', () => {
    for (const { file, sql } of statements) {
      for (const [, table] of sql.matchAll(/ALTER TABLE(?: IF EXISTS)?(?: ONLY)? "([^"]+)"/gi)) {
        expect(table, file).toMatch(/^fork_/)
      }
    }
  })
})
