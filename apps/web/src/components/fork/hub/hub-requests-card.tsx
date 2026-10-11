import type { ReactElement } from 'react'
import { ChatBubbleLeftRightIcon, TicketIcon } from '@heroicons/react/24/solid'
import { FormattedMessage, useIntl } from 'react-intl'

import { StageChip } from '@/components/shared/ticket-stage'
import { TimeAgo } from '@/components/ui/time-ago'
import { HubCard, HubRow } from './hub-card'
import { HubRating } from './hub-rating'

export interface HubRequest {
  conversationId: string
  title: string
  /** Ticket reference when the conversation is paired, e.g. "#1042". */
  reference?: string | null
  isChat: boolean
  /** Stage slot + label straight from the linked ticket, or the plain status. */
  stageSlot: string | null
  stageLabel: string | null
  stageClosed: boolean
  /** Resolved and closed stages allow a rating. */
  isResolved: boolean
  csatRating?: number | null
  updatedAt: string
}

interface HubRequestsCardProps {
  requests: HubRequest[]
  onRate: (conversationId: string, score: number) => Promise<void>
}

/**
 * The requester's support requests: tickets and chats, newest activity first,
 * with the rating control inline on a resolved row.
 */
export function HubRequestsCard({ requests, onRate }: HubRequestsCardProps): ReactElement {
  const intl = useIntl()
  const chatLabel = intl.formatMessage({
    id: 'portal.forkHub.requests.chat',
    defaultMessage: 'Chat',
  })

  return (
    <HubCard
      title={intl.formatMessage({
        id: 'portal.forkHub.requests.title',
        defaultMessage: 'Support requests',
      })}
      description={intl.formatMessage({
        id: 'portal.forkHub.requests.description',
        defaultMessage: 'Tickets and chats with the support team',
      })}
      viewAll={{
        label: intl.formatMessage({
          id: 'portal.forkHub.viewAll',
          defaultMessage: 'View all',
        }),
        to: '/support',
      }}
    >
      {requests.length === 0 ? (
        <li className="py-6 text-sm text-muted-foreground">
          <FormattedMessage
            id="portal.forkHub.requests.empty"
            defaultMessage="You have not asked us anything yet. Start a chat and it will appear here."
          />
        </li>
      ) : (
        requests.map((request) => {
          const Icon = request.isChat ? ChatBubbleLeftRightIcon : TicketIcon
          const canRate = request.isResolved
          return (
            <HubRow
              key={request.conversationId}
              lead={
                <span className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-muted/50">
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                </span>
              }
              title={request.title}
              titleTo={`/support/${request.conversationId}`}
              meta={[request.reference, request.isChat ? chatLabel : null]
                .filter(Boolean)
                .join(' · ')}
              status={
                <StageChip
                  slot={request.stageSlot}
                  label={request.stageLabel}
                  closed={request.stageClosed}
                  closedLabelId="portal.forkHub.requests.closed"
                />
              }
              trailing={
                canRate ? (
                  <HubRating
                    conversationId={request.conversationId}
                    value={request.csatRating ?? null}
                    onRate={(score) => onRate(request.conversationId, score)}
                  />
                ) : (
                  <TimeAgo date={request.updatedAt} className="text-xs text-muted-foreground" />
                )
              }
            />
          )
        })
      )}
    </HubCard>
  )
}
