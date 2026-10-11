import { useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateTimePicker } from '@/components/ui/datetime-picker'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { adminQueries } from '@/lib/client/queries/admin'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { useUpsertAnnouncement } from '@/lib/client/fork/announcements'
import { fillPlaceholders, listPlaceholders } from '@/lib/shared/fork/announcements/placeholders'
import { KIND_PRESETS } from '@/lib/shared/fork/announcements/presets'
import {
  announcementInputSchema,
  type AnnouncementTemplate,
} from '@/lib/shared/fork/announcements/schema'
import {
  ANNOUNCEMENT_KINDS,
  type Announcement,
  type AnnouncementKind,
  type AnnouncementSurface,
  type AudienceTier,
} from '@/lib/shared/fork/announcements/types'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { cn } from '@/lib/shared/utils'
import { Route } from '@/routes/admin/announcements'
import { BannerBar } from '../banner-bar'
import { KIND_STYLES } from '../kind-styles'

const DEFAULT_LINK_LABEL = 'View details'

type FieldName =
  | 'kind'
  | 'title'
  | 'body'
  | 'linkUrl'
  | 'linkLabel'
  | 'surfaces'
  | 'segmentIds'
  | 'publishAt'
  | 'expiresAt'
  | 'placeholders'

const FIELD_ORDER: FieldName[] = [
  'placeholders',
  'kind',
  'title',
  'body',
  'linkUrl',
  'linkLabel',
  'surfaces',
  'segmentIds',
  'publishAt',
  'expiresAt',
]

/** Formats a placeholder value the author picked, as plain text in their locale. */
function formatPlaceholder(name: string, raw: string): string {
  if (!raw) return raw
  if (name === 'date') {
    const date = new Date(`${raw}T00:00:00`)
    return Number.isNaN(date.getTime())
      ? raw
      : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }
  return raw
}

const PLACEHOLDER_INPUT: Record<string, 'date' | 'time'> = {
  date: 'date',
  time: 'time',
  start: 'time',
  end: 'time',
}

interface AnnouncementEditorProps {
  /** null when creating. */
  announcement: Announcement | null
  templates: AnnouncementTemplate[]
}

/**
 * Create or edit an announcement. The preview is the real banner component,
 * so what the author sees is what viewers get. Read-only for viewers without
 * `announcement.manage` and for archived announcements.
 */
export function AnnouncementEditor({
  announcement,
  templates,
}: AnnouncementEditorProps): ReactElement {
  const navigate = useNavigate({ from: Route.fullPath })
  const canManage = usePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE)
  const upsert = useUpsertAnnouncement()
  const ids = useId()
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})

  const readOnly = !canManage || announcement?.status === 'archived'
  const isNew = announcement === null

  const [kind, setKind] = useState<AnnouncementKind>(announcement?.kind ?? 'info')
  const [title, setTitle] = useState(announcement?.title ?? '')
  const [body, setBody] = useState(announcement?.body ?? '')
  const [linkUrl, setLinkUrl] = useState(announcement?.linkUrl ?? '')
  const [linkLabel, setLinkLabel] = useState(announcement?.linkLabel ?? '')
  const [surfaces, setSurfaces] = useState<AnnouncementSurface[]>(
    announcement?.surfaces ?? ['portal']
  )
  const [tier, setTier] = useState<AudienceTier>(announcement?.audience.tier ?? 'authenticated')
  const [segmentIds, setSegmentIds] = useState<string[]>(announcement?.audience.segmentIds ?? [])
  const [startMode, setStartMode] = useState<'now' | 'at'>(isNew ? 'now' : 'at')
  const [publishAt, setPublishAt] = useState<Date | undefined>(
    announcement ? new Date(announcement.publishAt) : undefined
  )
  const [endMode, setEndMode] = useState<'none' | 'at'>(announcement?.expiresAt ? 'at' : 'none')
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(
    announcement?.expiresAt ? new Date(announcement.expiresAt) : undefined
  )
  const [priority, setPriority] = useState(String(announcement?.priority ?? 0))
  const [templateId, setTemplateId] = useState<string>('')
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})

  const segments = useQuery({ ...adminQueries.segments(), enabled: tier === 'segments' })

  // Placeholders come only from a picked template; literal braces typed by hand are just text.
  const placeholders = useMemo(() => {
    const template = templates.find((t) => t.id === templateId)
    return template
      ? listPlaceholders(template.title, template.body, template.linkUrl, template.linkLabel)
      : []
  }, [templateId, templates])

  const filledValues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(placeholderValues)
          .filter(([, v]) => v.trim())
          .map(([k, v]) => [k, formatPlaceholder(k, v.trim())])
      ),
    [placeholderValues]
  )
  const fill = (text: string) => fillPlaceholders(text, filledValues)

  const close = () => void navigate({ search: (prev) => ({ ...prev, edit: undefined }) })

  const applyTemplate = (id: string) => {
    const template = templates.find((t) => t.id === id)
    if (!template) return
    setTemplateId(id)
    setKind(template.kind)
    setTitle(template.title)
    setBody(template.body ?? '')
    setLinkUrl(template.linkUrl ?? '')
    setLinkLabel(template.linkLabel ?? '')
    setPlaceholderValues({})
    if (template.kind === 'success' && endMode === 'none') {
      setEndMode('at')
      setExpiresAt(new Date(Date.now() + 24 * 60 * 60 * 1000))
    }
  }

  const willSchedule = startMode === 'at' && !!publishAt && publishAt.getTime() > Date.now()
  const primaryLabel =
    announcement?.status === 'published' ? 'Save changes' : willSchedule ? 'Schedule' : 'Publish'

  const showErrors = (next: Partial<Record<FieldName, string>>) => {
    setErrors(next)
    const first = FIELD_ORDER.find((name) => next[name])
    if (first) fieldRefs.current[first]?.focus()
  }

  const submit = (status: 'draft' | 'published') => {
    const unfilled = placeholders.filter((name) => !filledValues[name])
    if (status === 'published' && unfilled.length > 0) {
      showErrors({
        placeholders: `Fill in ${unfilled.map((n) => `{${n}}`).join(', ')} before publishing.`,
      })
      return
    }

    const parsed = announcementInputSchema.safeParse({
      id: announcement?.id,
      kind,
      title: fill(title),
      body: fill(body) || null,
      linkUrl: fill(linkUrl) || null,
      linkLabel: fill(linkLabel) || null,
      status,
      publishAt: startMode === 'at' && publishAt ? publishAt.toISOString() : null,
      expiresAt: endMode === 'at' && expiresAt ? expiresAt.toISOString() : null,
      priority: Number(priority),
      surfaces,
      audience: { tier, segmentIds: tier === 'segments' ? segmentIds : [] },
    })

    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = (issue.path.includes('segmentIds') ? 'segmentIds' : issue.path[0]) as FieldName
        if (!next[key]) next[key] = issue.message
      }
      if (startMode === 'at' && !publishAt) next.publishAt = 'Pick when it starts'
      if (endMode === 'at' && !expiresAt) next.expiresAt = 'Pick when it ends'
      showErrors(next)
      return
    }
    if (endMode === 'at' && !expiresAt) return showErrors({ expiresAt: 'Pick when it ends' })
    if (startMode === 'at' && !publishAt) return showErrors({ publishAt: 'Pick when it starts' })

    setErrors({})
    upsert.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(
          status === 'draft'
            ? 'Draft saved'
            : willSchedule
              ? 'Announcement scheduled'
              : 'Announcement published'
        )
        close()
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save'),
    })
  }

  const errorId = (name: FieldName) => `${ids}-${name}-error`
  const fieldProps = (name: FieldName) => ({
    ref: (el: HTMLElement | null) => {
      fieldRefs.current[name] = el
    },
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? errorId(name) : undefined,
  })
  const FieldError = ({ name }: { name: FieldName }) =>
    errors[name] ? (
      <p id={errorId(name)} className="text-xs font-medium text-destructive">
        {errors[name]}
      </p>
    ) : null

  const previewTitle = fill(title).trim() || 'Your title appears here'
  const previewLinkUrl = fill(linkUrl).trim()

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? 'Announcement' : isNew ? 'New announcement' : 'Edit announcement'}
          </DialogTitle>
          <DialogDescription>
            Shows as a banner in the portal and, if you choose, in apps that embed it. Everyone can
            dismiss it.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit('published')
          }}
        >
          <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-5">
            {isNew && templates.length > 0 ? (
              <Field label="Start from a template" htmlFor={`${ids}-template`}>
                <Select value={templateId} onValueChange={(v) => applyTemplate(String(v))}>
                  <SelectTrigger id={`${ids}-template`} className="w-full">
                    <SelectValue placeholder="Choose a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            {placeholders.length > 0 ? (
              <fieldset className="flex flex-col gap-3 rounded-[var(--radius)] border border-border p-4">
                <legend className="px-1 text-sm font-medium text-foreground">
                  Fill in the template
                </legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {placeholders.map((name, i) => (
                    <Field key={name} label={name} htmlFor={`${ids}-ph-${name}`}>
                      <Input
                        id={`${ids}-ph-${name}`}
                        type={PLACEHOLDER_INPUT[name] ?? 'text'}
                        value={placeholderValues[name] ?? ''}
                        onChange={(e) =>
                          setPlaceholderValues((prev) => ({ ...prev, [name]: e.target.value }))
                        }
                        {...(i === 0 ? fieldProps('placeholders') : {})}
                      />
                    </Field>
                  ))}
                </div>
                <FieldError name="placeholders" />
              </fieldset>
            ) : null}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-foreground">Type</legend>
              <RadioGroup
                value={kind}
                onValueChange={(v) => setKind(v as AnnouncementKind)}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
              >
                {ANNOUNCEMENT_KINDS.map((k) => {
                  const Icon = KIND_STYLES[k].icon
                  return (
                    <Label
                      key={k}
                      htmlFor={`${ids}-kind-${k}`}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border px-2.5 py-2 text-sm font-normal has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                        kind === k
                          ? cn(KIND_STYLES[k].surface, 'border-foreground/60')
                          : 'border-border hover:bg-muted/40'
                      )}
                    >
                      <RadioGroupItem id={`${ids}-kind-${k}`} value={k} className="sr-only" />
                      <Icon
                        aria-hidden
                        className={cn('size-4 shrink-0', KIND_STYLES[k].iconColor)}
                      />
                      {KIND_PRESETS[k].label}
                    </Label>
                  )
                })}
              </RadioGroup>
            </fieldset>

            <Field label="Title" htmlFor={`${ids}-title`} hint="Up to 140 characters.">
              <Input
                id={`${ids}-title`}
                value={title}
                maxLength={140}
                required
                onChange={(e) => setTitle(e.target.value)}
                {...fieldProps('title')}
              />
              <FieldError name="title" />
            </Field>

            <Field
              label="Text (optional)"
              htmlFor={`${ids}-body`}
              hint="Plain text, up to 500 characters."
            >
              <Textarea
                id={`${ids}-body`}
                value={body}
                maxLength={500}
                rows={3}
                onChange={(e) => setBody(e.target.value)}
                {...fieldProps('body')}
              />
              <FieldError name="body" />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label="Link (optional)" htmlFor={`${ids}-link-url`}>
                <Input
                  id={`${ids}-link-url`}
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  {...fieldProps('linkUrl')}
                />
                <FieldError name="linkUrl" />
              </Field>
              <Field label="Link text" htmlFor={`${ids}-link-label`}>
                <Input
                  id={`${ids}-link-label`}
                  placeholder={DEFAULT_LINK_LABEL}
                  value={linkLabel}
                  maxLength={60}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  {...fieldProps('linkLabel')}
                />
                <FieldError name="linkLabel" />
              </Field>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Show it in</legend>
              {(
                [
                  ['portal', 'The portal'],
                  ['embed', 'Apps that embed the banner'],
                ] as const
              ).map(([surface, label], i) => (
                <div key={surface} className="flex items-center gap-2">
                  <Checkbox
                    id={`${ids}-surface-${surface}`}
                    checked={surfaces.includes(surface)}
                    onCheckedChange={(checked) =>
                      setSurfaces((prev) =>
                        checked
                          ? [...new Set([...prev, surface])]
                          : prev.filter((s) => s !== surface)
                      )
                    }
                    {...(i === 0 ? fieldProps('surfaces') : {})}
                  />
                  <Label htmlFor={`${ids}-surface-${surface}`} className="font-normal">
                    {label}
                  </Label>
                </div>
              ))}
              <FieldError name="surfaces" />
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Who sees it</legend>
              <RadioGroup value={tier} onValueChange={(v) => setTier(v as AudienceTier)}>
                <RadioRow id={`${ids}-tier-all`} value="authenticated" label="Everyone" />
                <RadioRow id={`${ids}-tier-seg`} value="segments" label="Specific segments" />
              </RadioGroup>
              {tier === 'segments' ? (
                <div
                  className="ml-6 flex max-h-44 flex-col gap-2 overflow-y-auto rounded-[var(--radius)] border border-border p-3"
                  role="group"
                  aria-label="Segments"
                >
                  {segments.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading segments…</p>
                  ) : (segments.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This workspace has no segments yet.
                    </p>
                  ) : (
                    (segments.data ?? []).map((segment, i) => (
                      <div key={segment.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`${ids}-segment-${segment.id}`}
                          checked={segmentIds.includes(segment.id)}
                          onCheckedChange={(checked) =>
                            setSegmentIds((prev) =>
                              checked
                                ? [...prev, segment.id]
                                : prev.filter((id) => id !== segment.id)
                            )
                          }
                          {...(i === 0 ? fieldProps('segmentIds') : {})}
                        />
                        <Label htmlFor={`${ids}-segment-${segment.id}`} className="font-normal">
                          {segment.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
              <FieldError name="segmentIds" />
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Starts</legend>
                <RadioGroup
                  value={startMode}
                  onValueChange={(v) => setStartMode(v as 'now' | 'at')}
                >
                  <RadioRow
                    id={`${ids}-start-now`}
                    value="now"
                    label={isNew ? 'Now' : 'Now (on save)'}
                  />
                  <RadioRow id={`${ids}-start-at`} value="at" label="At a set time" />
                </RadioGroup>
                {startMode === 'at' ? (
                  <div {...fieldProps('publishAt')} tabIndex={-1} className="outline-none">
                    <DateTimePicker
                      value={publishAt}
                      onChange={setPublishAt}
                      placeholder="Pick a start"
                    />
                  </div>
                ) : null}
                <FieldError name="publishAt" />
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Ends</legend>
                <RadioGroup value={endMode} onValueChange={(v) => setEndMode(v as 'none' | 'at')}>
                  <RadioRow id={`${ids}-end-none`} value="none" label="When archived" />
                  <RadioRow id={`${ids}-end-at`} value="at" label="At a set time" />
                </RadioGroup>
                {endMode === 'at' ? (
                  <div {...fieldProps('expiresAt')} tabIndex={-1} className="outline-none">
                    <DateTimePicker
                      value={expiresAt}
                      onChange={setExpiresAt}
                      minDate={new Date()}
                      placeholder="Pick an end"
                    />
                  </div>
                ) : null}
                <FieldError name="expiresAt" />
              </fieldset>
            </div>

            <Field
              label="Priority"
              htmlFor={`${ids}-priority`}
              hint="Among banners of the same type, higher shows first."
            >
              <Select value={priority} onValueChange={(v) => setPriority(String(v))}>
                <SelectTrigger id={`${ids}-priority`} className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Normal</SelectItem>
                  <SelectItem value="10">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </fieldset>

          <section aria-labelledby={`${ids}-preview`} className="flex flex-col gap-2">
            <h3 id={`${ids}-preview`} className="text-sm font-medium text-foreground">
              Preview
            </h3>
            <BannerBar
              announce={false}
              item={{
                kind,
                title: previewTitle,
                body: fill(body).trim() || null,
                link: previewLinkUrl
                  ? { url: previewLinkUrl, label: fill(linkLabel).trim() || DEFAULT_LINK_LABEL }
                  : null,
              }}
            />
          </section>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={close}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {readOnly ? null : (
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {announcement?.status !== 'published' ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={upsert.isPending}
                    onClick={() => submit('draft')}
                  >
                    Save draft
                  </Button>
                ) : null}
                <Button type="submit" disabled={upsert.isPending}>
                  {primaryLabel}
                </Button>
              </div>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function RadioRow({
  id,
  value,
  label,
}: {
  id: string
  value: string
  label: string
}): ReactElement {
  return (
    <div className="flex min-h-6 items-center gap-2">
      {/* Centres the dot: the platform radio leaves its indicator at the top of the circle. */}
      <RadioGroupItem id={id} value={value} className="flex items-center justify-center" />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  )
}
