import { forkTrustControls } from '@/lib/server/fork/db'
import { db, eq } from '@/lib/server/db'
import { recordAuditEventInTransaction } from '@/lib/server/audit/log'
import { ConflictError, NotFoundError, ValidationError } from '@/lib/shared/errors'
import type { ControlStatus } from '@/lib/shared/fork/trust/schema'
import type { TrustWriter } from './trust.service'

/**
 * The controls feed (plans/v2/70-trust-security.md §5, phase 5): a monitoring
 * tool sets the status of the controls it owns, by their integration ID,
 * through the API or MCP. Controls an admin manages by hand are never touched.
 * Every check moves "last checked"; only a change of status is audited, so a
 * tool that reports every few minutes does not flood the audit log.
 *
 * Reports apply in observation order, not arrival order (review 2026-11-15,
 * finding 6): one observed before the stored "last checked" is ignored
 * (`applied: false`), so a delayed healthy report cannot undo a newer failing
 * one. A report with the same timestamp applies (a resend; the later arrival
 * wins). One more than `FUTURE_SKEW_MS` ahead of this server's clock is refused.
 */

/** Clock skew allowed between the reporting tool and this server. */
const FUTURE_SKEW_MS = 5 * 60 * 1000

export interface ControlFeedResult {
  id: string
  externalId: string
  name: string
  status: ControlStatus
  lastCheckedAt: string
  changed: boolean
  /** False when the report was older than the stored check and was ignored. */
  applied: boolean
}

export async function setIntegrationControlStatus(
  writer: TrustWriter & { source: 'api' | 'mcp' },
  externalId: string,
  input: { status: ControlStatus; checkedAt?: string }
): Promise<ControlFeedResult> {
  const checkedAt = input.checkedAt ? new Date(input.checkedAt) : new Date()
  if (checkedAt.getTime() > Date.now() + FUTURE_SKEW_MS) {
    throw new ValidationError(
      'TRUST_CHECK_IN_FUTURE',
      'checkedAt is in the future; send the time the check actually ran'
    )
  }
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
    if (before.lastCheckedAt && checkedAt < before.lastCheckedAt) {
      return {
        id: before.id,
        externalId,
        name: before.name,
        status: before.status as ControlStatus,
        lastCheckedAt: before.lastCheckedAt.toISOString(),
        changed: false,
        applied: false,
      }
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
      applied: true,
    }
  })
}
