import type { BannerItem } from './banner-element'

const WINDOW_START: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}
const WINDOW_END_SAME_DAY: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

/** "Oct 11, 9:00 AM – 11:00 AM", in the viewer's own locale and time zone. */
export function formatWindow(span: NonNullable<BannerItem['window']>): string {
  const start = new Date(span.start)
  const startText = start.toLocaleString(undefined, WINDOW_START)
  if (!span.end) return startText
  const end = new Date(span.end)
  const sameDay = start.toDateString() === end.toDateString()
  return `${startText} – ${end.toLocaleString(undefined, sameDay ? WINDOW_END_SAME_DAY : WINDOW_START)}`
}

/** True when `next` should replace what is shown: a higher revision, or a new epoch (a restore). */
export function isNewer(
  next: { epoch: string | null; revision: number },
  shown: { epoch: string | null; revision: number } | null
): boolean {
  if (!shown) return true
  return next.epoch !== shown.epoch || next.revision > shown.revision
}
