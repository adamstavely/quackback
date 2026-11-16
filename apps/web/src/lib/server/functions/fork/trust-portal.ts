import { createServerFn } from '@tanstack/react-start'
import type { TrustPage } from '@/lib/shared/fork/trust/portal'

/**
 * The portal's Trust & Security page (plans/v2/70-trust-security.md §5).
 * Off when the workspace has not turned it on; otherwise only for a signed-in
 * person the portal admits (D-TS2). The flag check comes first and is cached,
 * so a workspace without the page pays nothing.
 */
export const getTrustPageFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TrustPage> => {
    const { isForkFeatureEnabled } = await import('@/lib/server/fork/settings/features')
    if (!(await isForkFeatureEnabled('trust'))) return { status: 'off' }

    const { getOptionalAuth, hasAuthCredentials, policyActorFromAuth } =
      await import('@/lib/server/functions/auth-helpers')
    const ctx = hasAuthCredentials() ? await getOptionalAuth() : null
    if (!ctx?.principal || ctx.principal.type === 'anonymous') return { status: 'signed_out' }

    const { resolvePortalAccessForRequest } = await import('@/lib/server/functions/portal-access')
    const access = await resolvePortalAccessForRequest()
    if (!access.granted) return { status: 'signed_out' }

    const { buildTrustPageContent } = await import('@/lib/server/fork/trust/portal')
    return { status: 'ok', content: await buildTrustPageContent(await policyActorFromAuth(ctx)) }
  }
)
