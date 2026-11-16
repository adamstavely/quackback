/**
 * Review 2026-11-15, finding 5: Trust files leave storage when their document
 * is deleted or their file replaced, a failed removal stays queued and is
 * retried, a still-referenced key is never removed, and an upload whose save
 * fails is removed rather than orphaned.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { eq, principal, user } from '@/lib/server/db'
import {
  forkTrustDocumentGroups,
  forkTrustDocuments,
  forkTrustStorageCleanup,
} from '@/lib/server/fork/db'

const s3 = vi.hoisted(() => ({
  deleted: [] as string[],
  uploaded: [] as string[],
  deleteFails: false,
  auditFails: false,
  n: 0,
}))

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))
vi.mock('@/lib/server/storage/s3', () => ({
  generateStorageKey: (prefix: string, name: string) => `${prefix}/${++s3.n}-${name}`,
  uploadObject: async (key: string) => void s3.uploaded.push(key),
  deleteObject: async (key: string) => {
    if (s3.deleteFails) throw new Error('storage unavailable')
    s3.deleted.push(key)
  },
}))
vi.mock('@/lib/server/audit/log', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/server/audit/log')>()
  return {
    ...real,
    recordAuditEventInTransaction: async (
      ...args: Parameters<typeof real.recordAuditEventInTransaction>
    ) => {
      if (s3.auditFails) throw new Error('audit write failed')
      return real.recordAuditEventInTransaction(...args)
    },
  }
})

const { runTrustStorageCleanup } = await import('../storage-cleanup')
const { attachDocumentFile } = await import('../documents.service')
const { deleteTrustItem } = await import('../trust.service')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: forkTrustStorageCleanup.id }).from(forkTrustStorageCleanup).limit(0)
  },
})

if (fixture.available) {
  beforeEach(async () => {
    Object.assign(s3, { deleted: [], uploaded: [], deleteFails: false, auditFails: false })
    await fixture.begin()
    await testDb.delete(forkTrustStorageCleanup)
    await testDb.delete(forkTrustDocuments)
    await testDb.delete(forkTrustDocumentGroups)
  })
  afterEach(() => fixture.rollback())
  afterAll(() => fixture.close())
}

async function writer() {
  const userId = createId('user') as UserId
  const principalId = createId('principal') as PrincipalId
  await testDb.insert(user).values({ id: userId, name: 'A', email: `a-${userId}@example.com` })
  await testDb
    .insert(principal)
    .values({ id: principalId, userId, role: 'admin', type: 'user', createdAt: new Date() })
  return {
    principalId,
    audit: { userId, email: 'a@example.com', role: 'admin', type: 'user' as const },
  }
}

async function documentWithFile(storageKey: string | null = 'fork-trust/old.pdf') {
  const [group] = await testDb.insert(forkTrustDocumentGroups).values({ name: 'G' }).returning()
  const [doc] = await testDb
    .insert(forkTrustDocuments)
    .values({
      groupId: group!.id,
      title: 'SOC 2',
      storageKey,
      fileName: storageKey ? 'old.pdf' : null,
    })
    .returning()
  return doc!
}

const pdf = {
  bytes: new Uint8Array([1, 2, 3]),
  fileName: 'new.pdf',
  contentType: 'application/pdf',
}
const settle = async () => {
  // The services start a cleanup run in the background; let it finish, then run once more.
  await new Promise((resolve) => setTimeout(resolve, 50))
  await runTrustStorageCleanup()
}
const queued = () => testDb.select().from(forkTrustStorageCleanup)

describe.skipIf(!fixture.available)('trust storage cleanup (real Postgres)', () => {
  it('removes a deleted document’s file', async () => {
    const w = await writer()
    const doc = await documentWithFile()
    await deleteTrustItem(w, 'document', doc.id)
    await settle()
    expect(s3.deleted).toEqual(['fork-trust/old.pdf'])
    expect(await queued()).toEqual([])
  })

  it('removes a replaced file and keeps the new one', async () => {
    const w = await writer()
    const doc = await documentWithFile()
    await attachDocumentFile(w, doc.id, pdf)
    await settle()
    expect(s3.deleted).toEqual(['fork-trust/old.pdf'])
    const [row] = await testDb
      .select()
      .from(forkTrustDocuments)
      .where(eq(forkTrustDocuments.id, doc.id))
    expect(row!.storageKey).toBe(s3.uploaded[0])
  })

  it('keeps a removal that failed, with its error, and retries it', async () => {
    const w = await writer()
    const doc = await documentWithFile()
    s3.deleteFails = true
    await deleteTrustItem(w, 'document', doc.id)
    await settle()
    const [row] = await queued()
    expect(row).toMatchObject({
      storageKey: 'fork-trust/old.pdf',
      lastError: 'storage unavailable',
    })
    expect(row!.attempts).toBeGreaterThan(0)
    s3.deleteFails = false
    await runTrustStorageCleanup()
    expect(s3.deleted).toEqual(['fork-trust/old.pdf'])
    expect(await queued()).toEqual([])
  })

  it('never removes a key a document still uses', async () => {
    const doc = await documentWithFile('fork-trust/live.pdf')
    await testDb
      .insert(forkTrustStorageCleanup)
      .values({ storageKey: doc.storageKey!, reason: 'test' })
    await runTrustStorageCleanup()
    expect(s3.deleted).toEqual([])
    expect(await queued()).toEqual([])
  })

  it('removes the new upload when saving it fails', async () => {
    const w = await writer()
    const doc = await documentWithFile()
    s3.auditFails = true
    await expect(attachDocumentFile(w, doc.id, pdf)).rejects.toThrow('audit write failed')
    expect(s3.deleted).toEqual([s3.uploaded[0]])
    const [row] = await testDb
      .select()
      .from(forkTrustDocuments)
      .where(eq(forkTrustDocuments.id, doc.id))
    expect(row!.storageKey).toBe('fork-trust/old.pdf')
  })
})
