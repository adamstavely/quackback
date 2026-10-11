import type { McpAuthContext } from '@/lib/server/mcp/types'
import { permissionsForLegacyRole } from '@/lib/server/policy/permissions'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'

/**
 * Seam R-11: what each MCP resource needs from a team caller's set
 * (plans/v2/10 Appendix A.2). Boards and roadmaps are open to teammates
 * (D-R5); help-center categories keep upstream's team check. An unmapped
 * resource is denied; the coverage test fails when upstream adds one.
 *
 * `teamOnly` also closes `quackback://members` to portal users, who upstream
 * could list teammates' names and roles with only `read:feedback`.
 */
export const FORK_MCP_RESOURCE_PERMISSIONS: Readonly<
  Record<string, { key: PermissionKey | 'none'; teamOnly?: boolean }>
> = {
  'quackback://boards': { key: 'none' },
  'quackback://statuses': { key: PERMISSIONS.STATUS_VIEW },
  'quackback://tags': { key: PERMISSIONS.TAG_VIEW },
  'quackback://roadmaps': { key: 'none' },
  'quackback://members': { key: PERMISSIONS.MEMBER_VIEW, teamOnly: true },
  'quackback://help-center/categories': { key: 'none' },
}

/** An error message for a denied read, or null when the caller may read it. */
export async function forkMcpResourceGate(
  auth: McpAuthContext,
  uri: string
): Promise<string | null> {
  const rule = FORK_MCP_RESOURCE_PERMISSIONS[uri]
  const isTeam = auth.role === 'admin' || auth.role === 'member'
  if (!rule) return isTeam ? `The ${uri} resource is not available to custom roles` : null
  if (!isTeam) return rule.teamOnly ? 'This resource requires a team member' : null
  if (rule.key === 'none') return null
  // A context built without a set (a test fixture) keeps upstream's preset.
  const held = auth.permissions ?? permissionsForLegacyRole(auth.role)
  return held.has(rule.key) ? null : `Requires the '${rule.key}' permission`
}
