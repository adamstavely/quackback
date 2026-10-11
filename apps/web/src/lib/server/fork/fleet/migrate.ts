import { listActiveWorkspaces } from '@/lib/server/workspaces/registry'
import { listSchemaState } from '@/lib/server/fleet/schema-state'
import { migrateWorkspace, planWorkspace } from '@/lib/server/fleet/migrator'

/**
 * Explicit release pass, including upstream-current tenants which the upstream
 * lease queue intentionally excludes. Sequential to bound database wake-ups.
 * Never advances a held-back tenant's upstream lineage or acquires serving scope.
 */
export async function runForkFleetMigrations(
  options: { workspaceKey?: string; cohort?: string } = {}
) {
  const { workspaces, refused } = await listActiveWorkspaces()
  const states = await listSchemaState(options.cohort)
  const eligible = new Set(states.filter((s) => s.status !== 'blocked').map((s) => s.workspaceKey))
  const outcomes: { workspaceKey: string; ok: boolean; detail: string }[] = []
  for (const workspace of workspaces) {
    if (options.workspaceKey && workspace.workspaceKey !== options.workspaceKey) continue
    if (!eligible.has(workspace.workspaceKey)) continue
    try {
      const plan = await planWorkspace(workspace)
      if (plan.refusal || plan.replaySet.length > 0) {
        outcomes.push({
          workspaceKey: workspace.workspaceKey,
          ok: false,
          detail: 'Upstream migration required; run the approved upstream rollout first',
        })
        continue
      }
      const result = await migrateWorkspace(workspace, { skipConcurrentIndexes: true })
      outcomes.push({ workspaceKey: workspace.workspaceKey, ok: result.ok, detail: result.detail })
    } catch {
      // Connection errors can contain credentials: do not print the raw error.
      outcomes.push({
        workspaceKey: workspace.workspaceKey,
        ok: false,
        detail: 'Fork migration failed; inspect tenant migration logs',
      })
    }
  }
  const failed = outcomes.filter((o) => !o.ok).length + refused.length
  // A typo, suspended tenant or unenrolled tenant must not report a successful migration.
  return { outcomes, failed: failed + (options.workspaceKey && outcomes.length === 0 ? 1 : 0) }
}
