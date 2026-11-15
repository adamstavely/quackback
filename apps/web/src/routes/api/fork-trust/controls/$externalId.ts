import { createFileRoute } from '@tanstack/react-router'

/**
 * PUT /api/fork-trust/controls/{externalId} — the controls feed
 * (plans/v2/70-trust-security.md §5, phase 5). A monitoring tool sets the
 * status of a control it owns. API key only, holding `trust.manage` (key
 * authority as plan 10's R-1: the key's owner ∩ the key's scopes, which for
 * this permission means `write:article`). Body: `{ status, checkedAt? }`.
 */
export async function handleControlFeed({
  request,
  params,
}: {
  request: Request
  params: { externalId: string }
}): Promise<Response> {
  const [{ withApiKeyAuth }, responses, { PERMISSIONS }, schema] = await Promise.all([
    import('@/lib/server/domains/api/auth'),
    import('@/lib/server/domains/api/responses'),
    import('@/lib/shared/permissions'),
    import('@/lib/shared/fork/trust/schema'),
  ])
  try {
    const auth = await withApiKeyAuth(request, { permission: PERMISSIONS.TRUST_MANAGE })
    const externalId = schema.controlExternalIdSchema.min(1).safeParse(params.externalId)
    if (!externalId.success) return responses.badRequestResponse('Invalid integration ID')
    const body = schema.controlFeedSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
      return responses.badRequestResponse('Invalid request body', {
        errors: body.error.flatten().fieldErrors,
      })
    }
    const { setIntegrationControlStatus } = await import('@/lib/server/fork/trust/feed.service')
    const result = await setIntegrationControlStatus(
      {
        principalId: auth.principalId,
        audit: {
          userId: auth.principal?.userId ?? null,
          email: auth.principal?.user?.email ?? null,
          role: auth.role,
          type: 'api_key',
          authMethod: 'api_key',
        },
        headers: request.headers,
        source: 'api',
      },
      externalId.data,
      body.data
    )
    return responses.successResponse(result)
  } catch (error) {
    return responses.handleDomainError(error)
  }
}

export const Route = createFileRoute('/api/fork-trust/controls/$externalId')({
  server: { handlers: { PUT: handleControlFeed } },
})
