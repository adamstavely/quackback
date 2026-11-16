import type { McpScope } from '@/lib/server/mcp/types'
import type { UntrustedSpec } from '@/lib/server/mcp/untrusted'

/**
 * What upstream's MCP tables need to know about each fork tool (seam T-21).
 * Both are spread into upstream's maps, so this file stays free of runtime
 * imports: upstream loads it.
 *
 * - `FORK_MCP_TOOL_SCOPES` joins `TOOL_SCOPES`, so OAuth step-up covers fork tools.
 * - `FORK_MCP_UNTRUSTED_TOOL_FIELDS` joins `UNTRUSTED_TOOL_FIELDS`, which names
 *   the result fields holding outside text (and defines `McpToolName`).
 */
export const FORK_MCP_TOOL_SCOPES = {
  // trust.manage is a help_center permission, whose write scope is write:article.
  set_trust_control_status: 'write:article',
} as const satisfies Record<string, McpScope>

export const FORK_MCP_UNTRUSTED_TOOL_FIELDS = {
  // Ids, a status, a timestamp and a control name an admin wrote.
  set_trust_control_status: [],
} as const satisfies Record<keyof typeof FORK_MCP_TOOL_SCOPES, UntrustedSpec>
