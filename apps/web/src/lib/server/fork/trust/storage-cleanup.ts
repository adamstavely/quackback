import { forkTrustDocuments, forkTrustStorageCleanup } from '@/lib/server/fork/db'
import { db, eq, inArray, sql, type Transaction } from '@/lib/server/db'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'fork-trust-storage-cleanup' })

/**
 * Removing Trust files from storage (review 2026-11-15, finding 5). Callers
 * queue a key inside the transaction that stops using it, then call
 * `runTrustStorageCleanup` after commit. A key still referenced by a document
 * is never removed (only dequeued), so a queueing mistake cannot destroy a
 * live file.
 */

const BATCH = 50

/** Queue a key for removal; inside the caller's transaction, so it commits with it. */
export async function queueTrustFileRemoval(
  executor: typeof db | Transaction,
  storageKey: string,
  reason: string
): Promise<void> {
  await executor
    .insert(forkTrustStorageCleanup)
    .values({ storageKey, reason })
    .onConflictDoNothing()
}

/** Work off the queue. Never throws; returns how many files were removed. */
export async function runTrustStorageCleanup(): Promise<{ removed: number; failed: number }> {
  const result = { removed: 0, failed: 0 }
  try {
    const { deleteObject } = await import('@/lib/server/storage/s3')
    const c = forkTrustStorageCleanup
    const rows = await db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(c)
        .orderBy(c.createdAt)
        .limit(BATCH)
        .for('update', { skipLocked: true })
      if (due.length === 0) return []
      // Claim by counting the attempt now; a concurrent run skips locked rows.
      await tx
        .update(c)
        .set({ attempts: sql`${c.attempts} + 1` })
        .where(
          inArray(
            c.id,
            due.map((r) => r.id)
          )
        )
      return due
    })
    for (const row of rows) {
      const [live] = await db
        .select({ id: forkTrustDocuments.id })
        .from(forkTrustDocuments)
        .where(eq(forkTrustDocuments.storageKey, row.storageKey))
        .limit(1)
      try {
        if (!live) await deleteObject(row.storageKey)
        await db.delete(c).where(eq(c.id, row.id))
        if (!live) result.removed++
      } catch (err) {
        result.failed++
        const message = err instanceof Error ? err.message : String(err)
        await db
          .update(c)
          .set({ lastError: message.slice(0, 300) })
          .where(eq(c.id, row.id))
          .catch(() => {})
        log.warn(
          { err, storageKey: row.storageKey },
          'trust file could not be removed; kept queued'
        )
      }
    }
  } catch (err) {
    log.error({ err }, 'trust storage cleanup stopped')
  }
  return result
}
