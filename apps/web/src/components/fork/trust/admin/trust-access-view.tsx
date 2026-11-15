import { useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LocalDate } from '@/components/ui/local-date'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { trustQueries, useDecideTrustAccess } from '@/lib/client/fork/trust'
import type { TrustAccessRequest } from '@/lib/shared/fork/trust/types'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { TrustItemDialog } from './trust-item-dialog'
import { TrustSection } from './trust-list'

const STATE_LABEL: Record<TrustAccessRequest['state'], string> = {
  pending: 'Waiting',
  approved: 'Approved',
  declined: 'Declined',
  revoked: 'Revoked',
  expired: 'Expired',
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.'

type Deciding = { request: TrustAccessRequest; decision: 'approve' | 'decline' }

/**
 * Requests for restricted documents (D-TS3). Deciding needs `trust.approve`;
 * the requester's support request is answered and closed alongside.
 */
export function TrustAccessView({ grantDays }: { grantDays: number }): ReactElement {
  const canApprove = usePermission(PERMISSIONS.TRUST_APPROVE)
  const { data, isLoading } = useQuery(trustQueries.accessRequests())
  const decide = useDecideTrustAccess()
  const [deciding, setDeciding] = useState<Deciding | null>(null)
  const [revoking, setRevoking] = useState<TrustAccessRequest | null>(null)

  if (isLoading || !data) return <Skeleton className="h-48 w-full rounded-panel" />

  const pending = data.filter((r) => r.state === 'pending')
  const decided = data.filter((r) => r.state !== 'pending')

  const row = (r: TrustAccessRequest, actions: ReactElement | null) => (
    <li key={r.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{r.requesterName}</span>
          {r.requesterEmail && r.requesterEmail !== r.requesterName ? (
            <span className="text-xs text-muted-foreground">{r.requesterEmail}</span>
          ) : null}
          <Badge variant={r.state === 'approved' ? 'success' : 'outline'}>
            {STATE_LABEL[r.state]}
          </Badge>
          {r.ticketId ? <Badge variant="secondary">Support request opened</Badge> : null}
        </div>
        <p className="text-sm text-foreground">
          {r.documentTitle}
          <span className="text-muted-foreground">
            {' · requested '}
            <LocalDate date={r.createdAt} options={{ dateStyle: 'medium' }} />
            {r.state === 'approved' && r.expiresAt ? (
              <>
                {' · until '}
                <LocalDate date={r.expiresAt} options={{ dateStyle: 'medium' }} />
              </>
            ) : null}
          </span>
        </p>
        {r.reason ? <p className="text-xs text-muted-foreground">Reason: {r.reason}</p> : null}
        {r.decisionNote ? (
          <p className="text-xs text-muted-foreground">Note: {r.decisionNote}</p>
        ) : null}
      </div>
      {actions}
    </li>
  )

  return (
    <div className="flex flex-col gap-4">
      <TrustSection
        id="trust-access-pending"
        title="Waiting for a decision"
        description={
          canApprove
            ? 'Approving gives the person the document for a set time.'
            : 'You can see requests; deciding them needs the Approve access permission.'
        }
      >
        {pending.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No requests waiting.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {pending.map((r) =>
              row(
                r,
                canApprove ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setDeciding({ request: r, decision: 'approve' })}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDeciding({ request: r, decision: 'decline' })}
                    >
                      Decline
                    </Button>
                  </div>
                ) : null
              )
            )}
          </ul>
        )}
      </TrustSection>

      <TrustSection id="trust-access-decided" title="Decided">
        {decided.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Nothing decided yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {decided.map((r) =>
              row(
                r,
                canApprove && r.state === 'approved' ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setRevoking(r)}>
                    Revoke
                  </Button>
                ) : null
              )
            )}
          </ul>
        )}
      </TrustSection>

      {deciding ? (
        <TrustItemDialog
          key={`${deciding.request.id}-${deciding.decision}`}
          open
          onOpenChange={(open) => (open ? null : setDeciding(null))}
          title={
            deciding.decision === 'approve'
              ? `Approve ${deciding.request.requesterName}`
              : `Decline ${deciding.request.requesterName}`
          }
          description={deciding.request.documentTitle}
          fields={
            deciding.decision === 'approve'
              ? [
                  {
                    name: 'days',
                    label: 'Access lasts (days)',
                    kind: 'text',
                    max: 3,
                    required: true,
                    hint: 'From 1 to 365.',
                  },
                  {
                    name: 'note',
                    label: 'Note to the requester',
                    kind: 'textarea',
                    max: 500,
                  },
                ]
              : [{ name: 'note', label: 'Reason, for the requester', kind: 'textarea', max: 500 }]
          }
          initial={
            deciding.decision === 'approve' ? { days: String(grantDays), note: '' } : { note: '' }
          }
          submitLabel={deciding.decision === 'approve' ? 'Approve' : 'Decline'}
          onSubmit={async (values) => {
            const days = Number(values.days)
            if (
              deciding.decision === 'approve' &&
              (!Number.isInteger(days) || days < 1 || days > 365)
            ) {
              throw new Error('Enter a whole number of days from 1 to 365.')
            }
            await decide.mutateAsync({
              id: deciding.request.id,
              decision: deciding.decision,
              ...(deciding.decision === 'approve' ? { days } : {}),
              note: String(values.note ?? '') || undefined,
            })
            toast.success(deciding.decision === 'approve' ? 'Access approved' : 'Request declined')
          }}
        />
      ) : null}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => (open ? null : setRevoking(null))}
        title={`Revoke access for ${revoking?.requesterName ?? ''}?`}
        description={`They can no longer download ${revoking?.documentTitle ?? 'the document'}. They can ask again.`}
        confirmLabel="Revoke"
        variant="destructive"
        isPending={decide.isPending}
        onConfirm={async () => {
          if (!revoking) return
          try {
            await decide.mutateAsync({ id: revoking.id, decision: 'revoke' })
            toast.success('Access revoked')
            setRevoking(null)
          } catch (error) {
            toast.error(errorText(error))
          }
        }}
      />
    </div>
  )
}
