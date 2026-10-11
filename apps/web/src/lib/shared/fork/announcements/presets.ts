import type { AnnouncementKind } from './types'

/**
 * One preset per kind. Authors pick the kind; colour, icon, layout and the way
 * assistive technology announces it all follow from it (D-N4, D-N9). Every kind
 * is dismissible. Colours are a fixed semantic ramp, like upstream's status
 * page (`components/portal/status/status-colors.ts`), so a kind reads the same
 * in every workspace; the renderers own them.
 *
 * `role`: a critical banner is an alert (announced at once, SC 4.1.3); the rest
 * are status messages, announced politely.
 */
export interface KindPreset {
  label: string
  /** Sort rank in a feed: lower shows first. */
  rank: number
  role: 'alert' | 'status'
}

export const KIND_PRESETS: Record<AnnouncementKind, KindPreset> = {
  critical: { label: 'Incident', rank: 0, role: 'alert' },
  maintenance: { label: 'Maintenance', rank: 1, role: 'status' },
  warning: { label: 'Warning', rank: 2, role: 'status' },
  info: { label: 'Information', rank: 3, role: 'status' },
  success: { label: 'Resolved', rank: 4, role: 'status' },
}

/** Feed order: kind rank, then priority (high first), then newest. */
export function compareBannerItems(
  a: { kind: AnnouncementKind; priority: number; publishAt: string },
  b: { kind: AnnouncementKind; priority: number; publishAt: string }
): number {
  return (
    KIND_PRESETS[a.kind].rank - KIND_PRESETS[b.kind].rank ||
    b.priority - a.priority ||
    Date.parse(b.publishAt) - Date.parse(a.publishAt)
  )
}
