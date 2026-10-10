import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { typeIdColumnNullable } from '@quackback/ids/drizzle'
import { principal } from '../../schema/auth'

/**
 * Banners admins publish to the portal and to internal apps
 * (plans/v2/60-announcements-banner.md §5). Visibility is derived from the
 * timestamps at read time, so no job ever flips a row.
 */
export const forkAnnouncements = pgTable(
  'fork_announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    linkUrl: text('link_url'),
    linkLabel: text('link_label'),
    status: text('status').notNull().default('draft'),
    publishAt: timestamp('publish_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    priority: integer('priority').notNull().default(0),
    surfaces: jsonb('surfaces').$type<string[]>().notNull().default(['portal']),
    audience: jsonb('audience')
      .$type<{ tier: string; segmentIds: string[] }>()
      .notNull()
      .default({ tier: 'authenticated', segmentIds: [] }),
    origin: jsonb('origin')
      .$type<{ source: string; broadcastId?: string; towerActor?: string }>()
      .notNull()
      .default({ source: 'local' }),
    createdByPrincipalId: typeIdColumnNullable('principal')('created_by_principal_id').references(
      () => principal.id,
      { onDelete: 'set null' }
    ),
    updatedByPrincipalId: typeIdColumnNullable('principal')('updated_by_principal_id').references(
      () => principal.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fork_announcements_live_idx').on(t.status, t.publishAt, t.expiresAt),
    check(
      'fork_announcements_kind_check',
      sql`${t.kind} IN ('info', 'warning', 'critical', 'maintenance', 'success')`
    ),
    check(
      'fork_announcements_status_check',
      sql`${t.status} IN ('draft', 'published', 'archived')`
    ),
    check('fork_announcements_title_check', sql`char_length(${t.title}) <= 140`),
    check('fork_announcements_body_check', sql`${t.body} IS NULL OR char_length(${t.body}) <= 500`),
    check(
      'fork_announcements_window_check',
      sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.publishAt}`
    ),
  ]
)

/**
 * One row per workspace database: a counter every announcement write bumps in
 * its own transaction, so commit order equals revision order, and an `epoch`
 * that changes if the row is ever re-created (a restore), which clients treat
 * as newer (§4.6).
 */
export const forkAnnouncementRevision = pgTable(
  'fork_announcement_revision',
  {
    singleton: smallint('singleton').primaryKey(),
    epoch: uuid('epoch').notNull().defaultRandom(),
    revision: bigint('revision', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('fork_announcement_revision_singleton_check', sql`${t.singleton} = 1`)]
)
