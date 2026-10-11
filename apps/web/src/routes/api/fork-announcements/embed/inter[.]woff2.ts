import { createFileRoute } from '@tanstack/react-router'
import { publicWorkspaceCacheHeaders } from '@/lib/server/workspaces/http-cache'
// The platform's own Inter (the portal loads the same file through globals.css),
// inlined at build time so it is served from this instance and never fetched
// from anywhere else.
import interWoff2 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline'

/**
 * Inter for the embedded banner (plans/v2/60 §4.2): banners always render in
 * Inter, and the apps that embed them may not have it. `FontFace` loads are
 * CORS-mode, hence `Access-Control-Allow-Origin: *`.
 */
export const Route = createFileRoute('/api/fork-announcements/embed/inter.woff2')({
  server: {
    handlers: {
      GET: () => {
        const base64 = (interWoff2 as string).slice((interWoff2 as string).indexOf(',') + 1)
        return new Response(Buffer.from(base64, 'base64') as BodyInit, {
          headers: {
            'Content-Type': 'font/woff2',
            'Access-Control-Allow-Origin': '*',
            ...publicWorkspaceCacheHeaders(7 * 24 * 60 * 60),
          },
        })
      },
    },
  },
})
