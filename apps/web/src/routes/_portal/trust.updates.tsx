import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { trustQueries } from '@/lib/client/fork/trust'
import { TrustUpdatesTab } from '@/components/fork/trust/portal/trust-page'

export const Route = createFileRoute('/_portal/trust/updates')({
  component: TrustTab,
})

function TrustTab() {
  const { data } = useQuery(trustQueries.page())
  return data?.status === 'ok' ? <TrustUpdatesTab content={data.content} /> : null
}
