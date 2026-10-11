import { describe, expect, it } from 'vitest'
import { buildRailItems } from '@/components/admin/admin-sidebar'
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from '@/lib/shared/types'

/** Every product on, so every rail item is present. */
const ALL_ON = Object.fromEntries(
  Object.keys(DEFAULT_FEATURE_FLAGS).map((key) => [key, true])
) as unknown as FeatureFlags

describe('admin rail with fork items (seam F-4)', () => {
  const items = buildRailItems(ALL_ON)

  it('gives every item its own icon', () => {
    const icons = items.map((item) => item.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('puts Announcements right after Status', () => {
    const hrefs = items.map((item) => item.href)
    expect(hrefs.indexOf('/admin/announcements')).toBe(hrefs.indexOf('/admin/status') + 1)
  })
})
