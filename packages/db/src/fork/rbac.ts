/**
 * Permissions the fork adds (seam F-7). `rbac-catalogue.ts` spreads these into
 * its `PERMISSIONS`, `PERMISSION_CATALOGUE` and Contributor list, so they are
 * seeded, mirrored to the client and granted exactly like upstream's own.
 *
 * Manager is "everything except WORKSPACE_ADMIN_PERMISSIONS", so it holds every
 * key here that is not added to that list (none are).
 */
export const FORK_PERMISSIONS = {
  // Announcements banner (plans/v2/60-announcements-banner.md §6)
  ANNOUNCEMENT_VIEW: 'announcement.view', // read the list, previews and templates
  ANNOUNCEMENT_MANAGE: 'announcement.manage', // create, publish, archive; config and templates
} as const

type ForkPermissionKey = (typeof FORK_PERMISSIONS)[keyof typeof FORK_PERMISSIONS]

export const FORK_PERMISSION_CATALOGUE: ReadonlyArray<{
  key: ForkPermissionKey
  category: 'status_page'
  description: string
}> = [
  {
    key: FORK_PERMISSIONS.ANNOUNCEMENT_VIEW,
    category: 'status_page',
    description: 'View announcement banners, their previews and templates',
  },
  {
    key: FORK_PERMISSIONS.ANNOUNCEMENT_MANAGE,
    category: 'status_page',
    description: 'Create, publish and archive announcement banners, and manage their settings',
  },
]

/** Contributors read announcements; publishing stays with Managers and above. */
export const FORK_CONTRIBUTOR_PERMISSIONS: readonly ForkPermissionKey[] = [
  FORK_PERMISSIONS.ANNOUNCEMENT_VIEW,
]
