import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { watchConfigFile } from '../watcher'
import type { LoadResult } from '../loader'

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'config-file-watch-'))
  path = join(dir, 'config.yaml')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const validYaml = `apiVersion: quackback.io/v1
kind: QuackbackConfig
spec:
  workspace:
    name: Acme
`

describe('watchConfigFile', () => {
  it('fires onChange with the parsed config on first tick when the file exists', async () => {
    writeFileSync(path, validYaml)
    const events: unknown[] = []
    const stop = watchConfigFile(path, (r) => {
      events.push(r)
    })
    await wait(60)
    stop()
    expect(events.length).toBeGreaterThanOrEqual(1)
    const last = events[events.length - 1] as { kind: string }
    expect(last.kind).toBe('ok')
  })

  it('fires onChange with kind=absent when the file does not exist on first tick', async () => {
    const events: unknown[] = []
    const stop = watchConfigFile(path, (r) => {
      events.push(r)
    })
    await wait(60)
    stop()
    const last = events[events.length - 1] as { kind: string }
    expect(last.kind).toBe('absent')
  })

  it('dedupes consecutive identical loads (only fires onChange when content changes)', async () => {
    writeFileSync(path, validYaml)
    const events: unknown[] = []
    const stop = watchConfigFile(
      path,
      (r) => {
        events.push(r)
      },
      { pollIntervalMs: 30 }
    )
    await wait(150)
    stop()
    // First load + maybe a few polls; all identical content → only one onChange.
    expect(events.length).toBe(1)
  })

  it('fires again when an atomic replacement changes the content', async () => {
    writeFileSync(path, validYaml)
    const events: LoadResult[] = []
    const stop = watchConfigFile(
      path,
      (r) => {
        events.push(r)
      },
      { pollIntervalMs: 30 }
    )
    try {
      await vi.waitFor(() => expect(events).toHaveLength(1))
      expect(events[0]).toMatchObject({
        kind: 'ok',
        config: { spec: { workspace: { name: 'Acme' } } },
      })

      // In-place writeFileSync truncates first. An async read already in flight
      // can observe that empty intermediate file and legitimately emit an error.
      // Publish a complete file atomically so this test has exactly two states.
      const replacement = join(dir, 'replacement.yaml')
      writeFileSync(replacement, validYaml.replace('Acme', 'Different'))
      renameSync(replacement, path)
      await vi.waitFor(() => expect(events).toHaveLength(2))
      expect(events[1]).toMatchObject({
        kind: 'ok',
        config: { spec: { workspace: { name: 'Different' } } },
      })
      await wait(90)
      expect(events).toHaveLength(2)
    } finally {
      stop()
    }
  })

  it('reports an invalid state and recovers when a valid file replaces it', async () => {
    writeFileSync(path, '')
    const events: LoadResult[] = []
    const stop = watchConfigFile(
      path,
      (r) => {
        events.push(r)
      },
      { pollIntervalMs: 30 }
    )
    try {
      await vi.waitFor(() => expect(events).toHaveLength(1))
      expect(events[0]?.kind).toBe('error')
      const replacement = join(dir, 'replacement.yaml')
      writeFileSync(replacement, validYaml)
      renameSync(replacement, path)
      await vi.waitFor(() => expect(events).toHaveLength(2))
      expect(events[1]).toMatchObject({
        kind: 'ok',
        config: { spec: { workspace: { name: 'Acme' } } },
      })
    } finally {
      stop()
    }
  })

  it('serializes onChange — no concurrent invocations even with rapid changes', async () => {
    writeFileSync(path, validYaml)
    let active = 0
    let maxActive = 0
    const onChange = async () => {
      active++
      if (active > maxActive) maxActive = active
      await wait(40)
      active--
    }
    const stop = watchConfigFile(path, onChange, { pollIntervalMs: 10 })
    // Trigger several near-simultaneous changes via writes.
    await wait(20)
    writeFileSync(
      path,
      `apiVersion: quackback.io/v1\nkind: QuackbackConfig\nspec: { workspace: { name: A } }\n`
    )
    await wait(5)
    writeFileSync(
      path,
      `apiVersion: quackback.io/v1\nkind: QuackbackConfig\nspec: { workspace: { name: B } }\n`
    )
    await wait(5)
    writeFileSync(
      path,
      `apiVersion: quackback.io/v1\nkind: QuackbackConfig\nspec: { workspace: { name: C } }\n`
    )
    await wait(200)
    stop()
    // Even with multiple change triggers, onChange must never run in
    // parallel — the in-flight gate guarantees serial calls.
    expect(maxActive).toBe(1)
  })
})

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
