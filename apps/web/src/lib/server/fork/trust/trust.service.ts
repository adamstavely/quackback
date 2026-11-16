import type { PrincipalId } from '@quackback/ids'
import {
  forkTrustComplianceItems,
  forkTrustControlGroups,
  forkTrustControls,
  forkTrustDocumentGroups,
  forkTrustDocuments,
  forkTrustSubprocessors,
} from '@/lib/server/fork/db'
import { and, asc, db, eq, inArray, sql, type Transaction } from '@/lib/server/db'
import { recordAuditEventInTransaction, type AuditActor } from '@/lib/server/audit/log'
import type { ForkAuditEventType } from '@/lib/server/fork/audit-events'
import { forgetForkFeatures, forkFeatures } from '@/lib/server/fork/settings/features'
import { ConflictError, NotFoundError, ValidationError } from '@/lib/shared/errors'
import type { TrustConfig, TrustEntity, TrustItem } from '@/lib/shared/fork/trust/schema'
import type {
  TrustAdminData,
  TrustComplianceItem,
  TrustControl,
  TrustControlGroup,
  TrustDocument,
  TrustDocumentGroup,
  TrustSubprocessor,
} from '@/lib/shared/fork/trust/types'
import { trustConfig } from './settings'

/**
 * Admin writes for the Trust & Security page (plans/v2/70-trust-security.md).
 * Each write runs in one transaction with its audit row, so an audit failure
 * rolls the change back. Every list is ordered by `position`; controls and
 * documents are ordered within their group.
 */
export interface TrustWriter {
  principalId: PrincipalId
  audit: AuditActor
  headers?: Headers
}

const TABLES = {
  complianceItem: forkTrustComplianceItems,
  controlGroup: forkTrustControlGroups,
  control: forkTrustControls,
  subprocessor: forkTrustSubprocessors,
  documentGroup: forkTrustDocumentGroups,
  document: forkTrustDocuments,
} as const

/** Lists ordered within a parent rather than as a whole. */
const GROUPED: Partial<Record<TrustEntity, true>> = { control: true, document: true }

const TARGETS: Record<TrustEntity, string> = {
  complianceItem: 'fork_trust_compliance_item',
  controlGroup: 'fork_trust_control_group',
  control: 'fork_trust_control',
  subprocessor: 'fork_trust_subprocessor',
  documentGroup: 'fork_trust_document_group',
  document: 'fork_trust_document',
}

// Every trust table shares these columns; the per-table types differ only in
// the rest, so the generic paths below work on this shape.
type Shared = typeof forkTrustSubprocessors
type Row = Record<string, unknown> & { id: string; position: number }

function table(entity: TrustEntity): Shared {
  return TABLES[entity] as unknown as Shared
}

function groupColumn(entity: TrustEntity) {
  return (TABLES[entity] as typeof forkTrustControls).groupId
}

/** Dates become ISO strings and audit-only columns are dropped. */
function dto<T>(row: Row): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'createdAt' || key === 'updatedByPrincipalId' || key === 'storageKey') continue
    out[key] = value instanceof Date ? value.toISOString() : value
  }
  return out as T
}

async function list(entity: TrustEntity) {
  const t = table(entity)
  const order = GROUPED[entity] ? [asc(groupColumn(entity)), asc(t.position)] : [asc(t.position)]
  return (await db
    .select()
    .from(t)
    .orderBy(...order)) as unknown as Row[]
}

export async function getTrustAdminData(): Promise<TrustAdminData> {
  const [features, config, compliance, groups, controls, subs, docGroups, docs] = await Promise.all(
    [
      forkFeatures.read(),
      trustConfig.read(),
      list('complianceItem'),
      list('controlGroup'),
      list('control'),
      list('subprocessor'),
      list('documentGroup'),
      list('document'),
    ]
  )
  return {
    enabled: features.trust,
    config,
    complianceItems: compliance.map(dto<TrustComplianceItem>),
    controlGroups: groups.map(dto<TrustControlGroup>),
    controls: controls.map(dto<TrustControl>),
    subprocessors: subs.map(dto<TrustSubprocessor>),
    documentGroups: docGroups.map(dto<TrustDocumentGroup>),
    documents: docs.map(dto<TrustDocument>),
  }
}

async function audit(
  tx: Transaction,
  writer: TrustWriter,
  event: ForkAuditEventType,
  target: { type: string; id: string | null },
  before: unknown,
  after: unknown
): Promise<void> {
  await recordAuditEventInTransaction(tx, {
    event,
    actor: writer.audit,
    headers: writer.headers,
    target,
    before,
    after,
    metadata: { principalId: writer.principalId },
  })
}

async function locked(tx: Transaction, entity: TrustEntity, id: string): Promise<Row> {
  const t = table(entity)
  const [row] = (await tx
    .select()
    .from(t)
    .where(eq(t.id, id))
    .limit(1)
    .for('update')) as unknown as Row[]
  if (!row) throw new NotFoundError('TRUST_ITEM_NOT_FOUND', 'That item no longer exists')
  return row
}

async function assertExists(
  tx: Transaction,
  entity: TrustEntity,
  id: string,
  message: string
): Promise<void> {
  const t = table(entity)
  const [row] = await tx.select({ id: t.id }).from(t).where(eq(t.id, id)).limit(1)
  if (!row) throw new ValidationError('TRUST_PARENT_NOT_FOUND', message)
}

/** The columns a save writes, after checking the rows it points at exist. */
async function fieldsFor(tx: Transaction, input: TrustItem): Promise<Record<string, unknown>> {
  const { entity, values } = input
  switch (entity) {
    case 'complianceItem':
      if (values.documentId) {
        await assertExists(
          tx,
          'document',
          values.documentId,
          'The linked document no longer exists'
        )
      }
      return {
        name: values.name,
        label: values.label,
        detail: values.detail,
        documentId: values.documentId ?? null,
      }
    case 'controlGroup':
      return { name: values.name, description: values.description }
    case 'control':
      await assertExists(tx, 'controlGroup', values.groupId, 'That control group no longer exists')
      return {
        groupId: values.groupId,
        name: values.name,
        description: values.description,
        status: values.status,
      }
    case 'subprocessor':
      return {
        name: values.name,
        purpose: values.purpose,
        location: values.location,
        dataCategories: values.dataCategories,
        website: values.website,
      }
    case 'documentGroup':
      return { name: values.name }
    case 'document':
      await assertExists(
        tx,
        'documentGroup',
        values.groupId,
        'That document group no longer exists'
      )
      return {
        groupId: values.groupId,
        title: values.title,
        description: values.description,
        access: values.access,
        published: values.published,
      }
  }
}

/** The next position at the end of a list (or of one group's list). */
async function nextPosition(
  tx: Transaction,
  entity: TrustEntity,
  groupId: unknown
): Promise<number> {
  const t = table(entity)
  const where = GROUPED[entity] ? eq(groupColumn(entity), groupId as string) : undefined
  const [row] = await tx
    .select({ max: sql<number | null>`max(${t.position})` })
    .from(t)
    .where(where)
  return (row?.max ?? -1) + 1
}

/** `input` is already validated (`trustItemInputSchema`). */
export async function saveTrustItem<T>(writer: TrustWriter, input: TrustItem): Promise<T> {
  const { entity } = input
  const id = input.values.id
  const t = table(entity)
  return db.transaction(async (tx) => {
    const fields: Record<string, unknown> = {
      ...(await fieldsFor(tx, input)),
      updatedByPrincipalId: writer.principalId,
      updatedAt: new Date(),
    }
    const target = { type: TARGETS[entity] }
    if (!id) {
      const position = await nextPosition(tx, entity, fields.groupId)
      const [row] = (await tx
        .insert(t)
        .values({ ...fields, position } as never)
        .returning()) as unknown as Row[]
      const created = dto<T>(row!)
      await audit(tx, writer, 'fork_trust.created', { ...target, id: row!.id }, null, created)
      return created
    }
    const before = await locked(tx, entity, id)
    // Moving a control or document to another group puts it at that group's end.
    const moved = GROUPED[entity] && before.groupId !== fields.groupId
    const position = moved ? await nextPosition(tx, entity, fields.groupId) : before.position
    const [row] = (await tx
      .update(t)
      .set({ ...fields, position } as never)
      .where(eq(t.id, id))
      .returning()) as unknown as Row[]
    const updated = dto<T>(row!)
    await audit(tx, writer, 'fork_trust.updated', { ...target, id }, dto(before), updated)
    return updated
  })
}

export async function deleteTrustItem(
  writer: TrustWriter,
  entity: TrustEntity,
  id: string
): Promise<void> {
  const t = table(entity)
  await db.transaction(async (tx) => {
    const before = await locked(tx, entity, id)
    if (entity === 'documentGroup') {
      const [doc] = await tx
        .select({ id: forkTrustDocuments.id })
        .from(forkTrustDocuments)
        .where(eq(forkTrustDocuments.groupId, id))
        .limit(1)
      if (doc) {
        throw new ConflictError(
          'TRUST_GROUP_NOT_EMPTY',
          'Move or delete the documents in this group first'
        )
      }
    }
    // A control group takes its controls with it (the confirmation says so).
    await tx.delete(t).where(eq(t.id, id))
    await audit(tx, writer, 'fork_trust.deleted', { type: TARGETS[entity], id }, dto(before), null)
  })
}

/**
 * Set a list's order. `ids` must be the whole list (or the whole of one
 * group), so a stale screen cannot drop an item another admin just added.
 */
export async function reorderTrustItems(
  writer: TrustWriter,
  entity: TrustEntity,
  ids: string[]
): Promise<void> {
  const t = table(entity)
  await db.transaction(async (tx) => {
    const rows = (await tx
      .select()
      .from(t)
      .where(inArray(t.id, ids))
      .for('update')) as unknown as Row[]
    if (rows.length !== ids.length || new Set(ids).size !== ids.length) {
      throw new ConflictError('TRUST_ORDER_STALE', 'The list changed. Refresh and try again.')
    }
    let scope = undefined
    if (GROUPED[entity]) {
      const groups = new Set(rows.map((row) => row.groupId))
      if (groups.size !== 1) {
        throw new ValidationError('TRUST_ORDER_GROUPS', 'Reorder one group at a time')
      }
      scope = eq(groupColumn(entity), [...groups][0] as string)
    }
    const [total] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(t)
      .where(scope)
    if (total?.n !== ids.length) {
      throw new ConflictError('TRUST_ORDER_STALE', 'The list changed. Refresh and try again.')
    }
    for (const [position, id] of ids.entries()) {
      await tx
        .update(t)
        .set({ position } as never)
        .where(and(eq(t.id, id)))
    }
    await audit(
      tx,
      writer,
      'fork_trust.reordered',
      { type: TARGETS[entity], id: null },
      rows.map((row) => row.id),
      ids
    )
  })
}

export async function updateTrustConfig(
  writer: TrustWriter,
  config: TrustConfig
): Promise<TrustConfig> {
  return db.transaction(async (tx) => {
    const before = await trustConfig.read(tx)
    const after = await trustConfig.write(config, writer.principalId, tx)
    await audit(
      tx,
      writer,
      'fork_trust.config_updated',
      { type: 'fork_trust', id: null },
      before,
      after
    )
    return after
  })
}

/** Turning the page on or off is a workspace setting, like announcements. */
export async function setTrustEnabled(writer: TrustWriter, enabled: boolean): Promise<boolean> {
  const result = await db.transaction(async (tx) => {
    const before = await forkFeatures.read(tx)
    const after = await forkFeatures.write({ ...before, trust: enabled }, writer.principalId, tx)
    await audit(
      tx,
      writer,
      'fork_trust.config_updated',
      { type: 'fork_trust', id: null },
      { enabled: before.trust },
      { enabled }
    )
    return after.trust
  })
  forgetForkFeatures()
  return result
}
