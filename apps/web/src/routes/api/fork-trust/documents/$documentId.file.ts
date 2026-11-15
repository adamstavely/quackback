import { createFileRoute } from '@tanstack/react-router'

/**
 * POST /api/fork-trust/documents/{documentId}/file — attach or replace a
 * Trust & Security document's file (plans/v2/70-trust-security.md, phase 3).
 * Multipart, field `file`. Dashboard sessions with `trust.manage` only.
 */
export async function handleTrustDocumentUpload({
  request,
  params,
}: {
  request: Request
  params: { documentId: string }
}): Promise<Response> {
  const { requireAuth } = await import('@/lib/server/functions/auth-helpers')
  const { PERMISSIONS } = await import('@/lib/shared/permissions')
  const { DomainException } = await import('@/lib/shared/errors')
  try {
    const auth = await requireAuth({ permission: PERMISSIONS.TRUST_MANAGE })
    if (!/^[0-9a-f-]{36}$/i.test(params.documentId)) {
      return Response.json({ error: 'Invalid document id' }, { status: 400 })
    }
    const { isS3Usable } = await import('@/lib/server/storage/s3')
    if (!isS3Usable()) return Response.json({ error: 'Storage not configured' }, { status: 503 })

    let file: FormDataEntryValue | null
    try {
      file = (await request.formData()).get('file')
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return Response.json({ error: 'Attach a file in the "file" field' }, { status: 400 })
    }

    const { actorFromAuth } = await import('@/lib/server/audit/log')
    const { attachDocumentFile } = await import('@/lib/server/fork/trust/documents.service')
    await attachDocumentFile(
      { principalId: auth.principal.id, audit: actorFromAuth(auth), headers: request.headers },
      params.documentId,
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
        contentType: file.type,
      }
    )
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof DomainException) {
      return Response.json({ error: error.message }, { status: error.statusCode })
    }
    throw error
  }
}

export const Route = createFileRoute('/api/fork-trust/documents/$documentId/file')({
  server: { handlers: { POST: handleTrustDocumentUpload } },
})
