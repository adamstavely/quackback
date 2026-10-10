import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { forkFeaturesSchema } from '@/lib/shared/fork/features'
import { parseForkSetting } from '../fork-settings'

describe('parseForkSetting', () => {
  const schema = z.object({ enabled: z.boolean().default(false), limit: z.number().default(5) })

  it('reads a missing row as the defaults', () => {
    expect(parseForkSetting(schema, undefined)).toEqual({ enabled: false, limit: 5 })
  })

  it('fills keys a stored value predates', () => {
    expect(parseForkSetting(schema, { enabled: true })).toEqual({ enabled: true, limit: 5 })
  })

  it('falls back to the defaults when a stored value no longer parses', () => {
    expect(parseForkSetting(schema, { enabled: 'yes' })).toEqual({ enabled: false, limit: 5 })
  })
})

describe('fork feature flags', () => {
  it('default every flag to off', () => {
    const flags = parseForkSetting(forkFeaturesSchema, undefined)
    expect(Object.values(flags).every((on) => on === false)).toBe(true)
  })
})
