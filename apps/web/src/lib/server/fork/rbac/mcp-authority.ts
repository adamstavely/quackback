import type { PrincipalId } from '@quackback/ids'
import { permissionsForPrincipal } from '@/lib/server/policy/permissions'
import { permissionsWithinScopes } from '@/lib/shared/api-key-scopes'
import type { ApiKeyScope } from '@/lib/shared/api-key-scopes'
import type { PermissionKey } from '@/lib/shared/permissions'
import type { Role } from '@/lib/shared/roles'

/**
 * An MCP caller's permission set (seams R-3/R-4, plans/v2/10 §4.3 item 4):
 * the person's resolved set (OAuth) or the key's authority (API key, seam R-1),
 * cut down to the scopes the token or key was granted. Upstream's own
 * `resolveMcpActor` reads it as a ceiling, so the settings and navigation
 * tools tighten too.
 */
export async function oauthMcpPermissions(
  principalId: PrincipalId,
  role: Role,
  scopes: readonly ApiKeyScope[]
): Promise<ReadonlySet<PermissionKey>> {
  return withinScopes(await permissionsForPrincipal(principalId, role), scopes)
}

export function keyMcpPermissions(
  keyPermissions: ReadonlySet<PermissionKey> | undefined,
  role: Role,
  scopes: readonly ApiKeyScope[]
): ReadonlySet<PermissionKey> | undefined {
  // A hand-built auth context in a test has no resolved set; keep upstream's.
  return keyPermissions ? withinScopes(keyPermissions, scopes) : undefined
}

function withinScopes(set: ReadonlySet<PermissionKey>, scopes: readonly ApiKeyScope[]) {
  return permissionsWithinScopes(set, new Set(scopes))
}
