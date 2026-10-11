/**
 * Every MCP tool and every one of its arguments, and every MCP resource, has a
 * decision in the fork's permission rules (plans/v2/10 §4.3 items 5–6). When
 * upstream adds a tool, an argument or a resource, this fails at the merge so
 * someone decides what custom roles need for it.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerTools } from '@/lib/server/mcp/tools'
import { RESOURCE_SCOPES } from '@/lib/server/mcp/required-scope'
import { FORK_MCP_TOOL_SPECS, type McpToolSpec } from '../mcp-tool-permissions'
import { FORK_MCP_RESOURCE_PERMISSIONS } from '../mcp-resource-gate'

function registeredTools(): Map<string, string[]> {
  const tools = new Map<string, string[]>()
  const server = {
    tool: (name: string, _description: string, schema: Record<string, unknown>) => {
      tools.set(name, Object.keys(schema))
    },
  }
  registerTools(
    server as never,
    {
      principalId: 'principal_test',
      name: 'Test',
      role: 'admin',
      authMethod: 'oauth',
      scopes: [],
    } as never
  )
  return tools
}

function classifiedArgs(spec: McpToolSpec): Set<string> {
  const args = new Set<string>([
    ...Object.keys(spec.fields ?? {}),
    ...(spec.ticketsVisible ?? []),
    ...(spec.inert ?? []),
  ])
  if (spec.ownComment) args.add(spec.ownComment.arg)
  if (spec.dispatch) {
    args.add(spec.dispatch.arg)
    for (const branch of Object.values(spec.dispatch.branches)) {
      for (const arg of classifiedArgs(branch)) args.add(arg)
    }
  }
  return args
}

describe('MCP permission rules cover every tool and argument', () => {
  const tools = registeredTools()

  it('has a rule for every registered tool, and none for a tool that is gone', () => {
    expect([...tools.keys()].filter((name) => !FORK_MCP_TOOL_SPECS[name])).toEqual([])
    expect(Object.keys(FORK_MCP_TOOL_SPECS).filter((name) => !tools.has(name))).toEqual([])
  })

  it.each([...tools.entries()])('classifies every argument of %s', (name, args) => {
    const spec = FORK_MCP_TOOL_SPECS[name]
    const known = classifiedArgs(spec)
    expect(args.filter((arg) => !known.has(arg))).toEqual([])
    // and names no argument the tool does not have
    expect([...known].filter((arg) => !args.includes(arg))).toEqual([])
  })

  it('has a rule for every MCP resource', () => {
    expect(Object.keys(RESOURCE_SCOPES).sort()).toEqual(
      Object.keys(FORK_MCP_RESOURCE_PERMISSIONS).sort()
    )
  })

  it('resolves a permission set on every MCP auth path (seam R-3)', () => {
    // The gate falls back to the legacy preset only for hand-built contexts, so
    // each auth context the handler returns must carry the resolved set.
    const source = readFileSync(join(__dirname, '../../../mcp/handler.ts'), 'utf8')
    const contexts = source.match(/authMethod: '(oauth|api-key)',/g) ?? []
    const resolved =
      source.match(/permissions: (await )?(oauthMcpPermissions|keyMcpPermissions)\(/g) ?? []
    expect(contexts.length).toBeGreaterThan(0)
    expect(resolved).toHaveLength(contexts.length)
  })
})
