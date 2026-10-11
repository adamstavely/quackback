import { getTypeIdPrefix, type PostCommentId, type SegmentId, type TicketId } from '@quackback/ids'
import { db, eq, postComments } from '@/lib/server/db'
import type { McpAuthContext } from '@/lib/server/mcp/types'
import { permissionsForLegacyRole } from '@/lib/server/policy/permissions'
import type { Actor } from '@/lib/server/policy/types'
import { ForbiddenError } from '@/lib/shared/errors'
import type { PermissionKey } from '@/lib/shared/permissions'
import { FORK_MCP_TOOL_SPECS, type McpToolSpec } from './mcp-tool-permissions'

/**
 * Seam R-5: a team caller's custom role decides what each MCP tool may do,
 * argument by argument (plans/v2/10 §4.3 item 5). Runs after upstream's
 * scope / team / feature guards. Portal users (legacy role `user`) are left to
 * upstream, which already treats them as end users. A tool without a spec is
 * denied, so an upstream tool added at a merge is closed until it is mapped.
 *
 * Throws ForbiddenError naming every missing key, or the ticket service's
 * NotFoundError for a ticket outside the caller's teams.
 */
export async function forkMcpToolGate(
  auth: McpAuthContext,
  toolName: string,
  args: unknown
): Promise<void> {
  if (auth.role !== 'admin' && auth.role !== 'member') return

  const spec = FORK_MCP_TOOL_SPECS[toolName]
  if (!spec) {
    throw new ForbiddenError('FORBIDDEN', `The '${toolName}' tool is not available to custom roles`)
  }
  const values = (args ?? {}) as Record<string, unknown>
  const held = callerPermissions(auth)

  const resolved = resolveSpec(spec, values)
  if (!resolved) {
    const label = spec.dispatch?.typeIdPrefix ? 'entity type' : (spec.dispatch?.arg ?? 'request')
    throw new ForbiddenError('FORBIDDEN', `Unsupported ${label} for '${toolName}'`)
  }
  const missing = missingKeys(resolved, values, held)
  if (missing === 'no-field') {
    throw new ForbiddenError('FORBIDDEN', `'${toolName}' needs at least one field to change`)
  }

  if (spec.ownComment) {
    const commentId = values[spec.ownComment.arg] as PostCommentId | undefined
    if (commentId && !held.has(spec.ownComment.otherKey)) {
      const [row] = await db
        .select({ principalId: postComments.principalId })
        .from(postComments)
        .where(eq(postComments.id, commentId))
        .limit(1)
      if (row && row.principalId !== auth.principalId) missing.push(spec.ownComment.otherKey)
    }
  }

  if (missing.length > 0) {
    const names = [...new Set(missing)].map((key) => `'${key}'`).join(', ')
    throw new ForbiddenError('FORBIDDEN', `Requires the ${names} permission`)
  }

  for (const arg of spec.ticketsVisible ?? []) {
    const ticketId = values[arg] as TicketId | undefined
    if (!ticketId) continue
    const { assertTicketVisible } = await import('@/lib/server/domains/tickets/ticket.service')
    await assertTicketVisible(ticketId, gateActor(auth, held))
  }
}

/**
 * The caller's set, resolved once per request by the handler (seams R-3/R-4).
 * A context built without one (a test fixture) keeps upstream's preset, the
 * same fallback upstream's own `can()` uses.
 */
function callerPermissions(auth: McpAuthContext): ReadonlySet<PermissionKey> {
  return auth.permissions ?? permissionsForLegacyRole(auth.role)
}

function gateActor(auth: McpAuthContext, permissions: ReadonlySet<PermissionKey>): Actor {
  return {
    principalId: auth.principalId,
    role: auth.role,
    principalType: auth.userId ? 'user' : 'service',
    segmentIds: new Set<SegmentId>(),
    permissions,
  }
}

/** Follow `dispatch` to the branch this call selects; null when it is unknown. */
export function resolveSpec(
  spec: McpToolSpec,
  values: Record<string, unknown>
): McpToolSpec | null {
  if (!spec.dispatch) return spec
  const { arg, typeIdPrefix, branches } = spec.dispatch
  const raw = values[arg]
  let key: string | undefined
  if (raw === undefined || raw === null) {
    key = spec.dispatch.default
  } else if (typeIdPrefix) {
    try {
      key = getTypeIdPrefix(String(raw))
    } catch {
      // Not a TypeID: upstream answers with a format hint, and reads nothing.
      return { base: 'none' }
    }
  } else {
    key = String(raw)
  }
  const branch = key === undefined ? undefined : branches[key]
  return branch ? resolveSpec(branch, values) : null
}

const isSet = (value: unknown) => value !== undefined && value !== null && value !== false

/** Keys the call needs and the caller lacks, or 'no-field' when nothing would change. */
export function missingKeys(
  spec: McpToolSpec,
  values: Record<string, unknown>,
  held: ReadonlySet<PermissionKey>
): PermissionKey[] | 'no-field' {
  const required: PermissionKey[] = spec.base === 'none' ? [] : [...spec.base]
  const fields = Object.entries(spec.fields ?? {}).filter(([arg]) => isSet(values[arg]))
  if (spec.requireField && fields.length === 0) return 'no-field'
  required.push(...fields.map(([, key]) => key))
  const missing = required.filter((key) => !held.has(key))
  if (spec.anyOf && !spec.anyOf.some((key) => held.has(key))) missing.push(...spec.anyOf)
  return missing
}
