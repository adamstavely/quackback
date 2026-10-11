import type { ReactElement } from 'react'
import { toast } from 'sonner'
import { InformationCircleIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { useSetAnnouncementsEnabled } from '@/lib/client/fork/announcements'
import { PERMISSIONS } from '@/lib/shared/permissions'

/** Shown while announcements are off: drafts can still be written, nothing is shown to anyone. */
export function AnnouncementsOffNotice(): ReactElement {
  const canToggle = usePermission(PERMISSIONS.SETTINGS_MANAGE)
  const setEnabled = useSetAnnouncementsEnabled()

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
    >
      <InformationCircleIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Announcements are off.</span> You can write drafts, but no
        banner shows in the portal or in embedded apps until they are turned on.
        {canToggle ? null : ' Ask a workspace admin to turn them on.'}
      </p>
      {canToggle ? (
        <Button
          size="sm"
          disabled={setEnabled.isPending}
          onClick={() =>
            setEnabled.mutate(true, {
              onSuccess: () => toast.success('Announcements are on'),
              onError: (error) =>
                toast.error(error instanceof Error ? error.message : 'Could not turn them on'),
            })
          }
        >
          Turn on announcements
        </Button>
      ) : null}
    </div>
  )
}
