import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpAuthContext } from '@/lib/server/mcp/types'
import { registerTrustTools } from '@/lib/server/fork/trust/mcp-tools'

/**
 * The fork's MCP tools, registered after upstream's (seam T-21). Each one also
 * needs a spec in `fork/rbac/mcp-tool-permissions.ts` and a scope in
 * `./tool-scopes.ts`; the coverage tests fail without them.
 */
export function registerForkTools(server: McpServer, auth: McpAuthContext): void {
  registerTrustTools(server, auth)
}
