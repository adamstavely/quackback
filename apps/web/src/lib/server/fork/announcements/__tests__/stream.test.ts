import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The stream's ordering contract (§4.6, R2-8): whenever an announcement write
 * commits relative to the stream starting, the client ends up told about the
 * newest revision, and never receives an older revision after a newer one.
 * Hooks inject the commit + publish at each gap of the start sequence.
 */

const state = vi.hoisted(() => ({
  committed: 0,
  handler: null as null | ((channel: string, message: string) => void),
}))

vi.mock('@/lib/server/fork/settings/features', () => ({
  readForkFeatures: async () => ({ announcements: true }),
}))
vi.mock('@/lib/server/fork/db', () => ({
  forkAnnouncementRevision: { epoch: 'epoch', revision: 'revision', singleton: 'singleton' },
}))
vi.mock('@/lib/server/db', () => ({
  eq: () => null,
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ epoch: 'E1', revision: state.committed }] }),
      }),
    }),
  },
}))
vi.mock('@/lib/server/realtime/pubsub', () => ({
  subscribe: async (_channels: string[], handler: (channel: string, message: string) => void) => {
    state.handler = handler
    return async () => {
      state.handler = null
    }
  },
}))
vi.mock('@/lib/server/realtime/stream-heartbeat', () => ({
  startStreamHeartbeat: () => ({ stop() {} }),
}))
vi.mock('@/lib/server/domains/api/rate-limit', () => ({ getClientIp: () => 'unknown' }))
vi.mock('@/lib/server/workspaces/workspace-context', () => ({
  getWorkspaceScope: () => null,
  runWithWorkspaceScope: (_scope: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/server/logger', () => ({ logger: { child: () => ({ warn() {}, info() {} }) } }))
vi.mock('../stream-limit', () => ({
  announcementStreamLimiter: { acquire: () => ({ ok: true, release() {} }) },
}))

const { openAnnouncementStream } = await import('../stream')

/** Commit a write (the revision bump) and publish it, as the service does after commit. */
function commitAndPublish(revision: number) {
  state.committed = revision
  state.handler?.('fork:announcements', JSON.stringify({ epoch: 'E1', rev: revision }))
}

async function framesFrom(response: Response, settle = 30): Promise<number[]> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + settle
  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), settle)),
    ])
    if (!chunk || chunk.done) break
    text += decoder.decode(chunk.value)
  }
  void reader.cancel()
  return [...text.matchAll(/event: revision\ndata: (\{[^\n]*\})/g)].map(
    ([, json]) => (JSON.parse(json!) as { rev: number }).rev
  )
}

const open = (hooks: Parameters<typeof openAnnouncementStream>[1]) =>
  openAnnouncementStream(new Request('http://acme.test/api/fork-announcements/stream'), hooks)

describe('announcement stream ordering', () => {
  beforeEach(() => {
    state.committed = 5
    state.handler = null
  })

  it('a write committed before subscribing is covered by the initial frame', async () => {
    const frames = await framesFrom(
      await open({ beforeSubscribe: async () => commitAndPublish(6) })
    )
    expect(frames.at(-1)).toBe(6)
  })

  it('a write between subscribing and the read arrives live, and is not sent twice', async () => {
    const frames = await framesFrom(await open({ afterSubscribe: async () => commitAndPublish(6) }))
    expect(frames).toEqual([6])
  })

  it('a write after the read arrives live, and the older initial frame is dropped', async () => {
    const frames = await framesFrom(
      await open({ afterInitialRead: async () => commitAndPublish(6) })
    )
    expect(frames).toEqual([6])
  })

  it('never sends an older revision after a newer one', async () => {
    const frames = await framesFrom(
      await open({
        afterInitialRead: async () => {
          commitAndPublish(8)
          state.handler?.('fork:announcements', JSON.stringify({ epoch: 'E1', rev: 7 }))
        },
      })
    )
    expect(frames).toEqual([8])
  })

  it('keeps a new-epoch live frame (a restore) and drops the older initial read', async () => {
    const frames = await framesFrom(
      await open({
        afterInitialRead: async () => {
          state.handler?.('fork:announcements', JSON.stringify({ epoch: 'E2', rev: 1 }))
        },
      })
    )
    expect(frames).toEqual([1])
  })
})
