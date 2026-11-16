import type { PrincipalId } from '@quackback/ids'
import { forkSettings } from '@/lib/server/fork/db'
import { db, eq, sql, type Transaction } from '@/lib/server/db'
import { WorkspaceKeyedCache } from '@/lib/server/workspaces/workspace-keyed'
import { forkFeaturesSchema, type ForkFeature, type ForkFeatures } from '@/lib/shared/fork/features'
import { defineForkSetting, parseForkSetting } from './fork-settings'

/** The workspace's fork feature flags (`fork_settings.features`). */
export const forkFeatures = defineForkSetting('features', forkFeaturesSchema)

/**
 * How long a replica trusts its copy of the flags. Every portal page asks
 * whether announcements are on, so the answer is cached per workspace rather
 * than read on each request: a fork feature that is off must cost a page
 * nothing. A change made on this replica takes effect at once (the writer
 * calls `forgetForkFeatures`); other replicas see it within this window.
 */
const FLAGS_TTL_MS = 30_000

/** Module state by design; registered in the module-state ledger (seam N-5). */
const flagsCache = new WorkspaceKeyedCache<{ value: ForkFeatures; at: number }>(1_024)

/** The flags for hot paths (every portal page); admin screens read `forkFeatures` directly. */
export async function readForkFeatures(): Promise<ForkFeatures> {
  const hit = flagsCache.get('features')
  if (hit && Date.now() - hit.at < FLAGS_TTL_MS) return hit.value
  const value = await forkFeatures.read()
  flagsCache.set('features', { value, at: Date.now() })
  return value
}

/**
 * Turn one feature on or off without touching the others (review 2026-11-15,
 * finding 8). Trust and announcements each used to read the whole `features`
 * value, change their key and write it all back, so two admins toggling
 * different features at once could undo each other. Here the row is locked
 * for the `before` read, and the write merges just this key into the stored
 * JSON (inserting the row if it is missing) in one statement.
 */
export async function setForkFeature(
  feature: ForkFeature,
  enabled: boolean,
  by: PrincipalId | null,
  executor: typeof db | Transaction = db
): Promise<{ before: ForkFeatures; after: ForkFeatures }> {
  const [current] = await executor
    .select({ value: forkSettings.value })
    .from(forkSettings)
    .where(eq(forkSettings.key, forkFeatures.key))
    .for('update')
  const patch = JSON.stringify({ [feature]: enabled })
  const [row] = await executor
    .insert(forkSettings)
    .values({ key: forkFeatures.key, value: { [feature]: enabled }, updatedByPrincipalId: by })
    .onConflictDoUpdate({
      target: forkSettings.key,
      set: {
        value: sql`coalesce(${forkSettings.value}, '{}'::jsonb) || ${patch}::jsonb`,
        updatedByPrincipalId: by,
        updatedAt: sql`now()`,
      },
    })
    .returning({ value: forkSettings.value })
  return {
    before: parseForkSetting(forkFeaturesSchema, current?.value),
    after: parseForkSetting(forkFeaturesSchema, row?.value),
  }
}

/** Drop this replica's cached flags after a write commits. */
export function forgetForkFeatures(): void {
  flagsCache.delete('features')
}

export async function isForkFeatureEnabled(feature: ForkFeature): Promise<boolean> {
  return (await readForkFeatures())[feature]
}
