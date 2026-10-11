/**
 * Mirror of apps/web/src/lib/shared/fork/announcements/presets.ts (the widget
 * package cannot import the app). A test in the app asserts the two agree.
 */
export type BannerKind = 'info' | 'warning' | 'critical' | 'maintenance' | 'success'

export interface KindPreset {
  label: string
  rank: number
  role: 'alert' | 'status'
}

export const KIND_PRESETS: Record<BannerKind, KindPreset> = {
  critical: { label: 'Incident', rank: 0, role: 'alert' },
  maintenance: { label: 'Maintenance', rank: 1, role: 'status' },
  warning: { label: 'Warning', rank: 2, role: 'status' },
  info: { label: 'Information', rank: 3, role: 'status' },
  success: { label: 'Resolved', rank: 4, role: 'status' },
}
