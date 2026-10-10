import type { Announcement, AnnouncementState } from './types'

type Window = Pick<Announcement, 'status' | 'publishAt' | 'expiresAt'>

/** Published, started, and not yet expired. The feed query applies the same rule in SQL. */
export function isLive(a: Window, now: Date = new Date()): boolean {
  const t = now.getTime()
  return (
    a.status === 'published' &&
    Date.parse(a.publishAt) <= t &&
    (a.expiresAt === null || Date.parse(a.expiresAt) > t)
  )
}

/** The label the admin list shows: Draft, Scheduled, Live, Expired or Archived. */
export function announcementState(a: Window, now: Date = new Date()): AnnouncementState {
  if (a.status === 'draft') return 'draft'
  if (a.status === 'archived') return 'archived'
  const t = now.getTime()
  if (Date.parse(a.publishAt) > t) return 'scheduled'
  if (a.expiresAt !== null && Date.parse(a.expiresAt) <= t) return 'expired'
  return 'live'
}
