import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
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

/**
 * A signed-in employee asks for a restricted document (D-TS3). The request is
 * theirs only: the principal comes from the session, never the request body.
 */
export const requestTrustDocumentAccessFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      documentId: z.string().uuid(),
      reason: z.string().trim().max(500).optional(),
    })
  )
  .handler(async ({ data }) => {
    const { isForkFeatureEnabled } = await import('@/lib/server/fork/settings/features')
    const { NotFoundError, UnauthorizedError, ForbiddenError } = await import('@/lib/shared/errors')
    if (!(await isForkFeatureEnabled('trust'))) {
      throw new NotFoundError('TRUST_OFF', 'This page is not available')
    }
    const { getOptionalAuth, hasAuthCredentials, policyActorFromAuth } =
      await import('@/lib/server/functions/auth-helpers')
    const ctx = hasAuthCredentials() ? await getOptionalAuth() : null
    if (!ctx?.principal || ctx.principal.type === 'anonymous') {
      throw new UnauthorizedError('Sign in to request access')
    }
    const { resolvePortalAccessForRequest } = await import('@/lib/server/functions/portal-access')
    if (!(await resolvePortalAccessForRequest()).granted) {
      throw new ForbiddenError('FORBIDDEN', 'You cannot request this document')
    }
    const [{ actorFromAuth }, { requestDocumentAccess }] = await Promise.all([
      import('@/lib/server/audit/log'),
      import('@/lib/server/fork/trust/access.service'),
    ])
    await requestDocumentAccess(
      {
        principalId: ctx.principal.id,
        audit: actorFromAuth(ctx),
        headers: getRequestHeaders(),
        actor: await policyActorFromAuth(ctx),
      },
      data.documentId,
      data.reason || null
    )
  })

/** Subscribe to, or unsubscribe from, new updates (phase 4). Same gate as the page. */
export const setTrustSubscriptionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ subscribed: z.boolean() }))
  .handler(async ({ data }) => {
    const { isForkFeatureEnabled } = await import('@/lib/server/fork/settings/features')
    const { NotFoundError, UnauthorizedError, ForbiddenError } = await import('@/lib/shared/errors')
    if (!(await isForkFeatureEnabled('trust'))) {
      throw new NotFoundError('TRUST_OFF', 'This page is not available')
    }
    const { getOptionalAuth, hasAuthCredentials } =
      await import('@/lib/server/functions/auth-helpers')
    const ctx = hasAuthCredentials() ? await getOptionalAuth() : null
    if (!ctx?.principal || ctx.principal.type === 'anonymous') {
      throw new UnauthorizedError('Sign in to subscribe')
    }
    const { resolvePortalAccessForRequest } = await import('@/lib/server/functions/portal-access')
    if (!(await resolvePortalAccessForRequest()).granted) {
      throw new ForbiddenError('FORBIDDEN', 'You cannot subscribe to this page')
    }
    const { setSubscribed } = await import('@/lib/server/fork/trust/updates.service')
    await setSubscribed(ctx.principal.id, data.subscribed)
    return { subscribed: data.subscribed }
  })

/** The hub's Trust & Security card (plan 70; hub option B). Counts only. */
export interface TrustHubSummary {
  controlsInPlace: number
  controlsTotal: number
  documents: number
  reviewedAt: string | null
}

/**
 * Null while the page is off (the hub then keeps its full status card).
 * Signed-out viewers get the card without numbers, as the page itself is for
 * signed-in employees (D-TS2).
 */
export const getTrustHubSummaryFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ summary: TrustHubSummary | null } | null> => {
    const { isForkFeatureEnabled } = await import('@/lib/server/fork/settings/features')
    if (!(await isForkFeatureEnabled('trust'))) return null
    const { getOptionalAuth, hasAuthCredentials } =
      await import('@/lib/server/functions/auth-helpers')
    const ctx = hasAuthCredentials() ? await getOptionalAuth() : null
    if (!ctx?.principal || ctx.principal.type === 'anonymous') return { summary: null }
    const { resolvePortalAccessForRequest } = await import('@/lib/server/functions/portal-access')
    if (!(await resolvePortalAccessForRequest()).granted) return { summary: null }
    const { buildTrustHubSummary } = await import('@/lib/server/fork/trust/portal')
    return { summary: await buildTrustHubSummary() }
  }
)
