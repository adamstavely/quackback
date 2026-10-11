import { createFileRoute } from '@tanstack/react-router'
import { gzipSync } from 'node:zlib'
import { config } from '@/lib/server/config'
import { publicWorkspaceCacheHeaders } from '@/lib/server/workspaces/http-cache'
// Built by `bun run --filter @quackback/widget build` before the web app
// (upstream's Dockerfile does this first); the entry is seam N-3.
import bannerBundle from '../../../../../../packages/widget/dist/banner.js?raw'

const DISABLED = '/* Quackback announcement banners are off for this workspace. */'

/**
 * The script internal apps add to show announcement banners (§4.7): the
 * `<quackback-banner>` element, with this instance's URL baked in. When the
 * embed is off it is a harmless no-op, so a page that keeps the tag does not
 * break. Compressed per request; the body is small and nothing is kept between
 * requests.
 */
export const Route = createFileRoute('/api/fork-announcements/banner.js')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isEmbedAvailable } = await import('@/lib/server/fork/announcements/embed')
        const available = await isEmbedAvailable()
        const body = available
          ? `window.__QUACKBACK_BANNER__=${JSON.stringify({ url: config.baseUrl })};` +
            (bannerBundle as string)
          : DISABLED
        const headers: Record<string, string> = {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          // The body bakes in this workspace's URL, so it varies by Host (and encoding).
          ...publicWorkspaceCacheHeaders(available ? 300 : 60, 'Accept-Encoding'),
        }
        if (/\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')) {
          return new Response(gzipSync(Buffer.from(body, 'utf-8')) as BodyInit, {
            headers: { ...headers, 'Content-Encoding': 'gzip' },
          })
        }
        return new Response(body, { headers })
      },
    },
  },
})
