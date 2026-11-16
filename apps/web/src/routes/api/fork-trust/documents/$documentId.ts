import { createFileRoute } from '@tanstack/react-router'

/** Presigned links live 15 minutes; the page asks again on each click. */
const DOWNLOAD_URL_TTL_SECONDS = 900

/**
 * GET /api/fork-trust/documents/{documentId} — download a Trust & Security
 * document (plans/v2/70-trust-security.md §5). Signed-in viewers the portal
 * admits may download open documents; restricted ones need a live approval
 * (D-TS3). People with `trust.view` may download any document, drafts
 * included. Every download is audited. Never a public storage URL.
 */
export async function handleTrustDocumentDownload({
  request,
  params,
}: {
  request: Request
  params: { documentId: string }
}): Promise<Response> {
  const { getOptionalAuth, hasAuthCredentials } =
    await import('@/lib/server/functions/auth-helpers')
  const ctx = hasAuthCredentials() ? await getOptionalAuth() : null
  if (!ctx?.principal || ctx.principal.type === 'anonymous') {
    return Response.json({ error: 'Sign in to download this document' }, { status: 401 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.documentId)) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { PERMISSIONS } = await import('@/lib/shared/permissions')
  const staff = ctx.permissions.includes(PERMISSIONS.TRUST_VIEW)
  if (!staff) {
    const { isForkFeatureEnabled } = await import('@/lib/server/fork/settings/features')
    if (!(await isForkFeatureEnabled('trust'))) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const { resolvePortalAccessForRequest } = await import('@/lib/server/functions/portal-access')
    if (!(await resolvePortalAccessForRequest()).granted) {
      return Response.json({ error: 'Not allowed' }, { status: 403 })
    }
  }

  const { forkTrustDocuments } = await import('@/lib/server/fork/db')
  const { db, eq } = await import('@/lib/server/db')
  const [doc] = await db
    .select()
    .from(forkTrustDocuments)
    .where(eq(forkTrustDocuments.id, params.documentId))
    .limit(1)
  if (!doc?.storageKey || (!staff && !doc.published)) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (doc.access === 'restricted' && !staff) {
    const { hasLiveGrant } = await import('@/lib/server/fork/trust/access.service')
    if (!(await hasLiveGrant(ctx.principal.id, doc.id))) {
      return Response.json({ error: 'Request access to download this document' }, { status: 403 })
    }
  }

  const { actorFromAuth, recordAuditEvent } = await import('@/lib/server/audit/log')
  await recordAuditEvent({
    event: 'fork_trust.document_downloaded',
    actor: actorFromAuth(ctx),
    headers: request.headers,
    target: { type: 'fork_trust_document', id: doc.id },
    metadata: { principalId: ctx.principal.id, version: doc.version, access: doc.access },
  })

  const fileName = doc.fileName ?? 'document'
  const { config } = await import('@/lib/server/config')
  const { getS3Object, generatePresignedGetUrl } = await import('@/lib/server/storage/s3')
  if (config.s3Proxy) {
    const { body } = await getS3Object(doc.storageKey)
    return new Response(body, {
      headers: {
        'Content-Type': doc.contentType ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName.replace(/["\\\r\n]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }
  const url = await generatePresignedGetUrl(doc.storageKey, DOWNLOAD_URL_TTL_SECONDS, fileName)
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': 'private, no-store' },
  })
}

export const Route = createFileRoute('/api/fork-trust/documents/$documentId')({
  server: { handlers: { GET: handleTrustDocumentDownload } },
})
