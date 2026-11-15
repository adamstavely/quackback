import { useId, useState, type FormEvent, type ReactElement } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

/** One form field. Every list on the trust admin page is edited through these. */
export type TrustField =
  | {
      name: string
      label: string
      kind: 'text' | 'textarea'
      max: number
      required?: boolean
      hint?: string
      type?: 'email' | 'url'
    }
  | {
      name: string
      label: string
      kind: 'select'
      options: { value: string; label: string }[]
      hint?: string
    }
  | { name: string; label: string; kind: 'switch'; hint?: string }

export type TrustFormValues = Record<string, string | boolean>

/**
 * A form dialog for one trust item. The server validates too; its message is
 * shown under the form (and announced) when a save is refused.
 */
export function TrustItemDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  fields: TrustField[]
  initial: TrustFormValues
  submitLabel: string
  onSubmit: (values: TrustFormValues) => Promise<void>
}): ReactElement {
  const ids = useId()
  const [values, setValues] = useState<TrustFormValues>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (name: string, value: string | boolean) =>
    setValues((current) => ({ ...current, [name]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {fields.map((field) => {
              const id = `${ids}-${field.name}`
              const hintId = field.hint ? `${id}-hint` : undefined
              const hint = field.hint ? (
                <p id={hintId} className="text-xs text-muted-foreground">
                  {field.hint}
                </p>
              ) : null
              if (field.kind === 'switch') {
                return (
                  <div key={field.name} className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={id}>{field.label}</Label>
                      {hint}
                    </div>
                    <Switch
                      id={id}
                      checked={values[field.name] === true}
                      onCheckedChange={(checked) => set(field.name, checked)}
                      aria-describedby={hintId}
                    />
                  </div>
                )
              }
              if (field.kind === 'select') {
                return (
                  <div key={field.name} className="flex flex-col gap-1.5">
                    <Label htmlFor={id}>{field.label}</Label>
                    <Select
                      value={String(values[field.name] ?? '')}
                      onValueChange={(value) => set(field.name, String(value))}
                    >
                      <SelectTrigger id={id} className="w-full" aria-describedby={hintId}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {hint}
                  </div>
                )
              }
              const value = String(values[field.name] ?? '')
              return (
                <div key={field.name} className="flex flex-col gap-1.5">
                  <Label htmlFor={id}>
                    {field.label}
                    {field.required ? null : (
                      <span className="font-normal text-muted-foreground"> (optional)</span>
                    )}
                  </Label>
                  {field.kind === 'textarea' ? (
                    <Textarea
                      id={id}
                      value={value}
                      maxLength={field.max}
                      required={field.required}
                      rows={3}
                      aria-describedby={hintId}
                      onChange={(event) => set(field.name, event.target.value)}
                    />
                  ) : (
                    <Input
                      id={id}
                      type={field.type ?? 'text'}
                      value={value}
                      maxLength={field.max}
                      required={field.required}
                      aria-describedby={hintId}
                      onChange={(event) => set(field.name, event.target.value)}
                    />
                  )}
                  {hint}
                </div>
              )
            })}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
