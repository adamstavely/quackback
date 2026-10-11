import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { useRouterState } from '@tanstack/react-router'
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
  const sectionRef = useRef<HTMLElement>(null)
  const dismissedWithFocus = useRef(false)
  const lastFocused = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const removedFocus =
      lastFocused.current &&
      !lastFocused.current.isConnected &&
      document.activeElement === document.body
    if (!dismissedWithFocus.current && !removedFocus) return
    dismissedWithFocus.current = false
    const section = sectionRef.current
    ;(section?.querySelector<HTMLElement>('button, a') ?? section)?.focus()
  })
  const [now, setNow] = useState(() => Date.now())

  // Re-check expiry when the list changes (the feed refetches at each transition).
  useEffect(() => setNow(Date.now()), [items])

  // The status page already shows its own incidents; no banner for them there.
  const onStatusPage = useRouterState({
    select: (state) => state.location.pathname.startsWith('/status'),
  })

  const visible = items.filter(
    (item) =>
      !(onStatusPage && item.source === 'status') &&
      dismissed[item.id] !== item.updatedAt &&
      (item.expiresAt === null || Date.parse(item.expiresAt) > now)
  )
  if (visible.length === 0)
    return (
      <section
        ref={sectionRef}
        onFocusCapture={(event) => {
          lastFocused.current = event.target as HTMLElement
        }}
        onBlurCapture={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
            lastFocused.current = null
        }}
        tabIndex={-1}
        aria-label="Announcements"
        className="sr-only focus:not-sr-only focus:p-4"
      >
        <span role="status">No more announcements.</span>
      </section>
    )

  const dismiss = (item: BannerItem) => {
    dismissedWithFocus.current = !!sectionRef.current?.contains(document.activeElement)
    const next = { ...readDismissed(), ...dismissed, [item.id]: item.updatedAt }
    writeDismissed(next)
    setDismissed(next)
  }

  const [first, ...rest] = visible
  const shown = expanded ? visible : [first!]

  return (
    <section
      ref={sectionRef}
      onFocusCapture={(event) => {
        lastFocused.current = event.target as HTMLElement
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          lastFocused.current = null
      }}
      tabIndex={-1}
      aria-label="Announcements"
      className="w-full"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pt-3 sm:px-6">
        {shown.map((item) => (
          <BannerBar key={item.id} item={item} onDismiss={() => dismiss(item)} />
        ))}
        {rest.length > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="min-h-6 self-start rounded-sm text-xs font-medium text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-current"
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
