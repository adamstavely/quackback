import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { getPortalBannerFn } from '@/lib/server/functions/fork/announcements-portal'
import type { BannerFeed } from '@/lib/shared/fork/announcements/types'
import { useBannerStream } from './use-banner-stream'

export const PORTAL_BANNER_QUERY_KEY = ['fork', 'announcements', 'portal-feed'] as const

const PortalBannerStrip = lazy(() =>
  import('./portal-banner-strip').then((m) => ({ default: m.PortalBannerStrip }))
)

/**
 * The announcement strip under the portal header (seam N-1).
 *
 * Kept cheap for every portal page. The feed is fetched while the page renders
 * on the server, so it is never an extra browser request, and when
 * announcements are off the server answers from a cached flag without a
 * query. The banners' own UI loads only when there is a banner to show.
 */
export function PortalAnnouncementsBanner(): ReactElement {
  return (
    <Suspense fallback={null}>
      <PortalBannerFeed />
    </Suspense>
  )
}

function PortalBannerFeed(): ReactElement | null {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery({
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

  const refresh = () => void queryClient.invalidateQueries({ queryKey: PORTAL_BANNER_QUERY_KEY })
  // Live updates, only while announcements are on (no connection otherwise).
  useBannerStream(data.enabled, { epoch: data.epoch, revision: data.revision }, refresh)

  // Refetch the instant the next banner starts or ends, so scheduled ones appear on time.
  const nextTransitionAt = data.nextTransitionAt
  useEffect(() => {
    if (!nextTransitionAt) return
    const delay = Math.max(0, Date.parse(nextTransitionAt) - Date.now()) + Math.random() * 5000
    const timer = window.setTimeout(refresh, Math.min(delay, 2 ** 31 - 1))
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh only closes over the query client
  }, [nextTransitionAt])

  // Dismissals are in localStorage, which the server cannot read: show banners after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted || !data.enabled || data.items.length === 0) return null
  return (
    <Suspense fallback={null}>
      <PortalBannerStrip items={data.items} />
    </Suspense>
  )
}
