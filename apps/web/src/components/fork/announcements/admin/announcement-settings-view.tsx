import { useId, useState, type ReactElement, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { usePermission } from '@/lib/client/hooks/use-permission'
import {
  useSetAnnouncementsEnabled,
  useUpdateAnnouncementsConfig,
} from '@/lib/client/fork/announcements'
import type { AnnouncementsConfig } from '@/lib/shared/fork/announcements/schema'
import { PERMISSIONS } from '@/lib/shared/permissions'

/** Workspace settings for announcements. */
export function AnnouncementSettingsView({
  enabled,
  config,
}: {
  enabled: boolean
  config: AnnouncementsConfig
}): ReactElement {
  const ids = useId()
  const canToggle = usePermission(PERMISSIONS.SETTINGS_MANAGE)
  const canManage = usePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE)
  const setEnabled = useSetAnnouncementsEnabled()
  const update = useUpdateAnnouncementsConfig()
  const [draft, setDraft] = useState<AnnouncementsConfig>(config)
  const [leadHours, setLeadHours] = useState(String(config.statusLeadHours))
  const [leadError, setLeadError] = useState<string | null>(null)

  const save = () => {
    const hours = Number(leadHours)
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      setLeadError('Enter a whole number of hours from 1 to 168.')
      return
    }
    setLeadError(null)
    update.mutate(
      { ...draft, statusLeadHours: hours },
      {
        onSuccess: () => toast.success('Settings saved'),
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save'),
      }
    )
  }

  return (
    <section aria-labelledby="announcement-settings-heading" className="flex max-w-2xl flex-col">
      <div className="border-b border-border/50 px-3 py-3">
        <h2 id="announcement-settings-heading" className="text-base font-semibold text-foreground">
          Settings
        </h2>
      </div>

      <div className="flex flex-col divide-y divide-border/50 px-3">
        <SettingRow
          id={`${ids}-enabled`}
          label="Announcements"
          description={
            canToggle
              ? 'Show published banners in the portal and, if turned on below, in embedded apps.'
              : 'Only a workspace admin can turn announcements on or off.'
          }
        >
          <Switch
            id={`${ids}-enabled`}
            aria-describedby={`${ids}-enabled-description`}
            checked={enabled}
            disabled={!canToggle || setEnabled.isPending}
            onCheckedChange={(next) =>
              setEnabled.mutate(next, {
                onSuccess: () =>
                  toast.success(next ? 'Announcements are on' : 'Announcements are off'),
                onError: (error) =>
                  toast.error(error instanceof Error ? error.message : 'Could not change it'),
              })
            }
          />
        </SettingRow>

        <SettingRow
          id={`${ids}-embed`}
          label="Embedded apps"
          description="Serve banners to internal apps that add the banner script. Only banners for everyone show unless the app identifies its users."
        >
          <Switch
            id={`${ids}-embed`}
            aria-describedby={`${ids}-embed-description`}
            checked={draft.embedEnabled}
            disabled={!canManage}
            onCheckedChange={(next) => setDraft((d) => ({ ...d, embedEnabled: next }))}
          />
        </SettingRow>

        <SettingRow
          id={`${ids}-status`}
          label="Status incidents"
          description="Show open incidents and upcoming maintenance from the status page in the same banner strip."
        >
          <Switch
            id={`${ids}-status`}
            aria-describedby={`${ids}-status-description`}
            checked={draft.foldInStatus}
            disabled={!canManage}
            onCheckedChange={(next) => setDraft((d) => ({ ...d, foldInStatus: next }))}
          />
        </SettingRow>

        <div className="flex flex-col gap-1.5 py-4">
          <Label htmlFor={`${ids}-lead`}>Maintenance notice, in hours</Label>
          <p id={`${ids}-lead-hint`} className="text-xs text-muted-foreground">
            How long before scheduled maintenance its banner appears.
          </p>
          <Input
            id={`${ids}-lead`}
            type="number"
            inputMode="numeric"
            min={1}
            max={168}
            className="w-32"
            value={leadHours}
            disabled={!canManage || !draft.foldInStatus}
            onChange={(e) => setLeadHours(e.target.value)}
            aria-invalid={leadError ? true : undefined}
            aria-describedby={leadError ? `${ids}-lead-hint ${ids}-lead-error` : `${ids}-lead-hint`}
          />
          {leadError ? (
            <p id={`${ids}-lead-error`} className="text-xs font-medium text-destructive">
              {leadError}
            </p>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <div className="px-3 py-3">
          <Button onClick={save} disabled={update.isPending}>
            Save settings
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function SettingRow({
  id,
  label,
  description,
  children,
}: {
  id: string
  label: string
  description: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}
