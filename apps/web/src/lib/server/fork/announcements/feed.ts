import { forkAnnouncementRevision, forkAnnouncements } from '@/lib/server/fork/db'
import { and, db, eq, isNull, gt, or, sql } from '@/lib/server/db'
import { tierAllows } from '@/lib/server/policy/access'
import { isTeamActor, type Actor } from '@/lib/server/policy/types'
import { forkFeatures } from '@/lib/server/fork/settings/features'
import { compareBannerItems } from '@/lib/shared/fork/announcements/presets'
import type {
  AnnouncementAudience,
  AnnouncementKind,
  AnnouncementSurface,
  BannerItem,
} from '@/lib/shared/fork/announcements/types'

/** At most this many banners per response; the UI shows the first and "N more". */
const FEED_CAP = 5
const DEFAULT_LINK_LABEL = 'View details'

export interface BannerFeed {
  enabled: boolean
  /** Changes when the revision row is re-created (a restore); clients treat it as newer. */
  epoch: string | null
  revision: number
  /** The next instant a banner starts or ends for this viewer, so clients refetch on time without polling. */
  nextTransitionAt: string | null
  items: BannerItem[]
}

const DISABLED: BannerFeed = {
  enabled: false,
  epoch: null,
  revision: 0,
  nextTransitionAt: null,
  items: [],
}

/**
 * The banners one viewer sees on one surface (§4.4). The portal and, later,
 * the embed both read through here, so the two never disagree.
 *
 * The revision is read before the rows, so a response is never labelled newer
 * than its content; an older label only costs the client one extra refetch.
 */
export async function buildBannerFeed(
  actor: Actor,
  access: { granted: boolean },
  surface: AnnouncementSurface
): Promise<BannerFeed> {
  if (!(await forkFeatures.read()).announcements) return DISABLED

  const [rev] = await db
    .select({ epoch: forkAnnouncementRevision.epoch, revision: forkAnnouncementRevision.revision })
    .from(forkAnnouncementRevision)
    .where(eq(forkAnnouncementRevision.singleton, 1))
    .limit(1)
  const base = { enabled: true, epoch: rev?.epoch ?? null, revision: rev?.revision ?? 0 }

  // Fail closed: only signed-in people (and team members previewing) see banners.
  if (!access.granted || (actor.principalType !== 'user' && !isTeamActor(actor))) {
    return { ...base, nextTransitionAt: null, items: [] }
  }

  const now = new Date()
  // Published rows for this surface that have not ended; future starts are kept
  // only to compute when the next one begins.
  const rows = await db
    .select()
    .from(forkAnnouncements)
    .where(
      and(
        eq(forkAnnouncements.status, 'published'),
        sql`${forkAnnouncements.surfaces} @> ${JSON.stringify([surface])}::jsonb`,
        or(isNull(forkAnnouncements.expiresAt), gt(forkAnnouncements.expiresAt, now))
      )
    )

  const visible = rows.filter((row) => {
    const audience = row.audience as AnnouncementAudience
    return tierAllows(actor, audience.tier, audience.segmentIds)
  })

  const items: BannerItem[] = []
  const transitions: number[] = []
  for (const row of visible) {
    if (row.publishAt > now) {
      transitions.push(row.publishAt.getTime())
      continue
    }
    if (row.expiresAt) transitions.push(row.expiresAt.getTime())
    items.push({
      id: row.id,
      source: 'announcement',
      kind: row.kind as AnnouncementKind,
      title: row.title,
      body: row.body,
      link: row.linkUrl ? { url: row.linkUrl, label: row.linkLabel || DEFAULT_LINK_LABEL } : null,
      priority: row.priority,
      publishAt: row.publishAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    })
  }

  items.sort(compareBannerItems)
  const next = transitions.length > 0 ? new Date(Math.min(...transitions)).toISOString() : null
  return { ...base, nextTransitionAt: next, items: items.slice(0, FEED_CAP) }
}
