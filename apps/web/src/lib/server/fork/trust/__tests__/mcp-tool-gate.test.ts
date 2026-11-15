/** The controls feed over MCP (plan 70 phase 5): team callers need trust.manage. */
import { expect, it } from 'vitest'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import type { McpAuthContext } from '@/lib/server/mcp/types'
import { forkMcpToolGate } from '@/lib/server/fork/rbac/mcp-tool-gate'

const caller = (keys: PermissionKey[]): McpAuthContext => ({
  principalId: 'principal_k' as McpAuthContext['principalId'],
  name: 'Key',
  role: 'member',
  authMethod: 'api-key',
  scopes: ['write:article'],
  permissions: new Set(keys),
})

const args = { externalId: 'aws.s3', status: 'in_place' }

it('refuses set_trust_control_status without trust.manage', async () => {
  await expect(
    forkMcpToolGate(caller([PERMISSIONS.TRUST_VIEW]), 'set_trust_control_status', args)
  ).rejects.toThrow("'trust.manage'")
})

it('allows set_trust_control_status with trust.manage', async () => {
  await expect(
    forkMcpToolGate(caller([PERMISSIONS.TRUST_MANAGE]), 'set_trust_control_status', args)
  ).resolves.toBeUndefined()
})
