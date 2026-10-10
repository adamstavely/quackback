import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useIntl } from 'react-intl'

import { HubPage } from '@/components/fork/hub/hub-page'
import type { HubFeedbackItem } from '@/components/fork/hub/hub-feedback-card'
import type { HubRequest } from '@/components/fork/hub/hub-requests-card'
import type { HubStatusComponent } from '@/components/fork/hub/hub-status-card'
import { useSessionContext, useWorkspaceSettings } from '@/lib/client/hooks/use-root-context'
import { PORTAL_MY_CONVERSATIONS_QUERY_KEY } from '@/lib/client/queries/portal-support'
import { publicStatusPageQueries } from '@/lib/client/queries/status'
import { getMyConversationsFn, submitCsatFn } from '@/lib/server/functions/conversation'
import { getMyHubFeedbackFn } from '@/lib/server/functions/fork/hub'

/** Rows shown before "View all" takes over; the full lists live on their own pages. */
const ROW_LIMIT = 5

export const Route = createFileRoute('/_portal/hub')({
  loader: ({ context }) => ({
    workspaceName: context.settings?.name ?? 'Quackback',
    baseUrl: context.baseUrl ?? '',
  }),
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: `Help hub - ${loaderData.workspaceName}` }] } : {},
  component: HubRoute,
})

function HubRoute() {
  const intl = useIntl()
  const queryClient = useQueryClient()
  const { workspaceName } = Route.useLoaderData()
  const session = useSessionContext()
  const settings = useWorkspaceSettings()

  const user = session?.user
  const isSignedIn = !!user && user.principalType !== 'anonymous'

  const { data: conversationData } = useQuery({
    queryKey: PORTAL_MY_CONVERSATIONS_QUERY_KEY,
    queryFn: () => getMyConversationsFn(),
    enabled: isSignedIn,
    staleTime: 30_000,
  })

  const { data: myFeedback } = useQuery({
    queryKey: ['fork-hub', 'my-feedback'],
    queryFn: () => getMyHubFeedbackFn(),
    enabled: isSignedIn,
    staleTime: 60_000,
  })

  const { data: statusData } = useQuery(publicStatusPageQueries.get())

  const requests: HubRequest[] = (conversationData?.conversations ?? [])
    .slice(0, ROW_LIMIT)
    .map((conversation) => {
      const ticket = conversationData?.linkedTickets?.[conversation.id]
      const closed = ticket ? !!ticket.stage.closed : conversation.status === 'closed'
      return {
        conversationId: conversation.id,
        title:
          conversation.subject ??
          conversation.lastMessagePreview ??
          intl.formatMessage({
            id: 'portal.forkHub.requests.untitled',
            defaultMessage: 'Conversation',
          }),
        reference: ticket?.reference ?? null,
        isChat: !ticket,
        stageSlot: ticket?.stage.slot ?? conversation.status,
        stageLabel: ticket?.stage.label ?? conversation.status,
        stageClosed: closed,
        isResolved: closed || !!conversation.resolvedAt,
        csatRating: conversation.csatRating,
        updatedAt: conversation.lastMessageAt,
      }
    })

  const feedback: HubFeedbackItem[] = (myFeedback?.posts ?? []).slice(0, ROW_LIMIT).map((post) => ({
    postId: post.postId,
    href: `/b/${post.boardSlug}/posts/${post.postId}`,
    title: post.title,
    boardName: post.boardSlug,
    statusName: post.statusName,
    updatedAt: post.occurredAt,
  }))

  const snapshot = statusData?.snapshot
  const components: HubStatusComponent[] = [
    ...(snapshot?.groups.flatMap((group) => group.components) ?? []),
    ...(snapshot?.ungroupedComponents ?? []),
  ].map((component) => ({
    id: component.id,
    name: component.name,
    degraded: component.status !== 'operational',
    statusLabel: intl.formatMessage({
      id: `portal.forkHub.componentStatus.${component.status}`,
      defaultMessage: component.status.replace(/_/g, ' '),
    }),
  }))

  const activeIncident = snapshot?.activeIncidents?.[0] ?? null
  const maintenance = snapshot?.upcomingMaintenance?.[0] ?? null

  return (
    <HubPage
      workspaceName={workspaceName}
      askAiEnabled={!!settings?.featureFlags?.helpCenter}
      requests={requests}
      feedback={feedback}
      status={{
        enabled: !!snapshot,
        hasIssue: !!activeIncident || components.some((component) => component.degraded),
        headline:
          activeIncident?.title ??
          intl.formatMessage({
            id: 'portal.forkHub.status.allOperational',
            defaultMessage: 'All systems operational',
          }),
        detail: null,
        components,
        maintenanceStartsAt: maintenance?.scheduledStartAt ?? null,
        maintenanceEndsAt: maintenance?.scheduledEndAt ?? null,
      }}
      onRate={async (conversationId, score) => {
        await submitCsatFn({ data: { conversationId, rating: score } })
        await queryClient.invalidateQueries({ queryKey: PORTAL_MY_CONVERSATIONS_QUERY_KEY })
      }}
    />
  )
}
