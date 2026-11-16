import { useState, type ReactElement, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ArrowDownIcon, ArrowUpIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useDeleteTrustItem, useReorderTrustItems } from '@/lib/client/fork/trust'
import type { TrustEntity } from '@/lib/shared/fork/trust/schema'

export interface TrustListRow {
  id: string
  title: string
  meta?: ReactNode
  leading?: ReactNode
  badges?: ReactNode
  /** Row-specific actions (e.g. upload), shown before move/edit/delete. */
  actions?: ReactNode
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.'

/**
 * One ordered list (or one group's list) on the trust admin page. The order
 * is the order the portal shows; Move up and Move down send the whole list,
 * so a stale screen is refused rather than dropping someone else's item.
 */
export function TrustList({
  entity,
  rows,
  canManage,
  emptyText,
  onEdit,
  deleteCopy,
}: {
  entity: TrustEntity
  rows: TrustListRow[]
  canManage: boolean
  emptyText: string
  onEdit: (id: string) => void
  deleteCopy: (row: TrustListRow) => { title: string; description: string }
}): ReactElement {
  const reorder = useReorderTrustItems()
  const remove = useDeleteTrustItem()
  const [deleting, setDeleting] = useState<TrustListRow | null>(null)

  if (rows.length === 0) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">{emptyText}</p>
  }

  const move = (index: number, by: -1 | 1) => {
    const ids = rows.map((row) => row.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + by, 0, moved!)
    reorder.mutate({ entity, ids }, { onError: (error) => toast.error(errorText(error)) })
  }

  const copy = deleting ? deleteCopy(deleting) : null

  return (
    <>
      <ul className="flex flex-col divide-y divide-border/60">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-center gap-3 px-3 py-3">
            {row.leading}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                  {row.title}
                </span>
                {row.badges}
              </div>
              {row.meta ? (
                <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {row.meta}
                </div>
              ) : null}
            </div>
            {row.actions ? (
              <div className="flex shrink-0 items-center gap-1">{row.actions}</div>
            ) : null}
            {canManage ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${row.title} up`}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${row.title} down`}
                  disabled={index === rows.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${row.title}`}
                  onClick={() => onEdit(row.id)}
                >
                  <PencilSquareIcon aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${row.title}`}
                  onClick={() => setDeleting(row)}
                >
                  <TrashIcon aria-hidden className="size-4" />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title={copy?.title ?? ''}
        description={copy?.description}
        confirmLabel="Delete"
        variant="destructive"
        isPending={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync({ entity, id: deleting.id })
            toast.success('Deleted')
            setDeleting(null)
          } catch (error) {
            toast.error(errorText(error))
          }
        }}
      />
    </>
  )
}

/** A titled block on the trust admin page, with an optional action (e.g. Add). */
export function TrustSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <section aria-labelledby={id} className="flex flex-col rounded-panel border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-3 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
