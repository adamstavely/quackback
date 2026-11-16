/**
 * The controls feed route (plan 70 phase 5 gate): an API key without
 * `trust.manage` is refused before anything changes.
 */
import { beforeEach, expect, it, vi } from 'vitest'
import { ForbiddenError } from '@/lib/shared/errors'

const s = vi.hoisted(() => ({
  held: [] as string[],
  asked: [] as string[],
  calls: [] as unknown[],
}))

vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: async (_request: Request, options: { permission: string }) => {
    s.asked.push(options.permission)
    if (!s.held.includes(options.permission)) {
      throw new ForbiddenError('FORBIDDEN', `Requires the '${options.permission}' permission`)
    }
    return { principalId: 'principal_key', role: 'admin', principal: null }
  },
}))
vi.mock('@/lib/server/fork/trust/feed.service', () => ({
  setIntegrationControlStatus: async (...args: unknown[]) => {
    s.calls.push(args)
    return { id: 'c1', externalId: 'aws.s3', status: 'in_place', changed: true }
  },
}))

const { handleControlFeed } = await import('../$externalId')

const put = (externalId: string, body: unknown) =>
  handleControlFeed({
    request: new Request(`http://x/api/fork-trust/controls/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    params: { externalId },
  })

beforeEach(() => {
  s.held = []
  s.asked = []
  s.calls = []
})

it('refuses a key without trust.manage and changes nothing', async () => {
  s.held = ['trust.view']
  const res = await put('aws.s3', { status: 'in_place' })
  expect(res.status).toBe(403)
  expect(s.asked).toEqual(['trust.manage'])
  expect(s.calls).toEqual([])
})

it('sets the status for a key with trust.manage', async () => {
  s.held = ['trust.manage']
  const res = await put('aws.s3', { status: 'in_place', checkedAt: '2026-11-14T09:00:00Z' })
  expect(res.status).toBe(200)
  expect(s.calls).toHaveLength(1)
  const [writer, externalId, input] = s.calls[0] as [{ source: string }, string, unknown]
  expect(writer.source).toBe('api')
  expect(externalId).toBe('aws.s3')
  expect(input).toEqual({ status: 'in_place', checkedAt: '2026-11-14T09:00:00Z' })
})

it('rejects a bad status or integration ID', async () => {
  s.held = ['trust.manage']
  expect((await put('aws.s3', { status: 'done' })).status).toBe(400)
  expect((await put('bad id!', { status: 'in_place' })).status).toBe(400)
  expect(s.calls).toEqual([])
})
