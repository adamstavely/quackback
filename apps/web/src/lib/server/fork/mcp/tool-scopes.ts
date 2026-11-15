import type { McpScope } from '@/lib/server/mcp/types'

/**
 * The OAuth scope each fork MCP tool needs (seam T-21), merged into upstream's
 * `TOOL_SCOPES` so step-up challenges cover fork tools too. Kept free of other
 * imports: upstream's scope map loads it.
 */
export const FORK_MCP_TOOL_SCOPES = {
  // trust.manage is a help_center permission, whose write scope is write:article.
  set_trust_control_status: 'write:article',
} as const satisfies Record<string, McpScope>
