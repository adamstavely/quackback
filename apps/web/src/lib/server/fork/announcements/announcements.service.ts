import type { PrincipalId } from '@quackback/ids'
import { forkAnnouncements } from '@/lib/server/fork/db'
import { db, desc, eq, sql, type Transaction } from '@/lib/server/db'
import { recordAuditEventInTransaction, type AuditActor } from '@/lib/server/audit/log'
import type { ForkAuditEventType } from '@/lib/server/fork/audit-events'
import { forgetForkFeatures, forkFeatures } from '@/lib/server/fork/settings/features'
import { ConflictError, NotFoundError } from '@/lib/shared/errors'
import type { Announcement } from '@/lib/shared/fork/announcements/types'
import type {
  AnnouncementsConfig,
  AnnouncementTemplate,
  AnnouncementValues,
} from '@/lib/shared/fork/announcements/schema'
import { bumpAnnouncementRevision, publishAnnouncementRevision } from './revision'
import { announcementsConfig, announcementTemplatesSetting, STARTER_TEMPLATES } from './settings'

/**
 * Announcement authoring (§4.9). Every write runs in one transaction with its
 * revision bump and its audit row, and publishes the revision only after that
 * commits: an audit failure rolls the change back and announces nothing.
 * Admin server functions and (later) MCP tools share these functions.
 */
export interface AnnouncementWriter {
  principalId: PrincipalId
  audit: AuditActor
  headers?: Headers
}

type Row = typeof forkAnnouncements.$inferSelect

function toAnnouncement(row: Row): Announcement {
  return {
    id: row.id,
    kind: row.kind as Announcement['kind'],
    title: row.title,
    body: row.body,
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    status: row.status as Announcement['status'],
    publishAt: row.publishAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    priority: row.priority,
    surfaces: row.surfaces as Announcement['surfaces'],
    audience: row.audience as Announcement['audience'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const rows = await db.select().from(forkAnnouncements).orderBy(desc(forkAnnouncements.updatedAt))
  return rows.map(toAnnouncement)
}

async function lockedAnnouncement(tx: Transaction, id: string): Promise<Row> {
  const [row] = await tx
    .select()
    .from(forkAnnouncements)
    .where(eq(forkAnnouncements.id, id))
    .limit(1)
    .for('update')
  if (!row) throw new NotFoundError('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found')
  return row
}

async function audit(
  tx: Transaction,
  writer: AnnouncementWriter,
  event: ForkAuditEventType,
  id: string | null,
  before: unknown,
  after: unknown
): Promise<void> {
  await recordAuditEventInTransaction(tx, {
    event,
    actor: writer.audit,
    headers: writer.headers,
    target: { type: 'fork_announcement', id },
    before,
    after,
    metadata: { principalId: writer.principalId },
  })
}

/** Runs a write, bumps the revision and audits inside one transaction; publishes after commit. */
async function write<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const { result, revision } = await db.transaction(async (tx) => {
    const result = await fn(tx)
    return { result, revision: await bumpAnnouncementRevision(tx) }
  })
  publishAnnouncementRevision(revision)
  return result
}

export async function upsertAnnouncement(
  writer: AnnouncementWriter,
  values: AnnouncementValues
): Promise<Announcement> {
  const fields = {
    kind: values.kind,
    title: values.title,
    body: values.body || null,
    linkUrl: values.linkUrl || null,
    linkLabel: values.linkUrl ? values.linkLabel || null : null,
    status: values.status,
    publishAt: values.publishAt ? new Date(values.publishAt) : new Date(),
    expiresAt: values.expiresAt ? new Date(values.expiresAt) : null,
    priority: values.priority,
    surfaces: values.surfaces,
    audience: {
      tier: values.audience.tier,
      segmentIds: values.audience.tier === 'segments' ? values.audience.segmentIds : [],
    },
    updatedByPrincipalId: writer.principalId,
    updatedAt: new Date(),
  }

  return write(async (tx) => {
    if (!values.id) {
      const [row] = await tx
        .insert(forkAnnouncements)
        .values({ ...fields, createdByPrincipalId: writer.principalId })
        .returning()
      const created = toAnnouncement(row!)
      await audit(tx, writer, 'fork_announcement.created', created.id, null, created)
      return created
    }

    const existing = await lockedAnnouncement(tx, values.id)
    if (existing.status === 'archived') {
      throw new ConflictError(
        'ANNOUNCEMENT_ARCHIVED',
        'This announcement is archived. Duplicate it to publish it again.'
      )
    }
    const [row] = await tx
      .update(forkAnnouncements)
      .set(fields)
      .where(eq(forkAnnouncements.id, values.id))
      .returning()
    const updated = toAnnouncement(row!)
    await audit(
      tx,
      writer,
      'fork_announcement.updated',
      updated.id,
      toAnnouncement(existing),
      updated
    )
    return updated
  })
}

export async function archiveAnnouncement(
  writer: AnnouncementWriter,
  id: string
): Promise<Announcement> {
  return write(async (tx) => {
    const existing = await lockedAnnouncement(tx, id)
    const [row] = await tx
      .update(forkAnnouncements)
      .set({ status: 'archived', updatedByPrincipalId: writer.principalId, updatedAt: sql`now()` })
      .where(eq(forkAnnouncements.id, id))
      .returning()
    const archived = toAnnouncement(row!)
    await audit(tx, writer, 'fork_announcement.archived', id, toAnnouncement(existing), archived)
    return archived
  })
}

/** Only drafts are deleted; anything that was ever published is archived instead, for the record. */
export async function deleteDraftAnnouncement(
  writer: AnnouncementWriter,
  id: string
): Promise<void> {
  await write(async (tx) => {
    const existing = await lockedAnnouncement(tx, id)
    if (existing.status !== 'draft') {
      throw new ConflictError(
        'ANNOUNCEMENT_NOT_DRAFT',
        'Only drafts can be deleted. Archive it instead.'
      )
    }
    await tx.delete(forkAnnouncements).where(eq(forkAnnouncements.id, id))
    await audit(tx, writer, 'fork_announcement.deleted', id, toAnnouncement(existing), null)
  })
}

export async function getAnnouncementsEnabled(): Promise<boolean> {
  return (await forkFeatures.read()).announcements
}

export async function setAnnouncementsEnabled(
  writer: AnnouncementWriter,
  enabled: boolean
): Promise<boolean> {
  const result = await write(async (tx) => {
    const before = await forkFeatures.read(tx)
    const after = await forkFeatures.write(
      { ...before, announcements: enabled },
      writer.principalId,
      tx
    )
    await audit(
      tx,
      writer,
      'fork_announcement.config_updated',
      null,
      { enabled: before.announcements },
      { enabled }
    )
    return after.announcements
  })
  forgetForkFeatures()
  return result
}

export async function getAnnouncementsConfig(): Promise<AnnouncementsConfig> {
  return announcementsConfig.read()
}

export async function updateAnnouncementsConfig(
  writer: AnnouncementWriter,
  config: AnnouncementsConfig
): Promise<AnnouncementsConfig> {
  return write(async (tx) => {
    const before = await announcementsConfig.read(tx)
    const after = await announcementsConfig.write(config, writer.principalId, tx)
    await audit(tx, writer, 'fork_announcement.config_updated', null, before, after)
    return after
  })
}

export async function listAnnouncementTemplates(): Promise<AnnouncementTemplate[]> {
  return (await announcementTemplatesSetting.read()).items ?? STARTER_TEMPLATES
}

export async function saveAnnouncementTemplates(
  writer: AnnouncementWriter,
  items: AnnouncementTemplate[]
): Promise<AnnouncementTemplate[]> {
  return write(async (tx) => {
    const before = await announcementTemplatesSetting.read(tx)
    await announcementTemplatesSetting.write({ items }, writer.principalId, tx)
    await audit(tx, writer, 'fork_announcement.templates_updated', null, before.items, items)
    return items
  })
}
