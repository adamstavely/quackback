import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
 * Kept cheap for every portal page. While the page renders on the server it
 * starts the feed read into the query cache, and the router's SSR query
 * integration streams the result to the browser, so the feed is never an extra
 * browser request. It uses plain `useQuery` (already in the portal bundle)
 * rather than `useSuspenseQuery`, whose separate chunk every portal page would
 * otherwise download. When announcements are off the server answers from a
 * cached flag without a query, and the banners' own UI loads only when there is
 * a banner to show.
 */
export function PortalAnnouncementsBanner(): ReactElement | null {
  return <PortalBannerFeed />
}

function PortalBannerFeed(): ReactElement | null {
  const queryClient = useQueryClient()
  const options = {
    queryKey: PORTAL_BANNER_QUERY_KEY,
    // A slower, older response must not replace newer content already shown.
    queryFn: async (): Promise<BannerFeed | null> => {
      const next = await getPortalBannerFn()
      const shown = queryClient.getQueryData<BannerFeed | null>(PORTAL_BANNER_QUERY_KEY)
      const older = next && shown && next.epoch === shown.epoch && next.revision < shown.revision
      return older ? shown : next
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // The recovery path for a lost notification, while the tab is visible.
    refetchInterval: 5 * 60_000,
  }
  // Server render only: start the read so the SSR integration streams it down.
  if (typeof window === 'undefined') void queryClient.prefetchQuery(options)
  const { data } = useQuery(options)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: PORTAL_BANNER_QUERY_KEY })
  // Live updates, only while announcements are on (no connection otherwise).
  useBannerStream(
    !!data?.enabled,
    data ? { epoch: data.epoch, revision: data.revision } : null,
    refresh
  )

  // Refetch the instant the next banner starts or ends, so scheduled ones appear on time.
  const nextTransitionAt = data?.nextTransitionAt
  useEffect(() => {
    if (!nextTransitionAt) return
    const delay = Math.max(0, Date.parse(nextTransitionAt) - Date.now()) + Math.random() * 5000
    const timer = window.setTimeout(refresh, Math.min(delay, 2 ** 31 - 1))
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh only closes over the query client
  }, [nextTransitionAt])

  // Dismissals are in localStorage, which the server cannot read: show banners after mount.
  const [mounted, setMounted] = useState(false)
  const [hasShown, setHasShown] = useState(false)
  useEffect(() => {
    if (data?.enabled && data.items.length > 0) setHasShown(true)
  }, [data])
  useEffect(() => setMounted(true), [])

  if (!mounted || (!hasShown && (!data?.enabled || data.items.length === 0))) return null
  return (
    <Suspense fallback={null}>
      <PortalBannerStrip items={data?.enabled ? data.items : []} />
    </Suspense>
  )
}
