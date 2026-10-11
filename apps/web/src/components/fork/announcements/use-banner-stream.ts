import { useEffect, useRef } from 'react'

export interface RevisionMark {
  epoch: string | null
  revision: number
}

const STREAM_URL = '/api/fork-announcements/stream'
/** Spreads refetches over two seconds so a broadcast does not hit the database at once. */
const MAX_JITTER_MS = 2000
/** When the server refuses a stream (its limit is reached), fall back to polling at this pace. */
const POLL_MS = 60_000

/** True when `next` is newer than what is on screen: a higher revision, or a new epoch (a restore). */
export function isNewerRevision(next: RevisionMark, applied: RevisionMark | null): boolean {
  if (!applied) return true
  return next.epoch !== applied.epoch || next.revision > applied.revision
}

/**
 * Listens for announcement revisions while the page is visible (§4.6) and
 * calls `refresh` when one is newer than `applied`, after a random delay of up
 * to two seconds. The stream closes when the tab is hidden and reopens, with a
 * refresh, when it is shown again; the stream's first frame catches anything
 * missed meanwhile. If the server refuses the stream, it polls every minute.
 */
export function useBannerStream(
  enabled: boolean,
  applied: RevisionMark | null,
  refresh: () => void
): void {
  // Read through refs so the stream is not reopened on every render.
  const appliedRef = useRef(applied)
  appliedRef.current = applied
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('EventSource' in window)) return

    let source: EventSource | null = null
    let jitter: number | undefined
    let poll: number | undefined

    const scheduleRefresh = () => {
      window.clearTimeout(jitter)
      jitter = window.setTimeout(() => refreshRef.current(), Math.random() * MAX_JITTER_MS)
    }

    const open = () => {
      if (source || document.visibilityState !== 'visible') return
      source = new EventSource(STREAM_URL)
      source.addEventListener('revision', (event) => {
        try {
          const frame = JSON.parse((event as MessageEvent<string>).data) as {
            epoch: string
            rev: number
          }
          if (isNewerRevision({ epoch: frame.epoch, revision: frame.rev }, appliedRef.current)) {
            scheduleRefresh()
          }
        } catch {
          /* ignore a malformed frame */
        }
      })
      source.addEventListener('open', () => {
        window.clearInterval(poll)
        poll = undefined
      })
      source.addEventListener('error', () => {
        // EventSource retries on its own after a dropped connection; a refused
        // one (503 at its limit, or the feature off) is closed for good.
        if (source?.readyState === EventSource.CLOSED) {
          source = null
          if (poll === undefined) poll = window.setInterval(() => refreshRef.current(), POLL_MS)
        }
      })
    }

    const close = () => {
      source?.close()
      source = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshRef.current()
        open()
      } else {
        close()
      }
    }

    open()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      close()
      window.clearTimeout(jitter)
      window.clearInterval(poll)
    }
  }, [enabled])
}
