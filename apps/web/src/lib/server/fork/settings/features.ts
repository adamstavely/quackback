import { WorkspaceKeyedCache } from '@/lib/server/workspaces/workspace-keyed'
import { forkFeaturesSchema, type ForkFeature, type ForkFeatures } from '@/lib/shared/fork/features'
import { defineForkSetting } from './fork-settings'

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

/** Drop this replica's cached flags after a write commits. */
export function forgetForkFeatures(): void {
  flagsCache.delete('features')
}

export async function isForkFeatureEnabled(feature: ForkFeature): Promise<boolean> {
  return (await readForkFeatures())[feature]
}
