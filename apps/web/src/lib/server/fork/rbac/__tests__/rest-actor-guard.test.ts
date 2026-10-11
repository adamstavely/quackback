/**
 * Every policy actor a REST route builds from an API key carries the key's
 * resolved permission set (seams R-8..R-10), so `can()` never falls back to the
 * Manager preset for a key made by someone on a custom role. A new upstream
 * route that builds one without it fails here at the merge.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROUTES = join(__dirname, '../../../../../routes/api/v1')

/** Audit attribution objects, not policy actors (plans/v2/10 Appendix A.3). */
const AUDIT_ONLY = new Set([
  'users/identify.ts',
  'segments/$slug.members.ts',
  'moderation/-audit.ts',
  'principals/$principalId.ts',
])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path)
    return name.endsWith('.ts') ? [path] : []
  })
}

describe('REST actors built from an API key', () => {
  it('carry the key permission set', () => {
    const offenders: string[] = []
    for (const path of files(ROUTES)) {
      const rel = relative(ROUTES, path).split('\\').join('/')
      if (AUDIT_ONLY.has(rel)) continue
      const lines = readFileSync(path, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!/^\s*role: (auth|apiAuth)\.role\b/.test(line)) return
        const block = lines.slice(Math.max(0, i - 3), i + 4).join('\n')
        if (!/permissions: (auth|apiAuth)\.permissions/.test(block))
          offenders.push(`${rel}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
