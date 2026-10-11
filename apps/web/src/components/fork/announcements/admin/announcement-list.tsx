import { useState, type ReactElement } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { EllipsisHorizontalIcon, SpeakerWaveIcon, PlusIcon } from '@heroicons/react/24/solid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LocalDate } from '@/components/ui/local-date'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { useArchiveAnnouncement, useDeleteDraftAnnouncement } from '@/lib/client/fork/announcements'
import { KIND_PRESETS } from '@/lib/shared/fork/announcements/presets'
import { announcementState } from '@/lib/shared/fork/announcements/visibility'
import type { Announcement, AnnouncementState } from '@/lib/shared/fork/announcements/types'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { cn } from '@/lib/shared/utils'
import { Route } from '@/routes/admin/announcements'
import { KIND_STYLES } from '../kind-styles'

const DATE_TIME: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

const STATE_BADGE: Record<
  AnnouncementState,
  { label: string; variant: 'success' | 'secondary' | 'outline' | 'subtle' }
> = {
  live: { label: 'Live', variant: 'success' },
  scheduled: { label: 'Scheduled', variant: 'secondary' },
  draft: { label: 'Draft', variant: 'outline' },
  expired: { label: 'Expired', variant: 'subtle' },
  archived: { label: 'Archived', variant: 'subtle' },
}

interface AnnouncementListProps {
  title: string
  emptyMessage: string
  isLoading: boolean
  announcements: Announcement[]
}

export function AnnouncementList({
  title,
  emptyMessage,
  isLoading,
  announcements,
}: AnnouncementListProps): ReactElement {
  const navigate = useNavigate({ from: Route.fullPath })
  const canManage = usePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE)
  const archive = useArchiveAnnouncement()
  const deleteDraft = useDeleteDraftAnnouncement()
  const [confirm, setConfirm] = useState<{ kind: 'archive' | 'delete'; item: Announcement } | null>(
    null
  )

  const open = (edit: string) => void navigate({ search: (prev) => ({ ...prev, edit }) })

  const onConfirm = () => {
    if (!confirm) return
    const mutation = confirm.kind === 'archive' ? archive : deleteDraft
    mutation.mutate(confirm.item.id, {
      onSuccess: () => {
        toast.success(confirm.kind === 'archive' ? 'Announcement archived' : 'Draft deleted')
        setConfirm(null)
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : 'Something went wrong'),
    })
  }

  return (
    <section aria-labelledby="announcement-list-heading" className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-border/50 px-3 py-3">
        <h2 id="announcement-list-heading" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        {canManage ? (
          <Button size="sm" className="ml-auto" onClick={() => open('new')}>
            <PlusIcon aria-hidden className="size-4" />
            New announcement
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2 p-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius)] border border-border/50 bg-card p-4">
              <Skeleton className="mb-2 h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState icon={SpeakerWaveIcon} title={emptyMessage} className="h-48" />
      ) : (
        <ul aria-labelledby="announcement-list-heading" className="divide-y divide-border/50 px-3">
          {announcements.map((item) => (
            <AnnouncementRow
              key={item.id}
              item={item}
              canManage={canManage}
              onOpen={() => open(item.id)}
              onArchive={() => setConfirm({ kind: 'archive', item })}
              onDelete={() => setConfirm({ kind: 'delete', item })}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && setConfirm(null)}
        title={confirm?.kind === 'delete' ? 'Delete this draft?' : 'Archive this announcement?'}
        description={
          confirm?.kind === 'delete'
            ? 'The draft is deleted permanently.'
            : 'It stops showing everywhere at once. Archived announcements stay in the list for the record.'
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Delete draft' : 'Archive'}
        variant="destructive"
        isPending={archive.isPending || deleteDraft.isPending}
        onConfirm={onConfirm}
      />
    </section>
  )
}

function AnnouncementRow({
  item,
  canManage,
  onOpen,
  onArchive,
  onDelete,
}: {
  item: Announcement
  canManage: boolean
  onOpen: () => void
  onArchive: () => void
  onDelete: () => void
}): ReactElement {
  const state = announcementState(item)
  const badge = STATE_BADGE[state]
  const style = KIND_STYLES[item.kind]
  const Icon = style.icon
  const where = item.surfaces.map((s) => (s === 'portal' ? 'Portal' : 'Embedded apps')).join(' · ')
  const audience =
    item.audience.tier === 'authenticated'
      ? 'Everyone'
      : `${item.audience.segmentIds.length} segment${item.audience.segmentIds.length === 1 ? '' : 's'}`

  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] border',
          style.surface
        )}
      >
        <Icon aria-hidden className={cn('size-4', style.iconColor)} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 truncate rounded-sm text-left text-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="sr-only">{KIND_PRESETS[item.kind].label}: </span>
            {item.title}
          </button>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {state === 'scheduled' ? 'Starts ' : 'From '}
          <LocalDate date={item.publishAt} options={DATE_TIME} />
          {item.expiresAt ? (
            <>
              {' to '}
              <LocalDate date={item.expiresAt} options={DATE_TIME} />
            </>
          ) : (
            ' until archived'
          )}
          {' · '}
          {where}
          {' · '}
          {audience}
        </p>
      </div>
      {canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.title}`}>
              <EllipsisHorizontalIcon aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>
              {item.status === 'archived' ? 'View' : 'Edit'}
            </DropdownMenuItem>
            {item.status !== 'archived' ? (
              <DropdownMenuItem onClick={onArchive}>Archive</DropdownMenuItem>
            ) : null}
            {item.status === 'draft' ? (
              <DropdownMenuItem onClick={onDelete}>Delete draft</DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  )
}
