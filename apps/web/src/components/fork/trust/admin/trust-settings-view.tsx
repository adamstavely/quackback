import { useId, useState, type FormEvent, type ReactElement } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LocalDate } from '@/components/ui/local-date'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { useSetTrustEnabled, useUpdateTrustConfig } from '@/lib/client/fork/trust'
import type { TrustConfig } from '@/lib/shared/fork/trust/schema'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { TrustSection } from './trust-list'

/** The page's own settings: whether it is on, its intro, contacts and access length. */
export function TrustSettingsView({
  enabled,
  config,
  categories,
  canManage,
}: {
  enabled: boolean
  config: TrustConfig
  categories: { id: string; name: string }[]
  canManage: boolean
}): ReactElement {
  const ids = useId()
  const canToggle = usePermission(PERMISSIONS.SETTINGS_MANAGE)
  const setEnabled = useSetTrustEnabled()
  const update = useUpdateTrustConfig()
  const [draft, setDraft] = useState<TrustConfig>(config)
  const [grantDays, setGrantDays] = useState(String(config.grantDays))
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof TrustConfig>(key: K, value: TrustConfig[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const save = (event: FormEvent) => {
    event.preventDefault()
    const days = Number(grantDays)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError('Enter a whole number of days from 1 to 365.')
      return
    }
    setError(null)
    update.mutate(
      { ...draft, grantDays: days },
      {
        onSuccess: () => toast.success('Settings saved'),
        onError: (err) => setError(err instanceof Error ? err.message : 'Could not save'),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <TrustSection id="trust-visibility" title="Trust & Security page">
        <div className="flex items-start justify-between gap-4 px-3 py-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-enabled`}>Show the page in the portal</Label>
            <p id={`${ids}-enabled-hint`} className="text-xs text-muted-foreground">
              {canToggle
                ? 'Signed-in employees see it at /trust once it is on.'
                : 'Only workspace admins can turn the page on or off.'}
            </p>
          </div>
          <Switch
            id={`${ids}-enabled`}
            checked={enabled}
            disabled={!canToggle || setEnabled.isPending}
            aria-describedby={`${ids}-enabled-hint`}
            onCheckedChange={(checked) =>
              setEnabled.mutate(checked, {
                onSuccess: () => toast.success(checked ? 'Page turned on' : 'Page turned off'),
                onError: (err) =>
                  toast.error(err instanceof Error ? err.message : 'Could not change it'),
              })
            }
          />
        </div>
      </TrustSection>

      <TrustSection id="trust-settings" title="Page details">
        <form onSubmit={save} className="flex max-w-2xl flex-col gap-4 px-3 py-4">
          <fieldset disabled={!canManage} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-intro`}>Introduction</Label>
              <Textarea
                id={`${ids}-intro`}
                rows={3}
                maxLength={600}
                value={draft.intro}
                onChange={(e) => set('intro', e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-email`}>Security contact email</Label>
                <Input
                  id={`${ids}-email`}
                  type="email"
                  maxLength={254}
                  value={draft.contactEmail}
                  onChange={(e) => set('contactEmail', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-grant`}>Restricted document access lasts (days)</Label>
                <Input
                  id={`${ids}-grant`}
                  inputMode="numeric"
                  value={grantDays}
                  onChange={(e) => setGrantDays(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-policy`}>Policy link</Label>
                <Input
                  id={`${ids}-policy`}
                  type="url"
                  maxLength={500}
                  placeholder="https://"
                  value={draft.policyUrl}
                  onChange={(e) => set('policyUrl', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-policy-label`}>Policy link text</Label>
                <Input
                  id={`${ids}-policy-label`}
                  maxLength={60}
                  placeholder="Data handling policy"
                  value={draft.policyLabel}
                  onChange={(e) => set('policyLabel', e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-faq`}>FAQ</Label>
              <Select
                value={draft.faqCategoryId ?? ''}
                onValueChange={(value) => set('faqCategoryId', value ? String(value) : null)}
              >
                <SelectTrigger
                  id={`${ids}-faq`}
                  className="w-full sm:w-80"
                  aria-describedby={`${ids}-faq-hint`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No FAQ</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id={`${ids}-faq-hint`} className="text-xs text-muted-foreground">
                The FAQ tab lists the published articles of this Help Center category.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-foreground">
                Controls last reviewed:{' '}
                {draft.controlsReviewedAt ? (
                  <LocalDate date={draft.controlsReviewedAt} options={{ dateStyle: 'medium' }} />
                ) : (
                  <span className="text-muted-foreground">not shown</span>
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set('controlsReviewedAt', new Date().toISOString())}
              >
                Mark reviewed now
              </Button>
              {draft.controlsReviewedAt ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => set('controlsReviewedAt', null)}
                >
                  Hide date
                </Button>
              ) : null}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {canManage ? (
            <div>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          ) : null}
        </form>
      </TrustSection>
    </div>
  )
}
