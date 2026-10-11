import { useEffect, useState, type ReactElement } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortalBannerFn } from '@/lib/server/functions/fork/announcements-portal'
import type { BannerFeed, BannerItem } from '@/lib/shared/fork/announcements/types'
import { BannerBar } from './banner-bar'
import { useBannerStream } from './use-banner-stream'

export const PORTAL_BANNER_QUERY_KEY = ['fork', 'announcements', 'portal-feed'] as const

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
 * The announcement strip under the portal header (seam N-1). Shows the most
 * important banner, with the rest behind "N more". A dismissed banner stays
 * hidden until it is edited. It refetches on window focus and at the instant
 * the next banner starts or ends, so scheduled banners appear on time.
 */
export function PortalAnnouncementsBanner(): ReactElement | null {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: PORTAL_BANNER_QUERY_KEY,
    // A slower, older response must not replace newer content already shown.
    queryFn: async (): Promise<BannerFeed> => {
      const next = await getPortalBannerFn()
      const shown = queryClient.getQueryData<BannerFeed>(PORTAL_BANNER_QUERY_KEY)
      const older = shown && next.epoch === shown.epoch && next.revision < shown.revision
      return older ? shown : next
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // The recovery path for a lost notification, while the tab is visible.
    refetchInterval: 5 * 60_000,
  })

  useBannerStream(
    !!data?.enabled,
    data ? { epoch: data.epoch, revision: data.revision } : null,
    () => void queryClient.invalidateQueries({ queryKey: PORTAL_BANNER_QUERY_KEY })
  )
  // Read after mount: the server has no localStorage, so render nothing dismissed-dependent until then.
  const [dismissed, setDismissed] = useState<Record<string, string> | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => setDismissed(readDismissed()), [])

  const nextTransitionAt = data?.nextTransitionAt
  useEffect(() => {
    if (!nextTransitionAt) return
    const delay = Math.max(0, Date.parse(nextTransitionAt) - Date.now()) + Math.random() * 5000
    const timer = window.setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: PORTAL_BANNER_QUERY_KEY }),
      Math.min(delay, 2 ** 31 - 1)
    )
    return () => window.clearTimeout(timer)
  }, [nextTransitionAt, queryClient])

  if (!data?.enabled || dismissed === null) return null
  const now = Date.now()
  const items = data.items.filter(
    (item) =>
      dismissed[item.id] !== item.updatedAt &&
      (item.expiresAt === null || Date.parse(item.expiresAt) > now)
  )
  if (items.length === 0) return null

  const dismiss = (item: BannerItem) => {
    const next = { ...readDismissed(), [item.id]: item.updatedAt }
    writeDismissed(next)
    setDismissed(next)
  }

  const [first, ...rest] = items
  const shown = expanded ? items : [first!]

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
