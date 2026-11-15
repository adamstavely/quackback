import { trustConfigSchema } from '@/lib/shared/fork/trust/schema'
import { defineForkSetting } from '@/lib/server/fork/settings/fork-settings'

/** The Trust & Security page's settings (`fork_settings.trust`). */
export const trustConfig = defineForkSetting('trust', trustConfigSchema)
