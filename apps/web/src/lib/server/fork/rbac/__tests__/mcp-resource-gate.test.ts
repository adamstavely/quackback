/** Seam R-11: what each MCP resource needs from a caller's permission set. */
import { describe, expect, it } from 'vitest'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import type { McpAuthContext } from '@/lib/server/mcp/types'
import { registerResources } from '@/lib/server/mcp/server'
import { FORK_MCP_RESOURCE_PERMISSIONS, forkMcpResourceGate } from '../mcp-resource-gate'

const P = PERMISSIONS

function caller(keys: PermissionKey[], over: Partial<McpAuthContext> = {}): McpAuthContext {
  return {
    principalId: 'principal_ux' as McpAuthContext['principalId'],
    userId: 'user_ux' as McpAuthContext['userId'],
    name: 'UX',
    role: 'member',
    authMethod: 'oauth',
    scopes: [],
    permissions: new Set(keys),
    ...over,
  } as McpAuthContext
}

describe('forkMcpResourceGate', () => {
  it('needs member.view for members, and keeps portal users out of it', async () => {
    expect(await forkMcpResourceGate(caller([P.STATUS_VIEW]), 'quackback://members')).toMatch(
      'member.view'
    )
    expect(await forkMcpResourceGate(caller([P.MEMBER_VIEW]), 'quackback://members')).toBeNull()
    expect(await forkMcpResourceGate(caller([], { role: 'user' }), 'quackback://members')).toMatch(
      'team member'
    )
  })

  it('opens boards and roadmaps to every teammate (D-R5)', async () => {
    expect(await forkMcpResourceGate(caller([]), 'quackback://boards')).toBeNull()
    expect(await forkMcpResourceGate(caller([]), 'quackback://roadmaps')).toBeNull()
    expect(await forkMcpResourceGate(caller([]), 'quackback://statuses')).toMatch('status.view')
  })

  it('maps every resource upstream registers, so a new one is a decision at merge', () => {
    const uris: string[] = []
    registerResources(
      { resource: (_name: string, uri: string) => void uris.push(uri) } as never,
      caller([])
    )
    expect(uris.sort()).toEqual(Object.keys(FORK_MCP_RESOURCE_PERMISSIONS).sort())
  })
})
