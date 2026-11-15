import type { ReactElement } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckCircleIcon, DocumentTextIcon, ShieldCheckIcon } from '@heroicons/react/24/solid'
import { useIntl } from 'react-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LocalDate } from '@/components/ui/local-date'
import type { TrustHubSummary } from '@/lib/server/functions/fork/trust-portal'

/**
 * The hub's pointer to the Trust & Security page (plan 70; hub option B):
 * under a short status card, a summary of controls and documents. Signed-out
 * viewers see the card without numbers. The button is the only focus stop.
 */
export function HubTrustCard({ summary }: { summary: TrustHubSummary | null }): ReactElement {
  const intl = useIntl()
  const m = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `portal.forkHub.trust.${id}`, defaultMessage }, values)
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10">
            <ShieldCheckIcon aria-hidden className="size-6 text-primary" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <h2
              id="hub-trust-heading"
              className="text-xl font-semibold tracking-tight text-foreground"
            >
              {m('title', 'Trust & Security')}
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {m('description', 'How we protect your data')}
            </span>
          </span>
        </div>

        {summary && (summary.controlsTotal > 0 || summary.documents > 0) ? (
          <ul aria-labelledby="hub-trust-heading" className="flex flex-col gap-2.5 text-sm">
            {summary.controlsTotal > 0 ? (
              <li className="flex items-center gap-2.5">
                <CheckCircleIcon aria-hidden className="size-4 shrink-0 text-success" />
                <span className="text-foreground">
                  {m('controls', '{inPlace} of {total} controls in place', {
                    inPlace: summary.controlsInPlace,
                    total: summary.controlsTotal,
                  })}
                </span>
              </li>
            ) : null}
            <li className="flex items-center gap-2.5 text-muted-foreground">
              <DocumentTextIcon aria-hidden className="size-4 shrink-0" />
              <span>
                {m('documents', '{count, plural, one {# document} other {# documents}}', {
                  count: summary.documents,
                })}
                {summary.reviewedAt ? (
                  <>
                    {' · '}
                    {m('reviewed', 'last reviewed')}{' '}
                    <LocalDate date={summary.reviewedAt} options={{ dateStyle: 'medium' }} />
                  </>
                ) : null}
              </span>
            </li>
          </ul>
        ) : null}

        <Button asChild variant="outline" className="mt-auto self-start">
          <Link to="/trust">{m('cta', 'View Trust & Security')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
