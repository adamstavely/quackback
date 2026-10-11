import type { PrincipalId } from '@quackback/ids'
import { and, db, eq, isNull, principal, principalRoleAssignments } from '@/lib/server/db'
import type { Database, Transaction } from '@/lib/server/db'
import { permissionsForPrincipal } from '@/lib/server/policy/permissions'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import type { Role } from '@/lib/shared/roles'

/**
 * What an API key may do (plans/v2/10-rbac-persona-extensions.md §4.3, seams R-1, R-2).
 *
 * Upstream gives a key its service principal's legacy preset (Manager or
 * Owner), so a key made by someone on a custom role acts as a Manager. Here a
 * key's authority is:
 *
 *   service principal's set  ∩  creator's current set (while the creator exists)
 *
 * narrowed for row scope (D-R13). The service principal's set is a copy of the
 * creator's role at creation (`copyCreatorAssignments`), so a key never gains
 * authority when its creator is later removed; the intersection means it loses
 * authority the moment its creator is demoted. Keys made before the fork have no
 * copied rows and keep the preset, capped by their creator's current set.
 * Key scopes are still checked separately, per permission, by upstream.
 */
export async function resolveKeyPermissions(input: {
  servicePrincipalId: PrincipalId
  serviceRole: Role
  createdById: PrincipalId | null
}): Promise<ReadonlySet<PermissionKey>> {
  const own = await permissionsForPrincipal(input.servicePrincipalId, input.serviceRole)
  let effective: ReadonlySet<PermissionKey> = own
  if (input.createdById) {
    const creator = await creatorPermissions(input.createdById)
    effective = new Set([...own].filter((key) => creator.has(key)))
  }
  return narrowServicePermissions(effective)
}

/** The creator's current set; a creator who is no longer a teammate holds nothing. */
async function creatorPermissions(creatorId: PrincipalId): Promise<ReadonlySet<PermissionKey>> {
  const [row] = await db
    .select({ id: principal.id, role: principal.role })
    .from(principal)
    .where(eq(principal.id, creatorId))
    .limit(1)
  if (!row || (row.role !== 'admin' && row.role !== 'member')) return new Set()
  return permissionsForPrincipal(row.id, row.role)
}

const TICKET_PREFIX = 'ticket.'
const CONVERSATION_PREFIX = 'conversation.'

/**
 * Keys act workspace-wide (upstream lets service principals past team
 * visibility filters), and a copied role cannot copy team membership. So a key
 * keeps ticket and conversation keys only when its set already reaches every
 * ticket or conversation (D-R13): a Tier 1/2 creator's key carries none.
 */
export function narrowServicePermissions(
  set: ReadonlySet<PermissionKey>
): ReadonlySet<PermissionKey> {
  const allTickets = set.has(PERMISSIONS.TICKET_VIEW_ALL)
  const allConversations = set.has(PERMISSIONS.CONVERSATION_VIEW_ALL)
  if (allTickets && allConversations) return set
  return new Set(
    [...set].filter(
      (key) =>
        (allTickets || !key.startsWith(TICKET_PREFIX)) &&
        (allConversations || !key.startsWith(CONVERSATION_PREFIX))
    )
  )
}

/**
 * Give a new key's service principal the creator's workspace-wide roles (seam
 * R-2), recorded as granted by the creator so upstream's preset healing
 * (`seedSystemData` 5a) leaves them alone. A creator with no rows rides the
 * legacy preset, and so does the key (nothing to copy).
 */
export async function copyCreatorAssignments(
  creatorId: PrincipalId,
  servicePrincipalId: PrincipalId,
  exec: Database | Transaction = db
): Promise<void> {
  const rows = await exec
    .select({ roleId: principalRoleAssignments.roleId })
    .from(principalRoleAssignments)
    .where(
      and(
        eq(principalRoleAssignments.principalId, creatorId),
        isNull(principalRoleAssignments.teamId)
      )
    )
  if (rows.length === 0) return
  await exec
    .insert(principalRoleAssignments)
    .values(
      rows.map((row) => ({
        principalId: servicePrincipalId,
        roleId: row.roleId,
        grantedByPrincipalId: creatorId,
      }))
    )
    .onConflictDoNothing()
}
