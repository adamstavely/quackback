import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpAuthContext } from '@/lib/server/mcp/types'
import { jsonResult, registerTool, WRITE } from '@/lib/server/mcp/tools/helpers'
import { CONTROL_STATUSES, controlExternalIdSchema } from '@/lib/shared/fork/trust/schema'
import { FORK_MCP_TOOL_SCOPES } from '@/lib/server/fork/mcp/tool-scopes'

/**
 * The controls feed over MCP (plans/v2/70-trust-security.md §5, phase 5), the
 * twin of `PUT /api/fork-trust/controls/{externalId}`. Team callers need
 * `trust.manage` (FORK_MCP_TOOL_SPECS); the scope follows that permission's
 * category, as the REST route's does.
 */
export function registerTrustTools(server: McpServer, auth: McpAuthContext): void {
  registerTool<{
    externalId: string
    status: (typeof CONTROL_STATUSES)[number]
    checkedAt?: string
  }>(server, auth, {
    name: 'set_trust_control_status',
    description: `Set the status of a Trust & Security control that a monitoring tool owns.

The control is found by its integration ID (set by an admin on the control). Controls managed by hand cannot be changed this way. Every call records when the control was last checked; a change of status is also audited.

Examples:
- set_trust_control_status({ externalId: "aws.s3.encryption", status: "in_place" })
- set_trust_control_status({ externalId: "okta.mfa", status: "in_progress", checkedAt: "2026-11-14T09:00:00Z" })`,
    schema: {
      externalId: controlExternalIdSchema.min(1).describe('The control’s integration ID'),
      status: z.enum(CONTROL_STATUSES).describe('in_place, in_progress or not_applicable'),
      checkedAt: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe('When the check ran (ISO 8601); now if left out'),
    },
    annotations: { ...WRITE, idempotentHint: true },
    scope: FORK_MCP_TOOL_SCOPES.set_trust_control_status,
    teamOnly: true,
    handler: async (args) => {
      const { setIntegrationControlStatus } = await import('./feed.service')
      const result = await setIntegrationControlStatus(
        {
          principalId: auth.principalId,
          audit: {
            userId: auth.userId ?? null,
            email: auth.email ?? null,
            role: auth.role,
            ...(auth.authMethod === 'api-key'
              ? { type: 'api_key' as const, authMethod: 'api_key' as const }
              : { type: 'user' as const, authMethod: 'oauth' as const }),
          },
          source: 'mcp',
        },
        args.externalId,
        { status: args.status, checkedAt: args.checkedAt }
      )
      return jsonResult(result)
    },
  })
}
