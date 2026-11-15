import { FlagIcon, ShieldCheckIcon } from '@heroicons/react/24/solid'

/**
 * Fork areas in the admin rail (seam F-4 in `components/admin/admin-sidebar.tsx`).
 * Each item sits after the item named by `after` (upstream's, or an earlier fork item), or before Analytics
 * when that item is hidden. Fork labels are English (D-N1); `labelId` falls
 * back to `label` because the fork adds no catalogue entries.
 */
export const FORK_RAIL_ITEMS = [
  {
    label: 'Announcements',
    labelId: 'admin.nav.forkAnnouncements',
    href: '/admin/announcements',
    icon: FlagIcon,
    after: '/admin/status',
  },
  {
    label: 'Trust & Security',
    labelId: 'admin.nav.forkTrust',
    href: '/admin/trust',
    icon: ShieldCheckIcon,
    after: '/admin/announcements',
  },
]

export function withForkRailItems<T extends { href: string }>(
  items: T[],
  extra: ReadonlyArray<T & { after: string }>
): T[] {
  const result = [...items]
  for (const { after, ...item } of extra) {
    const anchor = result.findIndex((i) => i.href === after)
    const fallback = result.findIndex((i) => i.href === '/admin/analytics')
    const at = anchor >= 0 ? anchor + 1 : fallback >= 0 ? fallback : result.length
    result.splice(at, 0, item as unknown as T)
  }
  return result
}
