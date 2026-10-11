import { forkAnnouncementRevision } from '@/lib/server/fork/db'
import { db, eq } from '@/lib/server/db'
import { readForkFeatures } from '@/lib/server/fork/settings/features'
import { subscribe } from '@/lib/server/realtime/pubsub'
import { startStreamHeartbeat } from '@/lib/server/realtime/stream-heartbeat'
import { createSseStream, SSE_RESPONSE_HEADERS } from '@/lib/server/utils/sse'
import { getClientIp } from '@/lib/server/domains/api/rate-limit'
import { getWorkspaceScope, runWithWorkspaceScope } from '@/lib/server/workspaces/workspace-context'
import { logger } from '@/lib/server/logger'
import { ANNOUNCEMENTS_CHANNEL, type AnnouncementRevision } from './revision'
import { announcementStreamLimiter } from './stream-limit'

const log = logger.child({ component: 'fork-announcement-stream' })

/** Async callbacks a test injects at each gap of the start sequence. Production passes none. */
export interface AnnouncementStreamHooks {
  beforeSubscribe?: () => Promise<void>
  afterSubscribe?: () => Promise<void>
  afterInitialRead?: () => Promise<void>
}

/**
 * Server-sent events telling open portals (and later embeds) that the
 * workspace's announcements changed (§4.6). Frames carry only
 * `{ epoch, rev }`, never content, so who sees what is still decided by each
 * client's feed read; that is why the stream needs no viewer identity.
 *
 * Order matters. Subscribe first, then read and send the current revision: a
 * write that committed before the read is covered by it, and one that commits
 * after it publishes once LISTEN is active and arrives live. A frame is sent
 * only if it is newer than the last one this connection sent (or from a new
 * epoch), so out-of-order notifications never move a client backwards.
 */
export async function openAnnouncementStream(
  request: Request,
  hooks: AnnouncementStreamHooks = {}
): Promise<Response> {
  if (!(await readForkFeatures()).announcements) {
    return new Response('Not found', { status: 404 })
  }

  const clientIp = getClientIp(request.headers)
  const slot = announcementStreamLimiter.acquire(clientIp === 'unknown' ? undefined : clientIp)
  if (!slot.ok) return new Response('Too many streams', { status: 503 })

  let cleanup: () => Promise<void> = async () => {}
  const sse = createSseStream({ onCancel: () => cleanup() })
  let cleanedUp = false
  let heartbeat: { stop: () => void } | null = null
  let unsubscribe: (() => Promise<void>) | null = null
  // Per connection, not module state: the newest revision this stream has sent.
  let lastSent: AnnouncementRevision | null = null

  const sendIfNewer = (next: AnnouncementRevision) => {
    if (lastSent && lastSent.epoch === next.epoch && next.revision <= lastSent.revision) return
    lastSent = next
    sse.send('revision', { epoch: next.epoch, rev: next.revision })
  }

  // Abort and cancel run outside the request's async context; re-enter its
  // workspace scope for teardown, as the chat stream does.
  const workspaceScope = getWorkspaceScope()
  const teardown = async () => {
    if (cleanedUp) return
    cleanedUp = true
    heartbeat?.stop()
    heartbeat = null
    sse.close()
    if (unsubscribe) {
      try {
        await unsubscribe()
      } catch {
        /* already gone */
      }
    }
    slot.release()
  }
  cleanup = () => (workspaceScope ? runWithWorkspaceScope(workspaceScope, teardown) : teardown())

  const run = async () => {
    try {
      sse.sendRaw('retry: 5000\n\n')
      await hooks.beforeSubscribe?.()
      const unsub = await subscribe([ANNOUNCEMENTS_CHANNEL], (_channel, message) => {
        try {
          const frame = JSON.parse(message) as { epoch?: unknown; rev?: unknown }
          if (typeof frame.epoch === 'string' && typeof frame.rev === 'number') {
            sendIfNewer({ epoch: frame.epoch, revision: frame.rev })
          }
        } catch {
          /* not ours to interpret */
        }
      })
      // The client may have gone while subscribe() was in flight.
      if (sse.isClosed()) {
        await unsub()
        return
      }
      unsubscribe = unsub
      await hooks.afterSubscribe?.()

      const [current] = await db
        .select({
          epoch: forkAnnouncementRevision.epoch,
          revision: forkAnnouncementRevision.revision,
        })
        .from(forkAnnouncementRevision)
        .where(eq(forkAnnouncementRevision.singleton, 1))
        .limit(1)
      await hooks.afterInitialRead?.()
      // A live frame that already went out is newer than this read; the read may
      // only add a later revision in the same epoch, never revert to another one.
      if (current && (!lastSent || lastSent.epoch === current.epoch)) sendIfNewer(current)

      // Reaps tabs that stopped reading without closing the connection.
      heartbeat = startStreamHeartbeat({
        sendPing: () => (request.signal.aborted || sse.isClosed() ? 'closed' : sse.heartbeatPing()),
        onTimeout: () => void cleanup(),
      })
      if (request.signal.aborted) await cleanup()
    } catch (err) {
      log.warn({ err }, 'announcement stream start failed')
      await cleanup()
    }
  }

  request.signal.addEventListener('abort', () => void cleanup())
  if (request.signal.aborted) await cleanup()
  else void run()

  return new Response(sse.stream, {
    headers: {
      ...SSE_RESPONSE_HEADERS,
      Connection: 'keep-alive',
      // Frames carry no content and no credentials are used, so embeds on
      // internal apps can listen cross-origin without a preflight.
      'Access-Control-Allow-Origin': '*',
    },
  })
}
