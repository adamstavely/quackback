import type { ReactElement, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/shared/utils'

/** A link in a card header. `search` rides along, e.g. the board's default sort. */
export interface HubCardLink {
  label: string
  to: string
  search?: Record<string, string>
}

interface HubCardHeaderProps {
  headingId: string
  title: string
  description: string
  /** Quiet link to the full page. */
  viewAll?: HubCardLink
}

/**
 * The header band shared by every hub card: title and description on the left,
 * the link to the full page on the right, on a rule that spans the card so the link reads as
 * part of it rather than floating in its padding. One definition keeps the
 * cards' headers identical when they sit side by side.
 */
export function HubCardHeader({
  headingId,
  title,
  description,
  viewAll,
}: HubCardHeaderProps): ReactElement {
  return (
    <div className="mb-1 flex items-center gap-4 border-b border-border/60 pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3.5">
        {viewAll ? (
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to={viewAll.to} search={viewAll.search}>
              {viewAll.label}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

interface HubCardProps {
  title: string
  description: string
  viewAll?: HubCardLink
  children: ReactNode
  className?: string
}

/**
 * Shell for the hub's list cards (support requests, feedback). Both share it,
 * so their headers and row rhythm line up when they sit side by side.
 */
export function HubCard({
  title,
  description,
  viewAll,
  children,
  className,
}: HubCardProps): ReactElement {
  const headingId = `hub-card-${title.replace(/\W+/g, '-').toLowerCase()}`

  return (
    <Card className={cn('h-full', className)}>
      <CardContent className="flex h-full flex-col gap-1 p-6 sm:p-7">
        <HubCardHeader
          headingId={headingId}
          title={title}
          description={description}
          viewAll={viewAll}
        />
        <ul aria-labelledby={headingId} className="flex flex-col">
          {children}
        </ul>
      </CardContent>
    </Card>
  )
}

interface HubRowProps {
  /** Leading slot: a type icon, or the vote count on feedback rows. */
  lead: ReactNode
  title: string
  titleTo: string
  meta: string
  status: ReactNode
  /** Right slot: a timestamp, or the rating control on a resolved request. */
  trailing: ReactNode
}

/** One row, on the grid both cards share so columns align across the page. */
export function HubRow({
  lead,
  title,
  titleTo,
  meta,
  status,
  trailing,
}: HubRowProps): ReactElement {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-x-3.5 border-b border-border/40 py-3 last:border-b-0">
      <span className="flex items-center justify-center">{lead}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <Link
          to={titleTo}
          className="truncate rounded-[var(--radius)] text-[15px] font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {title}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      {status}
      <span className="flex min-w-[7rem] justify-end">{trailing}</span>
    </li>
  )
}
