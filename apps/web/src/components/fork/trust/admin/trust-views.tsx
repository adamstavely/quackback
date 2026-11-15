import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import {
  CheckCircleIcon,
  ClockIcon,
  MinusCircleIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useDeleteTrustItem, useSaveTrustItem } from '@/lib/client/fork/trust'
import type { ControlStatus, TrustEntity, TrustItemInput } from '@/lib/shared/fork/trust/schema'
import type { TrustAdminData } from '@/lib/shared/fork/trust/types'
import { TrustItemDialog, type TrustField, type TrustFormValues } from './trust-item-dialog'
import { TrustList, TrustSection } from './trust-list'

/** The dialog that is open, if any: which list, which item (null = new), its start values. */
interface Editing {
  entity: TrustEntity
  id: string | null
  initial: TrustFormValues
}

function useEditor() {
  const [editing, setEditing] = useState<Editing | null>(null)
  const save = useSaveTrustItem()
  const submit = async (values: TrustFormValues) => {
    if (!editing) return
    // An empty choice ("None") means no link.
    const cleaned = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        key === 'documentId' && value === '' ? null : value,
      ])
    )
    const input = {
      entity: editing.entity,
      values: { ...cleaned, ...(editing.id ? { id: editing.id } : {}) },
    } as unknown as TrustItemInput
    await save.mutateAsync(input as never)
    toast.success(editing.id ? 'Saved' : 'Added')
  }
  return { editing, setEditing, submit }
}

const str = (value: string | null | undefined) => value ?? ''

function AddButton({ label, onClick }: { label: string; onClick: () => void }): ReactElement {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      <PlusIcon aria-hidden className="size-4" />
      {label}
    </Button>
  )
}

function EditorDialog({
  editor,
  title,
  fields,
}: {
  editor: ReturnType<typeof useEditor>
  title: string
  fields: TrustField[]
}): ReactElement | null {
  const { editing, setEditing, submit } = editor
  if (!editing) return null
  return (
    <TrustItemDialog
      key={`${editing.entity}-${editing.id ?? 'new'}`}
      open
      onOpenChange={(open) => (open ? null : setEditing(null))}
      title={editing.id ? `Edit ${title}` : `Add ${title}`}
      fields={fields}
      initial={editing.initial}
      submitLabel={editing.id ? 'Save' : 'Add'}
      onSubmit={submit}
    />
  )
}

// ── Compliance ───────────────────────────────────────────────────────────

export function ComplianceView({
  data,
  canManage,
}: {
  data: TrustAdminData
  canManage: boolean
}): ReactElement {
  const editor = useEditor()
  const documentOptions = [
    { value: '', label: 'None' },
    ...data.documents.map((d) => ({ value: d.id, label: d.title })),
  ]
  const fields: TrustField[] = [
    {
      name: 'name',
      label: 'Name',
      kind: 'text',
      max: 120,
      required: true,
      hint: 'For example, SOC 2 Type II or Authority to operate.',
    },
    {
      name: 'label',
      label: 'Badge text',
      kind: 'text',
      max: 8,
      required: true,
      hint: 'Up to 8 characters, shown in the round badge, e.g. SOC 2.',
    },
    {
      name: 'detail',
      label: 'Detail',
      kind: 'text',
      max: 120,
      hint: 'For example, Valid to March 2027.',
    },
    { name: 'documentId', label: 'Linked document', kind: 'select', options: documentOptions },
  ]
  const open = (id: string | null) => {
    const item = data.complianceItems.find((c) => c.id === id)
    editor.setEditing({
      entity: 'complianceItem',
      id,
      initial: {
        name: str(item?.name),
        label: str(item?.label),
        detail: str(item?.detail),
        documentId: str(item?.documentId),
      },
    })
  }
  return (
    <TrustSection
      id="trust-compliance"
      title="Compliance"
      description="Attestations and approvals shown at the top of the page."
      action={canManage ? <AddButton label="Add item" onClick={() => open(null)} /> : null}
    >
      <TrustList
        entity="complianceItem"
        canManage={canManage}
        emptyText="No compliance items yet."
        onEdit={open}
        rows={data.complianceItems.map((c) => ({
          id: c.id,
          title: c.name,
          meta: c.detail,
          leading: (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-foreground">
              {c.label}
            </span>
          ),
        }))}
        deleteCopy={(row) => ({
          title: `Delete ${row.title}?`,
          description: 'It is removed from the Trust & Security page.',
        })}
      />
      <EditorDialog editor={editor} title="compliance item" fields={fields} />
    </TrustSection>
  )
}

// ── Subprocessors ────────────────────────────────────────────────────────

export function SubprocessorsView({
  data,
  canManage,
}: {
  data: TrustAdminData
  canManage: boolean
}): ReactElement {
  const editor = useEditor()
  const fields: TrustField[] = [
    { name: 'name', label: 'Name', kind: 'text', max: 120, required: true },
    { name: 'purpose', label: 'What it does for us', kind: 'text', max: 300, required: true },
    { name: 'location', label: 'Where data is processed', kind: 'text', max: 120, required: true },
    { name: 'dataCategories', label: 'Data it handles', kind: 'text', max: 300 },
    {
      name: 'website',
      label: 'Website',
      kind: 'text',
      type: 'url',
      max: 500,
      hint: 'A full address, starting https://',
    },
  ]
  const open = (id: string | null) => {
    const item = data.subprocessors.find((s) => s.id === id)
    editor.setEditing({
      entity: 'subprocessor',
      id,
      initial: {
        name: str(item?.name),
        purpose: str(item?.purpose),
        location: str(item?.location),
        dataCategories: str(item?.dataCategories),
        website: str(item?.website),
      },
    })
  }
  return (
    <TrustSection
      id="trust-subprocessors"
      title="Subprocessors"
      description="Other services that handle this app's data."
      action={canManage ? <AddButton label="Add subprocessor" onClick={() => open(null)} /> : null}
    >
      <TrustList
        entity="subprocessor"
        canManage={canManage}
        emptyText="No subprocessors yet."
        onEdit={open}
        rows={data.subprocessors.map((s) => ({
          id: s.id,
          title: s.name,
          meta: [s.purpose, s.location, s.dataCategories].filter(Boolean).join(' · '),
        }))}
        deleteCopy={(row) => ({
          title: `Delete ${row.title}?`,
          description: 'It is removed from the Subprocessors list.',
        })}
      />
      <EditorDialog editor={editor} title="subprocessor" fields={fields} />
    </TrustSection>
  )
}

// ── Grouped lists: controls and documents ────────────────────────────────

function GroupHeader({
  name,
  description,
  canManage,
  onEdit,
  onDelete,
  onAdd,
  addLabel,
}: {
  name: string
  description?: string | null
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onAdd: () => void
  addLabel: string
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-muted/40 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {canManage ? (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onAdd}>
            <PlusIcon aria-hidden className="size-4" />
            {addLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Rename ${name}`}
            onClick={onEdit}
          >
            <PencilSquareIcon aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${name}`}
            onClick={onDelete}
          >
            <TrashIcon aria-hidden className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function useGroupDelete(entity: 'controlGroup' | 'documentGroup') {
  const remove = useDeleteTrustItem()
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)
  const dialog = (description: string) => (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => (open ? null : setTarget(null))}
      title={`Delete ${target?.name ?? ''}?`}
      description={description}
      confirmLabel="Delete group"
      variant="destructive"
      isPending={remove.isPending}
      onConfirm={async () => {
        if (!target) return
        try {
          await remove.mutateAsync({ entity, id: target.id })
          toast.success('Group deleted')
          setTarget(null)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not delete the group')
        }
      }}
    />
  )
  return { ask: setTarget, dialog }
}

const STATUS: Record<
  ControlStatus,
  { label: string; icon: typeof CheckCircleIcon; className: string }
> = {
  in_place: { label: 'In place', icon: CheckCircleIcon, className: 'text-success' },
  in_progress: { label: 'In progress', icon: ClockIcon, className: 'text-warning' },
  not_applicable: {
    label: 'Not applicable',
    icon: MinusCircleIcon,
    className: 'text-muted-foreground',
  },
}

export function ControlsView({
  data,
  canManage,
}: {
  data: TrustAdminData
  canManage: boolean
}): ReactElement {
  const editor = useEditor()
  const groupDelete = useGroupDelete('controlGroup')
  const groupOptions = data.controlGroups.map((g) => ({ value: g.id, label: g.name }))
  const groupFields: TrustField[] = [
    {
      name: 'name',
      label: 'Group name',
      kind: 'text',
      max: 80,
      required: true,
      hint: 'For example, Infrastructure security.',
    },
    { name: 'description', label: 'Description', kind: 'text', max: 300 },
  ]
  const controlFields: TrustField[] = [
    { name: 'groupId', label: 'Group', kind: 'select', options: groupOptions },
    {
      name: 'name',
      label: 'Control',
      kind: 'text',
      max: 160,
      required: true,
      hint: 'For example, Data encrypted at rest.',
    },
    { name: 'description', label: 'Description', kind: 'textarea', max: 1000 },
    {
      name: 'status',
      label: 'Status',
      kind: 'select',
      options: (Object.keys(STATUS) as ControlStatus[]).map((s) => ({
        value: s,
        label: STATUS[s].label,
      })),
    },
  ]
  const openGroup = (id: string | null) => {
    const group = data.controlGroups.find((g) => g.id === id)
    editor.setEditing({
      entity: 'controlGroup',
      id,
      initial: { name: str(group?.name), description: str(group?.description) },
    })
  }
  const openControl = (id: string | null, groupId?: string) => {
    const control = data.controls.find((c) => c.id === id)
    editor.setEditing({
      entity: 'control',
      id,
      initial: {
        groupId: control?.groupId ?? groupId ?? '',
        name: str(control?.name),
        description: str(control?.description),
        status: control?.status ?? 'in_place',
      },
    })
  }
  return (
    <TrustSection
      id="trust-controls"
      title="Controls"
      description="Grouped controls and their status. Controls fed by a tool later show as such."
      action={canManage ? <AddButton label="Add group" onClick={() => openGroup(null)} /> : null}
    >
      {data.controlGroups.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">
          No control groups yet. Add a group, then its controls.
        </p>
      ) : null}
      {data.controlGroups.map((group) => (
        <div key={group.id} className="border-b border-border/60 last:border-b-0">
          <GroupHeader
            name={group.name}
            description={group.description}
            canManage={canManage}
            addLabel="Add control"
            onAdd={() => openControl(null, group.id)}
            onEdit={() => openGroup(group.id)}
            onDelete={() => groupDelete.ask({ id: group.id, name: group.name })}
          />
          <TrustList
            entity="control"
            canManage={canManage}
            emptyText="No controls in this group yet."
            onEdit={(id) => openControl(id)}
            rows={data.controls
              .filter((c) => c.groupId === group.id)
              .map((c) => {
                const status = STATUS[c.status]
                return {
                  id: c.id,
                  title: c.name,
                  meta: c.description,
                  leading: (
                    <status.icon
                      role="img"
                      aria-label={status.label}
                      className={`size-5 shrink-0 ${status.className}`}
                    />
                  ),
                  badges: (
                    <>
                      <Badge variant="outline">{status.label}</Badge>
                      {c.source === 'integration' ? (
                        <Badge variant="secondary">From a tool</Badge>
                      ) : null}
                    </>
                  ),
                }
              })}
            deleteCopy={(row) => ({
              title: `Delete ${row.title}?`,
              description: 'It is removed from the Controls list.',
            })}
          />
        </div>
      ))}
      {groupDelete.dialog('The group and every control in it are removed from the page.')}
      <EditorDialog
        editor={editor}
        title={editor.editing?.entity === 'controlGroup' ? 'control group' : 'control'}
        fields={editor.editing?.entity === 'controlGroup' ? groupFields : controlFields}
      />
    </TrustSection>
  )
}

export function DocumentsView({
  data,
  canManage,
}: {
  data: TrustAdminData
  canManage: boolean
}): ReactElement {
  const editor = useEditor()
  const groupDelete = useGroupDelete('documentGroup')
  const groupFields: TrustField[] = [
    {
      name: 'name',
      label: 'Group name',
      kind: 'text',
      max: 80,
      required: true,
      hint: 'For example, Policies, Reports or Questionnaires.',
    },
  ]
  const documentFields: TrustField[] = [
    {
      name: 'groupId',
      label: 'Group',
      kind: 'select',
      options: data.documentGroups.map((g) => ({ value: g.id, label: g.name })),
    },
    { name: 'title', label: 'Title', kind: 'text', max: 160, required: true },
    { name: 'description', label: 'Description', kind: 'textarea', max: 500 },
    {
      name: 'access',
      label: 'Who can download it',
      kind: 'select',
      options: [
        { value: 'open', label: 'Anyone signed in' },
        { value: 'restricted', label: 'Restricted: people request access, an admin approves' },
      ],
    },
    {
      name: 'published',
      label: 'Show on the page',
      kind: 'switch',
      hint: 'Off keeps it as a draft only admins see.',
    },
  ]
  const openGroup = (id: string | null) => {
    const group = data.documentGroups.find((g) => g.id === id)
    editor.setEditing({ entity: 'documentGroup', id, initial: { name: str(group?.name) } })
  }
  const openDocument = (id: string | null, groupId?: string) => {
    const doc = data.documents.find((d) => d.id === id)
    editor.setEditing({
      entity: 'document',
      id,
      initial: {
        groupId: doc?.groupId ?? groupId ?? '',
        title: str(doc?.title),
        description: str(doc?.description),
        access: doc?.access ?? 'restricted',
        published: doc?.published ?? false,
      },
    })
  }
  return (
    <TrustSection
      id="trust-documents"
      title="Documents"
      description="Policies, reports and questionnaires. Uploading files arrives with the next phase."
      action={canManage ? <AddButton label="Add group" onClick={() => openGroup(null)} /> : null}
    >
      {data.documentGroups.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">
          No document groups yet. Add a group, then its documents.
        </p>
      ) : null}
      {data.documentGroups.map((group) => (
        <div key={group.id} className="border-b border-border/60 last:border-b-0">
          <GroupHeader
            name={group.name}
            canManage={canManage}
            addLabel="Add document"
            onAdd={() => openDocument(null, group.id)}
            onEdit={() => openGroup(group.id)}
            onDelete={() => groupDelete.ask({ id: group.id, name: group.name })}
          />
          <TrustList
            entity="document"
            canManage={canManage}
            emptyText="No documents in this group yet."
            onEdit={(id) => openDocument(id)}
            rows={data.documents
              .filter((d) => d.groupId === group.id)
              .map((d) => ({
                id: d.id,
                title: d.title,
                meta: d.description,
                badges: (
                  <>
                    <Badge variant="outline">
                      {d.access === 'open' ? 'Anyone signed in' : 'Restricted'}
                    </Badge>
                    {d.published ? null : <Badge variant="secondary">Draft</Badge>}
                    {d.fileName ? null : <Badge variant="secondary">No file yet</Badge>}
                  </>
                ),
              }))}
            deleteCopy={(row) => ({
              title: `Delete ${row.title}?`,
              description:
                'It is removed from the page. Compliance items linked to it lose the link.',
            })}
          />
        </div>
      ))}
      {groupDelete.dialog(
        'Only an empty group can be deleted; move or delete its documents first.'
      )}
      <EditorDialog
        editor={editor}
        title={editor.editing?.entity === 'documentGroup' ? 'document group' : 'document'}
        fields={editor.editing?.entity === 'documentGroup' ? groupFields : documentFields}
      />
    </TrustSection>
  )
}
