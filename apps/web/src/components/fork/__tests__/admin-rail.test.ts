import { describe, expect, it } from 'vitest'
import { buildRailItems } from '@/components/admin/admin-sidebar'
import { FORK_RAIL_ITEMS, withForkRailItems } from '@/components/fork/admin-rail'
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from '@/lib/shared/types'

/** Every product on, so every rail item is present. */
const ALL_ON = Object.fromEntries(
  Object.keys(DEFAULT_FEATURE_FLAGS).map((key) => [key, true])
) as unknown as FeatureFlags

describe('admin rail with fork items (seam F-4)', () => {
  // As the sidebar renders it: upstream's items plus the fork's (seam F-4).
  const items = withForkRailItems(buildRailItems(ALL_ON), FORK_RAIL_ITEMS)

  it('gives every item its own icon', () => {
    const icons = items.map((item) => item.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('puts Announcements right after Status', () => {
    const hrefs = items.map((item) => item.href)
    expect(hrefs.indexOf('/admin/announcements')).toBe(hrefs.indexOf('/admin/status') + 1)
  })
})
