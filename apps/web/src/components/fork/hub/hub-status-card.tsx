import type { ReactElement } from 'react'
import { ExclamationTriangleIcon, CheckCircleIcon, WrenchIcon } from '@heroicons/react/24/solid'
import { FormattedMessage, useIntl } from 'react-intl'

import { Card, CardContent } from '@/components/ui/card'
import { LocalDate } from '@/components/ui/local-date'
import { cn } from '@/lib/shared/utils'
import { HubCardHeader } from './hub-card'

const MAINTENANCE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}
const MAINTENANCE_TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

export interface HubStatusComponent {
  id: string
  name: string
  /** Operational unless the status page says otherwise. */
  degraded: boolean
  statusLabel: string
}

interface HubStatusCardProps {
  /** False when every component is operational. */
  hasIssue: boolean
  headline: string
  detail?: string | null
  components: HubStatusComponent[]
  maintenanceStartsAt?: string | null
  maintenanceEndsAt?: string | null
}

/**
 * Live platform status, beside the hub's action cards.
 *
 * The state is carried by the heading text as well as the icon and tint, so it
 * does not depend on colour (SC 1.4.1), and updates are announced politely
 * rather than interrupting (SC 4.1.3). Degraded components sort first so the
 * exception is the first thing read.
 */
export function HubStatusCard({
  hasIssue,
  headline,
  detail,
  components,
  maintenanceStartsAt,
  maintenanceEndsAt,
}: HubStatusCardProps): ReactElement {
  const intl = useIntl()
  const ordered = [...components].sort((a, b) => Number(b.degraded) - Number(a.degraded))
  const StateIcon = hasIssue ? ExclamationTriangleIcon : CheckCircleIcon

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-6 sm:p-7">
        <HubCardHeader
          headingId="hub-status-heading"
          title={intl.formatMessage({
            id: 'portal.forkHub.status.title',
            defaultMessage: 'System status',
          })}
          description={intl.formatMessage({
            id: 'portal.forkHub.status.description',
            defaultMessage: 'Live status of our services',
          })}
          viewAll={{
            label: intl.formatMessage({
              id: 'portal.forkHub.status.viewPage',
              defaultMessage: 'Status page',
            }),
            to: '/status',
          }}
        />

        <div
          aria-live="polite"
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius)] border p-3.5',
            hasIssue ? 'border-destructive/25 bg-destructive/5' : 'border-success/25 bg-success/5'
          )}
        >
          <StateIcon
            aria-hidden
            className={cn('size-5 shrink-0', hasIssue ? 'text-destructive' : 'text-success')}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-foreground">{headline}</span>
            {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
          </span>
        </div>

        <ul className="flex flex-col gap-2.5 text-sm">
          {ordered.map((component) => (
            <li key={component.id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  component.degraded ? 'bg-destructive' : 'bg-success'
                )}
              />
              <span className="grow truncate text-foreground">{component.name}</span>
              <span
                className={cn(
                  'text-xs',
                  component.degraded ? 'font-medium text-destructive' : 'text-muted-foreground'
                )}
              >
                {component.statusLabel}
              </span>
            </li>
          ))}
        </ul>

        {maintenanceStartsAt ? (
          <p className="mt-auto flex gap-2.5 border-t border-border/50 pt-4 text-xs text-muted-foreground">
            <WrenchIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-ink" />
            <span>
              <FormattedMessage
                id="portal.forkHub.status.maintenance"
                defaultMessage="Maintenance scheduled"
              />{' '}
              <LocalDate date={maintenanceStartsAt} options={MAINTENANCE_FORMAT} />
              {maintenanceEndsAt ? (
                <>
                  {' – '}
                  <LocalDate date={maintenanceEndsAt} options={MAINTENANCE_TIME_FORMAT} />
                </>
              ) : null}
            </span>
          </p>
        ) : (
          <p className="mt-auto border-t border-border/50 pt-4 text-xs text-muted-foreground">
            {intl.formatMessage({
              id: 'portal.forkHub.status.noMaintenance',
              defaultMessage: 'No maintenance scheduled.',
            })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
