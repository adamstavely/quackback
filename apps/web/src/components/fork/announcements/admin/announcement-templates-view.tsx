import { useId, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { DocumentDuplicateIcon, PlusIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { useSaveAnnouncementTemplates } from '@/lib/client/fork/announcements'
import { KIND_PRESETS } from '@/lib/shared/fork/announcements/presets'
import {
  announcementTemplateSchema,
  type AnnouncementTemplate,
} from '@/lib/shared/fork/announcements/schema'
import { ANNOUNCEMENT_KINDS, type AnnouncementKind } from '@/lib/shared/fork/announcements/types'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { cn } from '@/lib/shared/utils'
import { KIND_STYLES } from '../kind-styles'

/**
 * Saved starting points for common notices. Placeholders such as `{date}` or
 * `{service}` become inputs when an author starts from the template.
 */
export function AnnouncementTemplatesView({
  templates,
}: {
  templates: AnnouncementTemplate[]
}): ReactElement {
  const canManage = usePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE)
  const save = useSaveAnnouncementTemplates()
  const [editing, setEditing] = useState<AnnouncementTemplate | 'new' | null>(null)
  const [removing, setRemoving] = useState<AnnouncementTemplate | null>(null)

  const persist = (items: AnnouncementTemplate[], message: string, after?: () => void) =>
    save.mutate(
      { items },
      {
        onSuccess: () => {
          toast.success(message)
          after?.()
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save'),
      }
    )

  return (
    <section aria-labelledby="announcement-templates-heading" className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-border/50 px-3 py-3">
        <h2 id="announcement-templates-heading" className="text-base font-semibold text-foreground">
          Templates
        </h2>
        {canManage ? (
          <Button size="sm" className="ml-auto" onClick={() => setEditing('new')}>
            <PlusIcon aria-hidden className="size-4" />
            New template
          </Button>
        ) : null}
      </div>
      <p className="px-3 pt-3 text-sm text-muted-foreground">
        Words in braces, like <code>{'{date}'}</code> or <code>{'{service}'}</code>, become fields
        to fill in when someone starts an announcement from the template.
      </p>

      {templates.length === 0 ? (
        <EmptyState icon={DocumentDuplicateIcon} title="No templates." className="h-40" />
      ) : (
        <ul
          aria-labelledby="announcement-templates-heading"
          className="divide-y divide-border/50 px-3"
        >
          {templates.map((template) => {
            const style = KIND_STYLES[template.kind]
            const Icon = style.icon
            return (
              <li key={template.id} className="flex items-start gap-3 py-3">
                <span
                  className={cn(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] border',
                    style.surface
                  )}
                >
                  <Icon aria-hidden className={cn('size-4', style.iconColor)} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm font-medium text-foreground">{template.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {KIND_PRESETS[template.kind].label} · {template.title}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(template)}>
                      Edit<span className="sr-only"> {template.name}</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(template)}>
                      Remove<span className="sr-only"> {template.name}</span>
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {editing ? (
        <TemplateDialog
          template={editing === 'new' ? null : editing}
          pending={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            const items =
              editing === 'new'
                ? [...templates, next]
                : templates.map((t) => (t.id === next.id ? next : t))
            persist(items, 'Template saved', () => setEditing(null))
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this template?"
        description="Announcements already made from it are not affected."
        confirmLabel="Remove"
        variant="destructive"
        isPending={save.isPending}
        onConfirm={() => {
          if (!removing) return
          persist(
            templates.filter((t) => t.id !== removing.id),
            'Template removed',
            () => setRemoving(null)
          )
        }}
      />
    </section>
  )
}

function TemplateDialog({
  template,
  pending,
  onClose,
  onSave,
}: {
  template: AnnouncementTemplate | null
  pending: boolean
  onClose: () => void
  onSave: (template: AnnouncementTemplate) => void
}): ReactElement {
  const ids = useId()
  const [name, setName] = useState(template?.name ?? '')
  const [kind, setKind] = useState<AnnouncementKind>(template?.kind ?? 'info')
  const [title, setTitle] = useState(template?.title ?? '')
  const [body, setBody] = useState(template?.body ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const parsed = announcementTemplateSchema.safeParse({
      id: template?.id ?? crypto.randomUUID(),
      name,
      kind,
      title,
      body: body.trim() || null,
      linkUrl: template?.linkUrl ?? null,
      linkLabel: template?.linkLabel ?? null,
    })
    if (!parsed.success) {
      setError('Give the template a name and a title.')
      return
    }
    onSave(parsed.data)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>
            Use braces for anything that changes, like {'{date}'}.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-name`}>Name</Label>
            <Input
              id={`${ids}-name`}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              aria-describedby={error ? `${ids}-error` : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-kind`}>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AnnouncementKind)}>
              <SelectTrigger id={`${ids}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANNOUNCEMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_PRESETS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-title`}>Title</Label>
            <Input
              id={`${ids}-title`}
              value={title}
              maxLength={140}
              onChange={(e) => setTitle(e.target.value)}
              aria-describedby={error ? `${ids}-error` : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-body`}>Text (optional)</Label>
            <Textarea
              id={`${ids}-body`}
              value={body}
              maxLength={500}
              rows={3}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {error ? (
            <p id={`${ids}-error`} role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
