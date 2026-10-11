import { useEffect, useState, type ReactElement } from 'react'
import type { BannerItem } from '@/lib/shared/fork/announcements/types'
import { BannerBar } from './banner-bar'

/** Dismissals live in this browser only (D-N2): banner id → the `updatedAt` dismissed. */
const DISMISSED_KEY = 'qb.banner.dismissed'

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeDismissed(next: Record<string, string>): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked (private mode, policy): the dismissal lasts for this page view.
  }
}

/**
 * The banners themselves: the most important one, with the rest behind
 * "N more". A dismissed banner stays hidden until it is edited. Loaded only
 * when there is something to show, so pages without banners never download it.
 */
export function PortalBannerStrip({ items }: { items: BannerItem[] }): ReactElement | null {
  const [dismissed, setDismissed] = useState<Record<string, string>>(readDismissed)
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Re-check expiry when the list changes (the feed refetches at each transition).
  useEffect(() => setNow(Date.now()), [items])

  const visible = items.filter(
    (item) =>
      dismissed[item.id] !== item.updatedAt &&
      (item.expiresAt === null || Date.parse(item.expiresAt) > now)
  )
  if (visible.length === 0) return null

  const dismiss = (item: BannerItem) => {
    const next = { ...readDismissed(), [item.id]: item.updatedAt }
    writeDismissed(next)
    setDismissed(next)
  }

  const [first, ...rest] = visible
  const shown = expanded ? visible : [first!]

  return (
    <section aria-label="Announcements" className="w-full">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pt-3 sm:px-6">
        {shown.map((item) => (
          <BannerBar key={item.id} item={item} onDismiss={() => dismiss(item)} />
        ))}
        {rest.length > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="self-start rounded-sm text-xs font-medium text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded
              ? 'Show fewer'
              : `${rest.length} more announcement${rest.length === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </div>
    </section>
  )
}
