import { forkTrustDocuments } from '@/lib/server/fork/db'
import { db, eq, sql } from '@/lib/server/db'
import { recordAuditEventInTransaction } from '@/lib/server/audit/log'
import { logger } from '@/lib/server/logger'
import { NotFoundError, ValidationError } from '@/lib/shared/errors'
import type { TrustWriter } from './trust.service'

const log = logger.child({ component: 'fork-trust-documents' })

/** Private storage prefix: never in upstream's public prefixes, so never served openly. */
export const TRUST_STORAGE_PREFIX = 'fork-trust'

/** 25 MB covers policy PDFs and audit reports. */
export const MAX_TRUST_FILE_BYTES = 25 * 1024 * 1024

/** Document formats a trust page carries; anything else is refused. */
export const TRUST_FILE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
}

/**
 * Attach (or replace) a document's file (phase 3). The new object is written
 * first; the row then points at it, in one transaction with its audit row,
 * and the old object is removed afterwards (best effort).
 */
export async function attachDocumentFile(
  writer: TrustWriter,
  documentId: string,
  file: { bytes: Uint8Array; fileName: string; contentType: string }
): Promise<void> {
  if (!TRUST_FILE_TYPES[file.contentType]) {
    throw new ValidationError(
      'TRUST_FILE_TYPE',
      'Upload a PDF, Word, Excel, PowerPoint, text, CSV or ZIP file'
    )
  }
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_TRUST_FILE_BYTES) {
    throw new ValidationError('TRUST_FILE_SIZE', 'Files can be up to 25 MB')
  }
  const [existing] = await db
    .select()
    .from(forkTrustDocuments)
    .where(eq(forkTrustDocuments.id, documentId))
    .limit(1)
  if (!existing) throw new NotFoundError('TRUST_DOCUMENT_NOT_FOUND', 'That document no longer exists')

  const { deleteObject, generateStorageKey, uploadObject } = await import('@/lib/server/storage/s3')
  const fileName = file.fileName.slice(-200) || `document.${TRUST_FILE_TYPES[file.contentType]}`
  const key = generateStorageKey(TRUST_STORAGE_PREFIX, fileName)
  await uploadObject(key, file.bytes, file.contentType)

  await db.transaction(async (tx) => {
    await tx
      .update(forkTrustDocuments)
      .set({
        storageKey: key,
        fileName,
        contentType: file.contentType,
        sizeBytes: file.bytes.byteLength,
        version: sql`${forkTrustDocuments.version} + ${existing.storageKey ? 1 : 0}`,
        updatedByPrincipalId: writer.principalId,
        updatedAt: new Date(),
      })
      .where(eq(forkTrustDocuments.id, documentId))
    await recordAuditEventInTransaction(tx, {
      event: 'fork_trust.document_uploaded',
      actor: writer.audit,
      headers: writer.headers,
      target: { type: 'fork_trust_document', id: documentId },
      before: existing.fileName ? { fileName: existing.fileName } : null,
      after: { fileName, sizeBytes: file.bytes.byteLength, contentType: file.contentType },
      metadata: { principalId: writer.principalId },
    })
  })

  if (existing.storageKey) {
    await deleteObject(existing.storageKey).catch((err: unknown) =>
      log.warn({ err, documentId }, 'old trust document file could not be removed')
    )
  }
}
