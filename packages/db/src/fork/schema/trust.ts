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
import { typeIdColumnNullable } from '@quackback/ids/drizzle'
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
