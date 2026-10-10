import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { typeIdColumnNullable } from '@quackback/ids/drizzle'
import { principal } from '../../schema/auth'

/**
 * Workspace configuration owned by the fork (conventions §3.5): one row per
 * key, validated by its reader with zod and defaulted on read. Fork config
 * never becomes a new column on upstream's `settings` table.
 */
export const forkSettings = pgTable('fork_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedByPrincipalId: typeIdColumnNullable('principal')('updated_by_principal_id').references(
    () => principal.id,
    { onDelete: 'set null' }
  ),
})
