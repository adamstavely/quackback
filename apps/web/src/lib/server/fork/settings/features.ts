import { forkFeaturesSchema, type ForkFeature } from '@/lib/shared/fork/features'
import { defineForkSetting } from './fork-settings'

/** The workspace's fork feature flags (`fork_settings.features`). */
export const forkFeatures = defineForkSetting('features', forkFeaturesSchema)

export async function isForkFeatureEnabled(feature: ForkFeature): Promise<boolean> {
  return (await forkFeatures.read())[feature]
}
