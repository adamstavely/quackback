import { forkTrustControls } from '@/lib/server/fork/db'
import { db, eq } from '@/lib/server/db'
import { recordAuditEventInTransaction } from '@/lib/server/audit/log'
import { ConflictError, NotFoundError } from '@/lib/shared/errors'
import type { ControlStatus } from '@/lib/shared/fork/trust/schema'
import type { TrustWriter } from './trust.service'

/**
 * The controls feed (plans/v2/70-trust-security.md §5, phase 5): a monitoring
 * tool sets the status of the controls it owns, by their integration ID,
 * through the API or MCP. Controls an admin manages by hand are never touched.
 * Every check moves "last checked"; only a change of status is audited, so a
 * tool that reports every few minutes does not flood the audit log.
 */

export interface ControlFeedResult {
  id: string
  externalId: string
  name: string
  status: ControlStatus
  lastCheckedAt: string
  changed: boolean
}

export async function setIntegrationControlStatus(
  writer: TrustWriter & { source: 'api' | 'mcp' },
  externalId: string,
  input: { status: ControlStatus; checkedAt?: string }
): Promise<ControlFeedResult> {
  const checkedAt = input.checkedAt ? new Date(input.checkedAt) : new Date()
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(forkTrustControls)
      .where(eq(forkTrustControls.externalId, externalId))
      .for('update')
    if (!before) {
      throw new NotFoundError(
        'TRUST_CONTROL_NOT_FOUND',
        `No control has the integration ID '${externalId}'`
      )
    }
    if (before.source !== 'integration') {
      throw new ConflictError(
        'TRUST_CONTROL_MANUAL',
        'That control is managed by hand; give it an integration ID in the admin first'
      )
    }
    const changed = before.status !== input.status
    const [after] = await tx
      .update(forkTrustControls)
      .set({
        status: input.status,
        lastCheckedAt: checkedAt,
        ...(changed ? { updatedByPrincipalId: writer.principalId, updatedAt: new Date() } : {}),
      })
      .where(eq(forkTrustControls.id, before.id))
      .returning()
    if (changed) {
      await recordAuditEventInTransaction(tx, {
        event: 'fork_trust.updated',
        actor: writer.audit,
        headers: writer.headers,
        target: { type: 'fork_trust_control', id: before.id },
        before: { status: before.status },
        after: { status: input.status },
        metadata: { principalId: writer.principalId, externalId, source: writer.source },
      })
    }
    return {
      id: after!.id,
      externalId,
      name: after!.name,
      status: after!.status as ControlStatus,
      lastCheckedAt: checkedAt.toISOString(),
      changed,
    }
  })
}
