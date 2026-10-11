import { createServerFn } from '@tanstack/react-start'
import { buildBannerFeed, type BannerFeed } from '@/lib/server/fork/announcements/feed'
import { getOptionalAuth, hasAuthCredentials, policyActorFromAuth } from '../auth-helpers'
import { resolvePortalAccessForRequest } from '../portal-access'

/**
 * The banners the current portal viewer sees (§4.8). No permission gate: the
 * feed itself shows nothing to anyone who is not signed in or not allowed into
 * the portal, and filters each banner by its audience.
 */
export const getPortalBannerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BannerFeed> => {
    const auth = hasAuthCredentials() ? await getOptionalAuth() : null
    const [actor, access] = await Promise.all([
      policyActorFromAuth(auth),
      resolvePortalAccessForRequest(),
    ])
    return buildBannerFeed(actor, access, 'portal')
  }
)
