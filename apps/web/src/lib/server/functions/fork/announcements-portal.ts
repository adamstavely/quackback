import { createServerFn } from '@tanstack/react-start'
import { buildBannerFeed, type BannerFeed } from '@/lib/server/fork/announcements/feed'
import { readForkFeatures } from '@/lib/server/fork/settings/features'
import { getOptionalAuth, hasAuthCredentials, policyActorFromAuth } from '../auth-helpers'
import { resolvePortalAccessForRequest } from '../portal-access'

/**
 * The banners the current portal viewer sees (§4.8), or `null` while announcements are off. No permission gate: the
 * feed itself shows nothing to anyone who is not signed in or not allowed into
 * the portal, and filters each banner by its audience.
 */
export const getPortalBannerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BannerFeed | null> => {
    // Off is the common case on most workspaces: answer it from the cached flag,
    // before any session or portal-access work, so it costs no query; `null`
    // keeps the answer streamed into every portal page as small as possible.
    if (!(await readForkFeatures()).announcements) return null
    const auth = hasAuthCredentials() ? await getOptionalAuth() : null
    const [actor, access] = await Promise.all([
      policyActorFromAuth(auth),
      resolvePortalAccessForRequest(),
    ])
    return buildBannerFeed(actor, access, 'portal')
  }
)
