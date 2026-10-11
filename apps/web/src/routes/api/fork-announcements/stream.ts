import { createFileRoute } from '@tanstack/react-router'
import { openAnnouncementStream } from '@/lib/server/fork/announcements/stream'

/** Live announcement revisions for open portals and embeds (plans/v2/60 §4.6). */
export const Route = createFileRoute('/api/fork-announcements/stream')({
  server: {
    handlers: {
      GET: async ({ request }) => openAnnouncementStream(request),
    },
  },
})
