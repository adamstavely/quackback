import { z } from 'zod'

/**
 * Fork feature flags (conventions §9), stored in `fork_settings` under
 * `features`. Every flag defaults to off, so a fork feature stays dark on a
 * workspace until an admin turns it on.
 */
export const forkFeaturesSchema = z.object({
  announcements: z.boolean().default(false),
})

export type ForkFeatures = z.output<typeof forkFeaturesSchema>
export type ForkFeature = keyof ForkFeatures
