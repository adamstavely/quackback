import type { ReactElement } from 'react'
import { ChatBubbleLeftRightIcon, MapIcon, MegaphoneIcon } from '@heroicons/react/24/solid'
import { FormattedMessage, useIntl } from 'react-intl'

import { HelpCenterHero } from '@/components/help-center/help-center-hero'
import { HelpCenterHeroSearch } from '@/components/help-center/help-center-search'
import { HubActionCard } from './hub-action-card'
import { HubFeedbackCard, type HubFeedbackItem } from './hub-feedback-card'
import { HubRequestsCard, type HubRequest } from './hub-requests-card'
import { HubStatusCard, type HubStatusComponent } from './hub-status-card'

interface HubPageProps {
  workspaceName: string
  askAiEnabled: boolean
  requests: HubRequest[]
  feedback: HubFeedbackItem[]
  status: {
    enabled: boolean
    hasIssue: boolean
    headline: string
    detail?: string | null
    components: HubStatusComponent[]
    maintenanceStartsAt?: string | null
    maintenanceEndsAt?: string | null
  }
  onRate: (conversationId: string, score: number) => Promise<void>
}

/**
 * The help hub: find an answer, ask for help, then track what you asked for.
 *
 * Composed from the platform's own components — the help-center hero and
 * search, shared cards, badges and buttons — so branding, theming and keyboard
 * behaviour come from the same place as the rest of the portal. Landmarks and
 * headings give the page a single outline: one `h1` in the hero, one `h2` per
 * region (SC 1.3.1, SC 2.4.6).
 */
export function HubPage({
  workspaceName,
  askAiEnabled,
  requests,
  feedback,
  status,
  onRate,
}: HubPageProps): ReactElement {
  const intl = useIntl()

  return (
    <div className="flex flex-col">
      <HelpCenterHero
        variant="home"
        title={intl.formatMessage(
          { id: 'portal.forkHub.hero.title', defaultMessage: 'How can we help?' },
          { workspaceName }
        )}
        description={intl.formatMessage({
          id: 'portal.forkHub.hero.description',
          defaultMessage: 'Search the guides, ask a question, or pick up where you left off.',
        })}
      >
        <HelpCenterHeroSearch askAiEnabled={askAiEnabled} />
      </HelpCenterHero>

      {/* The hero keeps generous padding for the help center; the hub pulls its
          content up into it so the cards sit close under the search. `relative`
          paints them above the hero's background, and the search dropdown
          (z-10 in the hero) still opens over them. */}
      <div className="relative mx-auto -mt-6 flex w-full max-w-6xl flex-col gap-10 px-4 pb-10 sm:-mt-12 sm:px-6">
        <section
          aria-labelledby="hub-actions-heading"
          className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3"
        >
          <h2 id="hub-actions-heading" className="sr-only">
            <FormattedMessage
              id="portal.forkHub.actions.heading"
              defaultMessage="Get help and keep up with changes"
            />
          </h2>
          <div className="flex flex-col gap-6 lg:col-span-2">
            <HubActionCard
              primary
              icon={ChatBubbleLeftRightIcon}
              to="/support"
              title={intl.formatMessage({
                id: 'portal.forkHub.chat.title',
                defaultMessage: 'Start a chat',
              })}
              description={intl.formatMessage({
                id: 'portal.forkHub.chat.description',
                defaultMessage: 'Quick questions, answered by the support team.',
              })}
              cta={intl.formatMessage({
                id: 'portal.forkHub.chat.cta',
                defaultMessage: 'Chat now',
              })}
            />
            <HubActionCard
              icon={MegaphoneIcon}
              to="/changelog"
              title={intl.formatMessage({
                id: 'portal.forkHub.changelog.title',
                defaultMessage: 'Release notes',
              })}
              description={intl.formatMessage({
                id: 'portal.forkHub.changelog.description',
                defaultMessage: 'What shipped recently, and what changed.',
              })}
              cta={intl.formatMessage({
                id: 'portal.forkHub.changelog.cta',
                defaultMessage: 'View changelog',
              })}
            />
            <HubActionCard
              icon={MapIcon}
              to="/roadmap"
              title={intl.formatMessage({
                id: 'portal.forkHub.roadmap.title',
                defaultMessage: 'Roadmap',
              })}
              description={intl.formatMessage({
                id: 'portal.forkHub.roadmap.description',
                defaultMessage: 'What the team is working on next.',
              })}
              cta={intl.formatMessage({
                id: 'portal.forkHub.roadmap.cta',
                defaultMessage: 'View roadmap',
              })}
            />
          </div>
          {status.enabled ? (
            <HubStatusCard
              hasIssue={status.hasIssue}
              headline={status.headline}
              detail={status.detail}
              components={status.components}
              maintenanceStartsAt={status.maintenanceStartsAt}
              maintenanceEndsAt={status.maintenanceEndsAt}
            />
          ) : null}
        </section>

        <section aria-labelledby="hub-track-heading" className="flex flex-col gap-5">
          <h2
            id="hub-track-heading"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <FormattedMessage
              id="portal.forkHub.track.heading"
              defaultMessage="Track your requests and feedback"
            />
          </h2>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <HubRequestsCard requests={requests} onRate={onRate} />
            <HubFeedbackCard items={feedback} />
          </div>
        </section>
      </div>
    </div>
  )
}
