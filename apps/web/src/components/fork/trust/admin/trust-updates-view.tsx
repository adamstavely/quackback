import { useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LocalDate } from '@/components/ui/local-date'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { trustQueries, useChangeTrustUpdate, useSaveTrustUpdate } from '@/lib/client/fork/trust'
import type { TrustUpdate } from '@/lib/shared/fork/trust/types'
import { TrustItemDialog, type TrustField } from './trust-item-dialog'
import { TrustSection } from './trust-list'

const FIELDS: TrustField[] = [
  { name: 'title', label: 'Title', kind: 'text', max: 160, required: true },
  { name: 'body', label: 'What changed', kind: 'textarea', max: 2000, required: true },
  {
    name: 'linkUrl',
    label: 'Link',
    kind: 'text',
    max: 500,
    type: 'url',
    hint: 'Optional. A full https:// address.',
  },
  {
    name: 'linkLabel',
    label: 'Link text',
    kind: 'text',
    max: 60,
    hint: 'Shown instead of the address.',
  },
]

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.'

type Confirming = { update: TrustUpdate; action: 'publish' | 'delete' }

/**
 * Updates on the Trust & Security page (phase 4, D-TS8). The first publish of
 * an update emails subscribers and adds it to their notifications; editing or
 * republishing it later does not send again. Each update shows how its notices
 * went, and failed or stalled ones can be sent again (review 2026-11-15, #3).
 */
function DeliveryBadge({
  delivery,
}: {
  delivery: NonNullable<TrustUpdate['delivery']>
}): ReactElement {
  const due = delivery.total - delivery.skipped
  if (delivery.failed > 0) {
    return <Badge variant="destructive">{`${delivery.failed} of ${due} notices failed`}</Badge>
  }
  if (delivery.pending > 0) {
    return <Badge variant="outline">{`Sending: ${delivery.sent} of ${due} notices`}</Badge>
  }
  return <Badge variant="secondary">{`${delivery.sent} notices sent`}</Badge>
}

export function TrustUpdatesView({ canManage }: { canManage: boolean }): ReactElement {
  const { data, isLoading } = useQuery({
    ...trustQueries.updates(),
    // While notices are going out, keep the counts current.
    refetchInterval: (query) =>
      query.state.data?.updates.some((u) => (u.delivery?.pending ?? 0) > 0) ? 3000 : false,
  })
  const save = useSaveTrustUpdate()
  const change = useChangeTrustUpdate()
  const [editing, setEditing] = useState<TrustUpdate | 'new' | null>(null)
  const [confirming, setConfirming] = useState<Confirming | null>(null)

  if (isLoading || !data) return <Skeleton className="h-48 w-full rounded-panel" />

  const unpublish = async (update: TrustUpdate) => {
    try {
      await change.mutateAsync({ id: update.id, action: 'unpublish' })
      toast.success('Update moved back to drafts')
    } catch (error) {
      toast.error(errorText(error))
    }
  }

  const retry = async (update: TrustUpdate) => {
    try {
      await change.mutateAsync({ id: update.id, action: 'retry' })
      toast.success('Sending the remaining notices again')
    } catch (error) {
      toast.error(errorText(error))
    }
  }

  const subscribers =
    data.subscribers === 1 ? '1 person is subscribed' : `${data.subscribers} people are subscribed`
  const told =
    data.subscribers === 1 ? 'the 1 subscriber gets' : `the ${data.subscribers} subscribers get`

  return (
    <div className="flex flex-col gap-4">
      <TrustSection
        id="trust-updates"
        title="Updates"
        description={`${subscribers}. The first time you publish an update they get an email and a notification.`}
        action={
          canManage ? (
            <Button type="button" size="sm" onClick={() => setEditing('new')}>
              New update
            </Button>
          ) : null
        }
      >
        {data.updates.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {data.updates.map((update) => (
              <li key={update.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{update.title}</span>
                    <Badge variant={update.status === 'published' ? 'success' : 'outline'}>
                      {update.status === 'published' ? 'Published' : 'Draft'}
                    </Badge>
                    {update.delivery ? <DeliveryBadge delivery={update.delivery} /> : null}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{update.body}</p>
                  {update.publishedAt ? (
                    <p className="text-xs text-muted-foreground">
                      Published{' '}
                      <LocalDate date={update.publishedAt} options={{ dateStyle: 'medium' }} />
                    </p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {update.delivery &&
                    (update.delivery.failed > 0 || update.delivery.pending > 0) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={change.isPending}
                        onClick={() => void retry(update)}
                      >
                        Retry notices
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(update)}
                    >
                      Edit
                    </Button>
                    {update.status === 'published' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void unpublish(update)}
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setConfirming({ update, action: 'publish' })}
                      >
                        Publish
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirming({ update, action: 'delete' })}
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </TrustSection>

      {editing ? (
        <TrustItemDialog
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(open) => (open ? null : setEditing(null))}
          title={editing === 'new' ? 'New update' : 'Edit update'}
          description={
            editing !== 'new' && editing.notifiedAt
              ? 'Subscribers have already been told about this update; changes will not be sent again.'
              : 'Saved as a draft until you publish it.'
          }
          fields={FIELDS}
          initial={
            editing === 'new'
              ? { title: '', body: '', linkUrl: '', linkLabel: '' }
              : {
                  title: editing.title,
                  body: editing.body,
                  linkUrl: editing.linkUrl ?? '',
                  linkLabel: editing.linkLabel ?? '',
                }
          }
          submitLabel="Save"
          onSubmit={async (values) => {
            await save.mutateAsync({
              ...(editing === 'new' ? {} : { id: editing.id }),
              title: String(values.title ?? ''),
              body: String(values.body ?? ''),
              linkUrl: String(values.linkUrl ?? ''),
              linkLabel: String(values.linkLabel ?? ''),
            })
            toast.success('Update saved')
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => (open ? null : setConfirming(null))}
        title={
          confirming?.action === 'delete'
            ? `Delete “${confirming.update.title}”?`
            : `Publish “${confirming?.update.title ?? ''}”?`
        }
        description={
          confirming?.action === 'delete'
            ? 'It is removed from the Trust & Security page. This cannot be undone.'
            : confirming?.update.notifiedAt
              ? 'It goes back on the Trust & Security page. Subscribers were told the first time, so nothing is sent.'
              : `It appears on the Trust & Security page, and ${told} an email and a notification.`
        }
        confirmLabel={confirming?.action === 'delete' ? 'Delete' : 'Publish'}
        variant={confirming?.action === 'delete' ? 'destructive' : 'default'}
        isPending={change.isPending}
        onConfirm={async () => {
          if (!confirming) return
          try {
            await change.mutateAsync({ id: confirming.update.id, action: confirming.action })
            toast.success(confirming.action === 'delete' ? 'Update deleted' : 'Update published')
            setConfirming(null)
          } catch (error) {
            toast.error(errorText(error))
          }
        }}
      />
    </div>
  )
}
