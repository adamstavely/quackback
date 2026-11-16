/**
 * The controls feed over MCP (plan 70 phase 5 gate), through upstream's own
 * registerTool guard: a caller without trust.manage is refused before the
 * feed runs; one with it reaches the feed.
 */
import { beforeEach, expect, it, vi } from 'vitest'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import type { McpAuthContext } from '@/lib/server/mcp/types'

const s = vi.hoisted(() => ({ calls: [] as unknown[] }))

vi.mock('@/lib/server/mcp/tool-call-audit', () => ({ recordMcpToolCall: async () => {} }))
vi.mock('../feed.service', () => ({
  setIntegrationControlStatus: async (...args: unknown[]) => {
    s.calls.push(args)
    return { id: 'c1', externalId: 'aws.s3', status: 'in_place', changed: true }
  },
}))

const { registerTrustTools } = await import('../mcp-tools')

type Callback = (args: Record<string, unknown>) => Promise<{ isError?: boolean }>

function tool(keys: PermissionKey[]): Callback {
  let callback: Callback | null = null
  const server = {
    tool: (_name: string, _d: string, _s: unknown, _a: unknown, cb: Callback) =>
      void (callback = cb),
  }
  const auth = {
    principalId: 'principal_k',
    name: 'Key',
    role: 'member',
    authMethod: 'api-key',
    scopes: ['write:article'],
    permissions: new Set(keys),
  } as unknown as McpAuthContext
  registerTrustTools(server as never, auth)
  return callback!
}

const args = { externalId: 'aws.s3', status: 'in_place' }

beforeEach(() => {
  s.calls = []
})

it('refuses set_trust_control_status without trust.manage', async () => {
  const result = await tool([PERMISSIONS.TRUST_VIEW])(args)
  expect(result.isError).toBe(true)
  expect(s.calls).toEqual([])
})

it('runs set_trust_control_status with trust.manage', async () => {
  const result = await tool([PERMISSIONS.TRUST_MANAGE])(args)
  expect(result.isError).toBeFalsy()
  expect(s.calls).toHaveLength(1)
})
