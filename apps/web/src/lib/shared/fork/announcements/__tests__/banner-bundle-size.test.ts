import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** The banner script loads on every page of every app that embeds it (§4.7: ≤ 10 KB gzipped). */
describe('banner.js bundle', () => {
  const file = join(import.meta.dirname, '../../../../../../../../packages/widget/dist/banner.js')

  it.skipIf(!existsSync(file))('stays under 10 KB gzipped', () => {
    expect(gzipSync(readFileSync(file)).byteLength).toBeLessThan(10 * 1024)
  })
})
