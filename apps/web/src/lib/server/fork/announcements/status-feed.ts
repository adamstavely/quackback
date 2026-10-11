import type { StatusIncidentId } from '@quackback/ids'
import { and, db, eq, gt, gte, inArray, isNull, or, statusIncidents } from '@/lib/server/db'
import { getStatusSettings } from '@/lib/server/domains/settings/settings.status'
import { isFeatureEnabled } from '@/lib/server/domains/settings/settings.service'
import { getPublicStatusIncident, isStatusAudienceGranted } from '@/lib/server/domains/status'
import type { PublicStatusIncident } from '@/lib/server/domains/status/status.types'
import type { Actor } from '@/lib/server/policy/types'
import { isStatusPagePublished } from '@/lib/shared/status-settings'
import type { AnnouncementKind, BannerItem } from '@/lib/shared/fork/announcements/types'

/** A resolved incident shows as a green "Resolved" banner for this long. */
export const RESOLVED_BANNER_MS = 60 * 60 * 1000
const CANDIDATE_LIMIT = 10

export interface StatusBanners {
  items: BannerItem[]
  /** Instants a status banner starts or ends, for the feed's `nextTransitionAt`. */
  transitions: number[]
}

const NONE: StatusBanners = { items: [], transitions: [] }

/**
 * Status-page incidents and maintenance as banners (§4.5):
 *   - an open incident: critical or major → incident, minor → warning, none → info;
 *   - maintenance in progress, or scheduled to start within the lead window → maintenance;
 *   - an incident resolved in the last hour → resolved, for the rest of that hour.
 *
 * Who sees what is the status page's own rule, not ours. The page has to be
 * published and the viewer inside its audience (the same checks as upstream's
 * `resolveStatusPageGate`), and every incident goes through upstream's
 * `getPublicStatusIncident`, which drops an incident none of whose affected
 * components the viewer can see. A banner never shows an incident the status
 * page would hide from that person.
 *
 * Cost: one id-only query on `status_incidents`, then one projection per
 * candidate. With nothing happening (the usual case) it is the single query.
 */
export async function buildStatusBanners(
  actor: Actor,
  leadHours: number,
  now: Date = new Date()
): Promise<StatusBanners> {
  const settings = await getStatusSettings()
  if (!isStatusPagePublished({ statusPage: await isFeatureEnabled('statusPage') }, settings)) {
    return NONE
  }
  if (!isStatusAudienceGranted(actor, settings)) return NONE

  const leadMs = leadHours * 60 * 60 * 1000
  const leadEnd = new Date(now.getTime() + leadMs)
  const resolvedSince = new Date(now.getTime() - RESOLVED_BANNER_MS)

  const candidates = await db
    .select({
      id: statusIncidents.id,
      kind: statusIncidents.kind,
      status: statusIncidents.status,
      scheduledStartAt: statusIncidents.scheduledStartAt,
    })
    .from(statusIncidents)
    .where(
      and(
        isNull(statusIncidents.deletedAt),
        or(
          // open incidents
          and(eq(statusIncidents.kind, 'incident'), isNull(statusIncidents.resolvedAt)),
          // incidents resolved within the last hour
          and(eq(statusIncidents.kind, 'incident'), gte(statusIncidents.resolvedAt, resolvedSince)),
          // maintenance under way
          and(
            eq(statusIncidents.kind, 'maintenance'),
            inArray(statusIncidents.status, ['in_progress', 'verifying'])
          ),
          // scheduled maintenance that has not ended (its start decides banner or transition)
          and(
            eq(statusIncidents.kind, 'maintenance'),
            eq(statusIncidents.status, 'scheduled'),
            or(isNull(statusIncidents.scheduledEndAt), gt(statusIncidents.scheduledEndAt, now))
          )
        )
      )
    )
    .limit(CANDIDATE_LIMIT * 4)

  const transitions: number[] = []
  const shown: typeof candidates = []
  for (const c of candidates) {
    const start = c.scheduledStartAt?.getTime()
    if (c.kind === 'maintenance' && c.status === 'scheduled' && start !== undefined) {
      if (start > leadEnd.getTime()) {
        // Not yet in the lead window: only the moment it enters matters.
        transitions.push(start - leadMs)
        continue
      }
    }
    shown.push(c)
  }

  const items: BannerItem[] = []
  for (const c of shown.slice(0, CANDIDATE_LIMIT)) {
    const incident = await getPublicStatusIncident(actor, c.id as StatusIncidentId)
    if (!incident) continue
    const item = statusIncidentToBanner(incident, leadMs, now)
    if (!item) continue
    items.push(item)
    if (item.expiresAt) transitions.push(Date.parse(item.expiresAt))
  }
  return { items, transitions }
}

/** Maps one visible status incident to the banner it shows as, or null if it should not show now. */
export function statusIncidentToBanner(
  incident: PublicStatusIncident,
  leadMs: number,
  now: Date
): BannerItem | null {
  const lastUpdate = incident.updates.at(-1)?.createdAt
  const updatedAt = new Date(
    Math.max(
      incident.startedAt.getTime(),
      incident.resolvedAt?.getTime() ?? 0,
      lastUpdate ? new Date(lastUpdate).getTime() : 0
    )
  ).toISOString()
  const base = {
    // Prefixed so a status item can never collide with an announcement id;
    // dismissal is keyed by id + updatedAt, so a new status update shows again.
    id: `status:${incident.id}`,
    source: 'status' as const,
    title: incident.title,
    body: null,
    link: { url: `/status/${incident.id}`, label: 'View status' },
    priority: 0,
    updatedAt,
  }

  if (incident.kind === 'incident') {
    if (incident.resolvedAt) {
      const ends = incident.resolvedAt.getTime() + RESOLVED_BANNER_MS
      if (ends <= now.getTime()) return null
      return {
        ...base,
        kind: 'success',
        publishAt: incident.resolvedAt.toISOString(),
        expiresAt: new Date(ends).toISOString(),
      }
    }
    return {
      ...base,
      kind: incidentKind(incident.impact),
      publishAt: incident.startedAt.toISOString(),
      expiresAt: null,
    }
  }

  // Maintenance: scheduled (already inside the lead window) or under way.
  const start = incident.scheduledStartAt ?? incident.startedAt
  const end = incident.scheduledEndAt
  if (end && end.getTime() <= now.getTime() && incident.status === 'scheduled') return null
  return {
    ...base,
    kind: 'maintenance',
    publishAt: new Date(Math.min(now.getTime(), start.getTime() - leadMs)).toISOString(),
    expiresAt: null,
    window: { start: start.toISOString(), end: end?.toISOString() ?? null },
  }
}

function incidentKind(impact: PublicStatusIncident['impact']): AnnouncementKind {
  switch (impact) {
    case 'critical':
    case 'major':
      return 'critical'
    case 'minor':
      return 'warning'
    case 'maintenance':
      return 'maintenance'
    default:
      return 'info'
  }
}
