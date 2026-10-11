import { createStreamLimiter } from '@/lib/server/realtime/stream-connection-limit'

/**
 * Concurrency gauge for announcement streams, separate from chat's
 * `streamLimiter`: every open portal tab (and, later, every app embedding the
 * banner) holds one, and sharing chat's per-workspace budget would let banner
 * viewers refuse agents' inbox and visitors' chat streams. Module state by
 * nature; registered in the module-state ledger (seam N-5).
 */
export const announcementStreamLimiter = createStreamLimiter({
  maxGlobal: 300,
  maxPerWorkspace: 200,
  maxPerIp: 20,
})
