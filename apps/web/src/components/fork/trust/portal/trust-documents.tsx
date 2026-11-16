import { useId, useState, type FormEvent, type ReactElement } from 'react'
import { useIntl, type IntlShape } from 'react-intl'
import { toast } from 'sonner'
import { ArrowDownTrayIcon, DocumentTextIcon, LockClosedIcon } from '@heroicons/react/24/solid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { LocalDate } from '@/components/ui/local-date'
import { Textarea } from '@/components/ui/textarea'
import { trustDocumentHref, useRequestTrustAccess } from '@/lib/client/fork/trust'
import type { TrustPageDocument, TrustPageDocumentGroup } from '@/lib/shared/fork/trust/portal'
import { cn } from '@/lib/shared/utils'

/**
 * Documents on the portal's Trust & Security page (phase 3, D-TS3). Open
 * documents download straight away; restricted ones are requested, then
 * download until the approval runs out. The download route checks again.
 */

const t = (
  intl: IntlShape,
  id: string,
  defaultMessage: string,
  values?: Record<string, string | number>
) => intl.formatMessage({ id: `portal.forkTrust.${id}`, defaultMessage }, values)

const PANEL = 'rounded-panel border border-border bg-card text-card-foreground'

function DocumentAction({ doc }: { doc: TrustPageDocument }): ReactElement {
  const intl = useIntl()
  const [asking, setAsking] = useState(false)
  const { action } = doc
  if (action.kind === 'download') {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <a
          href={trustDocumentHref(doc.id)}
          className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground hover:bg-muted outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current"
          aria-label={t(intl, 'documents.download', 'Download {title}', { title: doc.title })}
        >
          <ArrowDownTrayIcon aria-hidden className="size-4" />
          {t(intl, 'documents.downloadShort', 'Download')}
        </a>
        {action.expiresAt ? (
          <span className="text-[11px] text-muted-foreground">
            {t(intl, 'documents.until', 'Access until')}{' '}
            <LocalDate date={action.expiresAt} options={{ dateStyle: 'medium' }} />
          </span>
        ) : null}
      </div>
    )
  }
  if (action.kind === 'pending') {
    return <Badge variant="secondary">{t(intl, 'documents.requested', 'Requested')}</Badge>
  }
  if (action.kind === 'contact') {
    // Requests need support tickets; without them, point at the security contact.
    return action.email ? (
      <a
        href={`mailto:${action.email}`}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground underline underline-offset-4 outline-none hover:no-underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current"
        aria-label={t(intl, 'documents.contactFor', 'Email {email} for access to {title}', {
          email: action.email,
          title: doc.title,
        })}
      >
        <LockClosedIcon aria-hidden className="size-3.5" />
        {t(intl, 'documents.contact', 'Ask for access')}
      </a>
    ) : (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <LockClosedIcon aria-hidden className="size-3.5" />
        {t(intl, 'documents.contactTeam', 'Ask the security team for access')}
      </span>
    )
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      {action.kind === 'declined' ? (
        <Badge variant="outline">{t(intl, 'documents.declined', 'Declined')}</Badge>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={t(intl, 'documents.requestFor', 'Request access to {title}', {
          title: doc.title,
        })}
        onClick={() => setAsking(true)}
      >
        <LockClosedIcon aria-hidden className="size-3.5" />
        {action.kind === 'declined'
          ? t(intl, 'documents.askAgain', 'Ask again')
          : t(intl, 'documents.request', 'Request access')}
      </Button>
      {asking ? <RequestDialog doc={doc} onClose={() => setAsking(false)} /> : null}
    </div>
  )
}

function RequestDialog({
  doc,
  onClose,
}: {
  doc: TrustPageDocument
  onClose: () => void
}): ReactElement {
  const intl = useIntl()
  const id = useId()
  const request = useRequestTrustAccess()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await request.mutateAsync({ documentId: doc.id, reason: reason.trim() || undefined })
      toast.success(
        t(intl, 'documents.sent', 'Request sent. You will hear back in your support requests.')
      )
      onClose()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(intl, 'documents.failed', 'Could not send the request.')
      )
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t(intl, 'documents.requestTitle', 'Request access')}</DialogTitle>
            <DialogDescription>{doc.title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-reason`}>
              {t(intl, 'documents.reason', 'Why do you need it?')}
              <span className="font-normal text-muted-foreground">
                {' '}
                {t(intl, 'documents.optional', '(optional)')}
              </span>
            </Label>
            <Textarea
              id={`${id}-reason`}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t(intl, 'documents.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={request.isPending}>
              {request.isPending
                ? t(intl, 'documents.sending', 'Sending…')
                : t(intl, 'documents.send', 'Send request')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DocumentRow({
  doc,
  compact,
}: {
  doc: TrustPageDocument
  compact?: boolean
}): ReactElement {
  const intl = useIntl()
  return (
    <li className="flex items-start gap-3 py-2.5">
      <DocumentTextIcon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm text-foreground [overflow-wrap:anywhere]">
          {doc.title}
          {doc.restricted ? (
            <span className="sr-only">{t(intl, 'documents.restricted', '(restricted)')}</span>
          ) : null}
        </span>
        {!compact && doc.description ? (
          <span className="text-xs text-muted-foreground">{doc.description}</span>
        ) : null}
      </div>
      <DocumentAction doc={doc} />
    </li>
  )
}

/** Overview: a compact card under Compliance. */
export function TrustDocumentsCard({ groups }: { groups: TrustPageDocumentGroup[] }): ReactElement {
  const intl = useIntl()
  return (
    <section
      aria-labelledby="trust-documents-heading"
      className={cn(PANEL, 'flex flex-col gap-4 p-6')}
    >
      <h2 id="trust-documents-heading" className="text-xl font-semibold tracking-tight">
        {t(intl, 'documents', 'Documents')}
      </h2>
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.name}
          </h3>
          <ul className="flex flex-col">
            {group.documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} compact />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** The Documents tab: every group, with descriptions. */
export function TrustDocuments({ groups }: { groups: TrustPageDocumentGroup[] }): ReactElement {
  const intl = useIntl()
  return (
    <section aria-labelledby="trust-all-documents" className="flex flex-col gap-5">
      <h2 id="trust-all-documents" className="text-xl font-semibold tracking-tight">
        {t(intl, 'documents', 'Documents')}
      </h2>
      {groups.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`docs-${group.id}`}
          className={cn(PANEL, 'flex flex-col p-6')}
        >
          <h3 id={`docs-${group.id}`} className="text-base font-semibold tracking-tight">
            {group.name}
          </h3>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {group.documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}
