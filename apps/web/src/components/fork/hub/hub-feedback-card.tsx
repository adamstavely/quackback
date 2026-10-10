import type { ReactElement } from 'react'
import { LightBulbIcon } from '@heroicons/react/24/solid'
import { FormattedMessage, useIntl } from 'react-intl'

import { Badge } from '@/components/ui/badge'
import { TimeAgo } from '@/components/ui/time-ago'
import { FEEDBACK_BOARD_SEARCH } from '@/lib/shared/fork/portal-home'
import { HubCard, HubRow } from './hub-card'

export interface HubFeedbackItem {
  postId: string
  /** Portal path for the post, e.g. `/b/feature-requests/posts/123`. */
  href: string
  title: string
  boardName: string
  statusName: string | null
  updatedAt: string
}

interface HubFeedbackCardProps {
  items: HubFeedbackItem[]
}

/**
 * Feedback the requester posted on the boards, and where it got to. Status is a text label as well as a colour, so the state does not
 * depend on colour alone (SC 1.4.1).
 */
export function HubFeedbackCard({ items }: HubFeedbackCardProps): ReactElement {
  const intl = useIntl()

  return (
    <HubCard
      title={intl.formatMessage({
        id: 'portal.forkHub.feedback.title',
        defaultMessage: 'Feedback',
      })}
      description={intl.formatMessage({
        id: 'portal.forkHub.feedback.description',
        defaultMessage: 'Ideas and reports you posted on the boards',
      })}
      viewAll={{
        label: intl.formatMessage({ id: 'portal.forkHub.viewAll', defaultMessage: 'View all' }),
        to: '/',
        search: FEEDBACK_BOARD_SEARCH,
      }}
    >
      {items.length === 0 ? (
        <li className="py-6 text-sm text-muted-foreground">
          <FormattedMessage
            id="portal.forkHub.feedback.empty"
            defaultMessage="You have not posted feedback yet. Share an idea and you can follow it here."
          />
        </li>
      ) : (
        items.map((item) => (
          <HubRow
            key={item.postId}
            lead={
              <span className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-muted/50">
                <LightBulbIcon aria-hidden className="size-4 text-muted-foreground" />
              </span>
            }
            title={item.title}
            titleTo={item.href}
            meta={item.boardName}
            status={
              item.statusName ? <Badge variant="secondary">{item.statusName}</Badge> : <span />
            }
            trailing={<TimeAgo date={item.updatedAt} className="text-xs text-muted-foreground" />}
          />
        ))
      )}
    </HubCard>
  )
}
