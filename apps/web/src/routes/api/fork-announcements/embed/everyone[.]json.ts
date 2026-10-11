import { createFileRoute } from '@tanstack/react-router'
import { publicWorkspaceCacheHeaders } from '@/lib/server/workspaces/http-cache'

/**
 * The identity-free banner feed for internal apps that embed the banner
 * (plans/v2/60 §4.7). Audience "Everyone" banners only, never segment-targeted
 * ones, and the same body for every caller, so it is cacheable. Reach is the
 * intranet's (network and edge SSO); the per-IP limit bounds abuse.
 *
 * Simple GET with no custom headers, so a cross-origin fetch needs no preflight.
 * The SDK always asks for `?rev=<latest revision it knows>`, so a cached body is
 * never older than the last change the stream announced.
 */
export const Route = createFileRoute('/api/fork-announcements/embed/everyone.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { enforcePerIpLimit } = await import('@/lib/server/widget/public-endpoint')
        const limited = await enforcePerIpLimit(request, {
          keyPrefix: 'fork-ann-everyone',
          limit: 120,
          windowSeconds: 60,
        })
        if (limited) return limited

        const { buildEveryoneEmbedFeed } = await import('@/lib/server/fork/announcements/embed')
        const feed = await buildEveryoneEmbedFeed()
        return Response.json(feed, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            ...publicWorkspaceCacheHeaders(30),
          },
        })
      },
    },
  },
})
