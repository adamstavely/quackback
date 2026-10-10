import { forkAnnouncementRevision } from '@/lib/server/fork/db'
import { eq, sql, type Transaction } from '@/lib/server/db'
import { publish } from '@/lib/server/realtime/pubsub'

/** The realtime channel announcement revisions are published on (§4.6). */
export const ANNOUNCEMENTS_CHANNEL = 'fork:announcements'

export interface AnnouncementRevision {
  epoch: string
  revision: number
}

/**
 * Bumps the workspace's announcement revision inside a write transaction.
 * Concurrent writers serialize on the row lock, so commit order equals
 * revision order and a client never skips a change.
 */
export async function bumpAnnouncementRevision(tx: Transaction): Promise<AnnouncementRevision> {
  const [row] = await tx
    .update(forkAnnouncementRevision)
    .set({ revision: sql`${forkAnnouncementRevision.revision} + 1`, updatedAt: sql`now()` })
    .where(eq(forkAnnouncementRevision.singleton, 1))
    .returning({
      epoch: forkAnnouncementRevision.epoch,
      revision: forkAnnouncementRevision.revision,
    })
  if (!row) throw new Error('fork_announcement_revision row is missing; run the fork migrations')
  return row
}

/** Tells open portals and embeds to refetch. Call only after the transaction commits. */
export function publishAnnouncementRevision(rev: AnnouncementRevision): void {
  publish(ANNOUNCEMENTS_CHANNEL, { epoch: rev.epoch, rev: rev.revision })
}
