import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { trustQueries } from '@/lib/client/fork/trust'
import { TrustPageShell, TrustSignIn } from '@/components/fork/trust/portal/trust-page'

/**
 * The portal's Trust & Security page (plans/v2/70-trust-security.md). A 404
 * while the workspace has it off; a sign-in prompt for a signed-out viewer.
 * The content is read once here and shared by every tab.
 */
export const Route = createFileRoute('/_portal/trust')({
  loader: async ({ context }) => {
    const page = await context.queryClient.ensureQueryData(trustQueries.page())
    if (page.status === 'off') throw notFound()
    return { workspaceName: context.settings?.name ?? 'Quackback' }
  },
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: `Trust & Security - ${loaderData.workspaceName}` }] } : {},
  component: TrustLayout,
})

function TrustLayout() {
  const { data } = useQuery(trustQueries.page())
  const content = data?.status === 'ok' ? data.content : null
  return <TrustPageShell content={content}>{content ? <Outlet /> : <TrustSignIn />}</TrustPageShell>
}
