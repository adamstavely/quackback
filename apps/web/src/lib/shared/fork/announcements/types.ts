/** Announcement banners (plans/v2/60-announcements-banner.md). Shared by admin, portal and server. */

export const ANNOUNCEMENT_KINDS = ['info', 'warning', 'critical', 'maintenance', 'success'] as const
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number]

export const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'archived'] as const
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number]

/** Where a banner shows: the Quackback portal, and/or apps that embed the banner. */
export const ANNOUNCEMENT_SURFACES = ['portal', 'embed'] as const
export type AnnouncementSurface = (typeof ANNOUNCEMENT_SURFACES)[number]

/** "Everyone" is every signed-in employee; "segments" narrows to members of the listed segments. */
export const AUDIENCE_TIERS = ['authenticated', 'segments'] as const
export type AudienceTier = (typeof AUDIENCE_TIERS)[number]

export interface AnnouncementAudience {
  tier: AudienceTier
  segmentIds: string[]
}

/** An announcement as the admin and the server functions see it. Dates are ISO strings. */
export interface Announcement {
  id: string
  kind: AnnouncementKind
  title: string
  body: string | null
  linkUrl: string | null
  linkLabel: string | null
  status: AnnouncementStatus
  publishAt: string
  expiresAt: string | null
  priority: number
  surfaces: AnnouncementSurface[]
  audience: AnnouncementAudience
  createdAt: string
  updatedAt: string
}

/** Never stored: derived from status and the publish window at read time. */
export type AnnouncementState = 'draft' | 'scheduled' | 'live' | 'expired' | 'archived'

/** What a banner renders. Announcements and folded-in status items share it. */
export interface BannerItem {
  id: string
  source: 'announcement' | 'status'
  kind: AnnouncementKind
  title: string
  body: string | null
  link: { url: string; label: string } | null
  priority: number
  publishAt: string
  expiresAt: string | null
  updatedAt: string
}

/** What a viewer's feed read returns (§4.4). */
export interface BannerFeed {
  enabled: boolean
  /** Changes when the revision row is re-created (a restore); clients treat it as newer. */
  epoch: string | null
  revision: number
  /** The next instant a banner starts or ends for this viewer, so clients refetch on time without polling. */
  nextTransitionAt: string | null
  items: BannerItem[]
}
