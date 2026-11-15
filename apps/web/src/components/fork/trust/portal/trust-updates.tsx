import type { ReactElement } from 'react'
import { useIntl, type IntlShape } from 'react-intl'
import { toast } from 'sonner'
import { ArrowTopRightOnSquareIcon, BellIcon, BellSlashIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { LocalDate } from '@/components/ui/local-date'
import { useSetTrustSubscription } from '@/lib/client/fork/trust'
import type { TrustPageUpdate } from '@/lib/shared/fork/trust/portal'
import { cn } from '@/lib/shared/utils'

/**
 * Updates on the portal's Trust & Security page (phase 4, D-TS8): the list,
 * and the button that subscribes the viewer to email and in-app notices.
 */

const t = (intl: IntlShape, id: string, defaultMessage: string) =>
  intl.formatMessage({ id: `portal.forkTrust.${id}`, defaultMessage })

const PANEL = 'rounded-panel border border-border bg-card text-card-foreground'

export function TrustSubscribeButton({ subscribed }: { subscribed: boolean }): ReactElement {
  const intl = useIntl()
  const setSubscribed = useSetTrustSubscription()
  const toggle = async () => {
    try {
      await setSubscribed.mutateAsync(!subscribed)
      toast.success(
        subscribed
          ? t(intl, 'updates.unsubscribed', 'You will no longer get Trust & Security updates.')
          : t(
              intl,
              'updates.subscribed',
              'Subscribed. New updates arrive by email and in your notifications.'
            )
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t(intl, 'updates.failed', 'That did not work. Try again.')
      )
    }
  }
  const Icon = subscribed ? BellSlashIcon : BellIcon
  return (
    <Button
      type="button"
      variant="outline"
      disabled={setSubscribed.isPending}
      onClick={() => void toggle()}
    >
      <Icon aria-hidden className="size-4" />
      {subscribed
        ? t(intl, 'updates.unsubscribe', 'Unsubscribe from updates')
        : t(intl, 'updates.subscribe', 'Subscribe to updates')}
    </Button>
  )
}

/** The Updates tab; the page header carries the subscribe button. */
export function TrustUpdates({ updates }: { updates: TrustPageUpdate[] }): ReactElement {
  const intl = useIntl()
  return (
    <section aria-labelledby="trust-updates" className="flex flex-col gap-4">
      <h2 id="trust-updates" className="text-xl font-semibold tracking-tight">
        {t(intl, 'updates', 'Updates')}
      </h2>
      {updates.length === 0 ? (
        <p className={cn(PANEL, 'p-6 text-sm text-muted-foreground')}>
          {t(intl, 'updates.none', 'No updates yet. Subscribe to hear about the first one.')}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {updates.map((update) => (
            <li key={update.id}>
              <article
                aria-labelledby={`trust-update-${update.id}`}
                className={cn(PANEL, 'flex flex-col gap-2 p-6')}
              >
                <p className="text-xs text-muted-foreground">
                  <LocalDate date={update.publishedAt} options={{ dateStyle: 'long' }} />
                </p>
                <h3
                  id={`trust-update-${update.id}`}
                  className="text-base font-semibold tracking-tight text-foreground"
                >
                  {update.title}
                </h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {update.body}
                </p>
                {update.linkUrl ? (
                  <a
                    href={update.linkUrl}
                    className="flex items-center gap-1.5 self-start text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
                  >
                    {update.linkLabel || update.linkUrl}
                    <ArrowTopRightOnSquareIcon aria-hidden className="size-3.5" />
                  </a>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
