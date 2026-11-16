import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { typeIdColumn, typeIdColumnNullable } from '@quackback/ids/drizzle'
import { principal } from '../../schema/auth'

/**
 * The Trust & Security page (plans/v2/70-trust-security.md §4). Every list is
 * ordered by `position`, set by the admin. Access requests, updates and
 * subscriptions arrive with their own phases.
 */

const audit = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedByPrincipalId: typeIdColumnNullable('principal')('updated_by_principal_id').references(
    () => principal.id,
    { onDelete: 'set null' }
  ),
})

export const forkTrustDocumentGroups = pgTable(
  'fork_trust_document_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    ...audit(),
  },
  (t) => [check('fork_trust_document_groups_name_check', sql`char_length(${t.name}) <= 80`)]
)

/** A document's file arrives with phase 3; until then only its listing exists. */
export const forkTrustDocuments = pgTable(
  'fork_trust_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => forkTrustDocumentGroups.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    access: text('access').notNull().default('restricted'),
    published: boolean('published').notNull().default(false),
    storageKey: text('storage_key'),
    fileName: text('file_name'),
    contentType: text('content_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    version: integer('version').notNull().default(1),
    position: integer('position').notNull().default(0),
    ...audit(),
  },
  (t) => [
    index('fork_trust_documents_group_idx').on(t.groupId, t.position),
    check('fork_trust_documents_access_check', sql`${t.access} IN ('open', 'restricted')`),
    check('fork_trust_documents_title_check', sql`char_length(${t.title}) <= 160`),
    check(
      'fork_trust_documents_description_check',
      sql`${t.description} IS NULL OR char_length(${t.description}) <= 500`
    ),
  ]
)

export const forkTrustComplianceItems = pgTable(
  'fork_trust_compliance_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    label: text('label').notNull(),
    detail: text('detail'),
    documentId: uuid('document_id').references(() => forkTrustDocuments.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull().default(0),
    ...audit(),
  },
  (t) => [
    check('fork_trust_compliance_items_name_check', sql`char_length(${t.name}) <= 120`),
    check('fork_trust_compliance_items_label_check', sql`char_length(${t.label}) <= 8`),
    check(
      'fork_trust_compliance_items_detail_check',
      sql`${t.detail} IS NULL OR char_length(${t.detail}) <= 120`
    ),
  ]
)

export const forkTrustControlGroups = pgTable(
  'fork_trust_control_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    ...audit(),
  },
  (t) => [
    check('fork_trust_control_groups_name_check', sql`char_length(${t.name}) <= 80`),
    check(
      'fork_trust_control_groups_description_check',
      sql`${t.description} IS NULL OR char_length(${t.description}) <= 300`
    ),
  ]
)

/**
 * `source` and `external_id` let a compliance tool push statuses later
 * (D-TS4, phase 5); hand-entered controls are `manual`.
 */
export const forkTrustControls = pgTable(
  'fork_trust_controls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => forkTrustControlGroups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('in_place'),
    source: text('source').notNull().default('manual'),
    externalId: text('external_id'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    position: integer('position').notNull().default(0),
    ...audit(),
  },
  (t) => [
    index('fork_trust_controls_group_idx').on(t.groupId, t.position),
    uniqueIndex('fork_trust_controls_external_uq')
      .on(t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    check(
      'fork_trust_controls_status_check',
      sql`${t.status} IN ('in_place', 'in_progress', 'not_applicable')`
    ),
    check('fork_trust_controls_source_check', sql`${t.source} IN ('manual', 'integration')`),
    check('fork_trust_controls_name_check', sql`char_length(${t.name}) <= 160`),
    check(
      'fork_trust_controls_description_check',
      sql`${t.description} IS NULL OR char_length(${t.description}) <= 1000`
    ),
  ]
)

export const forkTrustSubprocessors = pgTable(
  'fork_trust_subprocessors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    purpose: text('purpose').notNull(),
    location: text('location').notNull(),
    dataCategories: text('data_categories'),
    website: text('website'),
    position: integer('position').notNull().default(0),
    ...audit(),
  },
  (t) => [
    check('fork_trust_subprocessors_name_check', sql`char_length(${t.name}) <= 120`),
    check('fork_trust_subprocessors_purpose_check', sql`char_length(${t.purpose}) <= 300`),
    check('fork_trust_subprocessors_location_check', sql`char_length(${t.location}) <= 120`),
  ]
)

/**
 * A person's request for a restricted document (D-TS3, phase 3). The grant is
 * an approved row whose `expires_at` is still ahead; expiry is checked at read
 * time, so nothing has to flip a row. `ticket_id` is the private support
 * request it opened, when support tickets are on.
 */
export const forkTrustAccessRequests = pgTable(
  'fork_trust_access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => forkTrustDocuments.id, { onDelete: 'cascade' }),
    requesterPrincipalId: typeIdColumn('principal')('requester_principal_id')
      .notNull()
      .references(() => principal.id, { onDelete: 'cascade' }),
    state: text('state').notNull().default('pending'),
    reason: text('reason'),
    ticketId: text('ticket_id'),
    decisionNote: text('decision_note'),
    decidedByPrincipalId: typeIdColumnNullable('principal')('decided_by_principal_id').references(
      () => principal.id,
      { onDelete: 'set null' }
    ),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fork_trust_access_requests_requester_idx').on(t.requesterPrincipalId, t.documentId),
    index('fork_trust_access_requests_state_idx').on(t.state, t.createdAt),
    uniqueIndex('fork_trust_access_requests_pending_uq')
      .on(t.documentId, t.requesterPrincipalId)
      .where(sql`${t.state} = 'pending'`),
    check(
      'fork_trust_access_requests_state_check',
      sql`${t.state} IN ('pending', 'approved', 'declined', 'revoked')`
    ),
    check(
      'fork_trust_access_requests_reason_check',
      sql`${t.reason} IS NULL OR char_length(${t.reason}) <= 500`
    ),
  ]
)

/**
 * Short dated posts on the Updates tab (phase 4, D-TS8). Publishing notifies
 * subscribers once: `notified_at` is claimed in the same statement that finds
 * it empty, so a second publish, or an unpublish and republish, never re-sends.
 */
export const forkTrustUpdates = pgTable(
  'fork_trust_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    linkUrl: text('link_url'),
    linkLabel: text('link_label'),
    status: text('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    ...audit(),
  },
  (t) => [
    index('fork_trust_updates_published_idx').on(t.status, t.publishedAt),
    check('fork_trust_updates_status_check', sql`${t.status} IN ('draft', 'published')`),
    check('fork_trust_updates_title_check', sql`char_length(${t.title}) <= 160`),
    check('fork_trust_updates_body_check', sql`char_length(${t.body}) <= 2000`),
  ]
)

/** Who hears about new updates (phase 4). One row per person; unsubscribing keeps it. */
export const forkTrustSubscriptions = pgTable(
  'fork_trust_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    principalId: typeIdColumn('principal')('principal_id')
      .notNull()
      .references(() => principal.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('fork_trust_subscriptions_principal_uq').on(t.principalId)]
)

/**
 * One row per subscriber per channel for each published update (review
 * 2026-11-15, finding 3). Written in the same transaction as the first
 * publish, then worked off: a sender claims rows with `FOR UPDATE SKIP LOCKED`,
 * so two senders never take the same row, and a failure stays visible and
 * retryable rather than lost. `sending` rows older than the lease are
 * reclaimed after a crash; the email's idempotency key is the row id.
 */
export const forkTrustUpdateDeliveries = pgTable(
  'fork_trust_update_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    updateId: uuid('update_id')
      .notNull()
      .references(() => forkTrustUpdates.id, { onDelete: 'cascade' }),
    principalId: typeIdColumn('principal')('principal_id')
      .notNull()
      .references(() => principal.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    state: text('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fork_trust_update_deliveries_uq').on(t.updateId, t.principalId, t.channel),
    index('fork_trust_update_deliveries_state_idx').on(t.updateId, t.state),
    check('fork_trust_update_deliveries_channel_check', sql`${t.channel} IN ('in_app', 'email')`),
    check(
      'fork_trust_update_deliveries_state_check',
      sql`${t.state} IN ('pending', 'sending', 'sent', 'failed', 'skipped')`
    ),
  ]
)

/**
 * Trust files waiting to be removed from storage (review 2026-11-15, finding
 * 5). A key is queued in the same transaction that stops using it (a deleted
 * document, a replaced file) and removed after commit; a failure stays here
 * with its error, so an orphaned key is always findable and retried. The
 * private `fork-trust/` prefix is outside upstream's file retention, so
 * nothing else would ever clean it up.
 */
export const forkTrustStorageCleanup = pgTable(
  'fork_trust_storage_cleanup',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storageKey: text('storage_key').notNull(),
    reason: text('reason').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fork_trust_storage_cleanup_key_uq').on(t.storageKey)]
)
