import type { ReactElement, ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useIntl, type IntlShape } from 'react-intl'
import {
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  EnvelopeIcon,
  LinkIcon,
  LockClosedIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { LocalDate } from '@/components/ui/local-date'
import { useAuthPopoverSafe } from '@/components/auth/auth-popover-context'
import type { ControlStatus } from '@/lib/shared/fork/trust/schema'
import type { TrustPageContent, TrustPageControlGroup } from '@/lib/shared/fork/trust/portal'
import { cn } from '@/lib/shared/utils'

/**
 * The portal's Trust & Security page (plans/v2/70-trust-security.md §1; design:
 * "Trust & Security — A" on the canvas). Platform components and tokens only,
 * so each app's branding carries through (D-TS6).
 */

const t = (
  intl: IntlShape,
  id: string,
  defaultMessage: string,
  values?: Record<string, string | number>
) => intl.formatMessage({ id: `portal.forkTrust.${id}`, defaultMessage }, values)

const TABS = [
  { to: '/trust', id: 'tab.overview', label: 'Overview', show: () => true },
  {
    to: '/trust/controls',
    id: 'tab.controls',
    label: 'Controls',
    show: (c: TrustPageContent) => c.controlGroups.length > 0,
  },
  {
    to: '/trust/subprocessors',
    id: 'tab.subprocessors',
    label: 'Subprocessors',
    show: (c: TrustPageContent) => c.subprocessors.length > 0,
  },
  {
    to: '/trust/faq',
    id: 'tab.faq',
    label: 'FAQ',
    show: (c: TrustPageContent) => c.faq.length > 0,
  },
] as const

const PANEL = 'rounded-panel border border-border bg-card text-card-foreground'

export function TrustPageShell({
  content,
  children,
}: {
  content: TrustPageContent | null
  children: ReactNode
}): ReactElement {
  const intl = useIntl()
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, '') })
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-[44px] sm:leading-[1.1]">
          {t(intl, 'title', 'Trust & Security')}
        </h1>
        {content?.intro ? (
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
            {content.intro}
          </p>
        ) : null}
        {content && (content.contactEmail || content.policyUrl) ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm">
            {content.contactEmail ? (
              <a
                href={`mailto:${content.contactEmail}`}
                className="flex items-center gap-2 text-foreground underline underline-offset-4 hover:no-underline"
              >
                <EnvelopeIcon aria-hidden className="size-4 text-muted-foreground" />
                {content.contactEmail}
              </a>
            ) : null}
            {content.policyUrl ? (
              <a
                href={content.policyUrl}
                className="flex items-center gap-2 text-foreground underline underline-offset-4 hover:no-underline"
              >
                <LinkIcon aria-hidden className="size-4 text-muted-foreground" />
                {content.policyLabel || t(intl, 'policy', 'Data handling policy')}
              </a>
            ) : null}
          </div>
        ) : null}
      </header>

      {content ? (
        <nav
          aria-label={t(intl, 'sections', 'Trust & Security sections')}
          className="flex flex-wrap gap-1 border-b border-border pb-3"
        >
          {TABS.filter((tab) => tab.show(content)).map((tab) => {
            const active = pathname === tab.to
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors [border-radius:calc(var(--radius)*0.8)]',
                  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current',
                  active
                    ? 'bg-[var(--nav-active-background)] text-[var(--nav-active-foreground)]'
                    : 'text-muted-foreground hover:bg-[var(--nav-active-background)]/50 hover:text-foreground'
                )}
              >
                {t(intl, tab.id, tab.label)}
              </Link>
            )
          })}
        </nav>
      ) : null}

      {children}
    </div>
  )
}

/** D-TS2: the page is for signed-in employees; the portal's own sign-in opens. */
export function TrustSignIn(): ReactElement {
  const intl = useIntl()
  const popover = useAuthPopoverSafe()
  return (
    <section className={cn(PANEL, 'flex flex-col items-start gap-4 p-8')}>
      <LockClosedIcon aria-hidden className="size-6 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">
          {t(intl, 'signIn.title', 'Sign in to see Trust & Security')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(intl, 'signIn.body', 'This page is for signed-in employees.')}
        </p>
      </div>
      <Button type="button" onClick={() => popover?.openAuthPopover({ mode: 'login' })}>
        {t(intl, 'signIn.action', 'Sign in')}
      </Button>
    </section>
  )
}

// ── Controls ────────────────────────────────────────────────────────────

const STATUS: Record<
  ControlStatus,
  { id: string; label: string; icon: typeof CheckCircleIcon; className: string }
> = {
  in_place: {
    id: 'status.inPlace',
    label: 'In place',
    icon: CheckCircleIcon,
    className: 'text-success',
  },
  in_progress: {
    id: 'status.inProgress',
    label: 'In progress',
    icon: ClockIcon,
    className: 'text-warning',
  },
  not_applicable: {
    id: 'status.notApplicable',
    label: 'Not applicable',
    icon: MinusCircleIcon,
    className: 'text-muted-foreground',
  },
}

function ControlRow({
  status,
  name,
  description,
}: {
  status: ControlStatus
  name: string
  description?: string | null
}): ReactElement {
  const intl = useIntl()
  const s = STATUS[status]
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <s.icon
        role="img"
        aria-label={t(intl, s.id, s.label)}
        className={cn('mt-px size-[18px] shrink-0', s.className)}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-foreground [overflow-wrap:anywhere]">{name}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </li>
  )
}

function ReviewedPill({ at }: { at: string | null }): ReactElement | null {
  const intl = useIntl()
  if (!at) return null
  return (
    <span className="flex h-7 items-center gap-2 rounded-full border border-border px-3 text-xs text-muted-foreground">
      <span aria-hidden className="size-2 rounded-full bg-success" />
      {t(intl, 'reviewed', 'Last reviewed')}{' '}
      <LocalDate date={at} options={{ dateStyle: 'medium' }} />
    </span>
  )
}

/** Overview: up to three controls per group, the rest behind the Controls tab. */
function ControlsPreview({
  groups,
  reviewedAt,
}: {
  groups: TrustPageControlGroup[]
  reviewedAt: string | null
}): ReactElement {
  const intl = useIntl()
  return (
    <section aria-labelledby="trust-controls-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="trust-controls-heading" className="text-xl font-semibold tracking-tight">
          {t(intl, 'controls', 'Controls')}
        </h2>
        <ReviewedPill at={reviewedAt} />
        <Link
          to="/trust/controls"
          className="ms-auto text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
        >
          {t(intl, 'controls.viewAll', 'View all controls')}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map((group) => {
          const more = group.controls.length - 3
          return (
            <div key={group.id} className={cn(PANEL, 'flex flex-col gap-3.5 p-5')}>
              <Link
                to="/trust/controls"
                hash={`group-${group.id}`}
                className="flex items-center justify-between gap-3 text-base font-semibold tracking-tight text-foreground hover:underline"
              >
                {group.name}
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
              <ul className="flex flex-col gap-2.5">
                {group.controls.slice(0, 3).map((c) => (
                  <ControlRow key={c.id} status={c.status} name={c.name} />
                ))}
              </ul>
              {more > 0 ? (
                <Link
                  to="/trust/controls"
                  hash={`group-${group.id}`}
                  className="self-start text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  {t(intl, 'controls.more', '+ {count} more', { count: more })}
                </Link>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ComplianceCard({ items }: { items: TrustPageContent['complianceItems'] }): ReactElement {
  const intl = useIntl()
  return (
    <section
      aria-labelledby="trust-compliance-heading"
      className={cn(PANEL, 'flex flex-col gap-1 p-6')}
    >
      <h2 id="trust-compliance-heading" className="text-xl font-semibold tracking-tight">
        {t(intl, 'compliance', 'Compliance')}
      </h2>
      <ul className="mt-3 flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 border-t border-border py-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-foreground"
            >
              {item.label}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{item.name}</span>
              {item.detail ? (
                <span className="text-xs text-muted-foreground">{item.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TrustOverview({ content }: { content: TrustPageContent }): ReactElement {
  const intl = useIntl()
  const hasCompliance = content.complianceItems.length > 0
  const hasControls = content.controlGroups.length > 0
  if (!hasCompliance && !hasControls) {
    return (
      <p className={cn(PANEL, 'p-6 text-sm text-muted-foreground')}>
        {t(intl, 'empty', 'Nothing has been published here yet.')}
      </p>
    )
  }
  return (
    <div
      className={cn(
        'grid grid-cols-1 items-start gap-6',
        hasCompliance && hasControls && 'lg:grid-cols-[360px_minmax(0,1fr)]'
      )}
    >
      {hasCompliance ? <ComplianceCard items={content.complianceItems} /> : null}
      {hasControls ? (
        <ControlsPreview groups={content.controlGroups} reviewedAt={content.controlsReviewedAt} />
      ) : null}
    </div>
  )
}

export function TrustControls({ content }: { content: TrustPageContent }): ReactElement {
  const intl = useIntl()
  return (
    <section aria-labelledby="trust-all-controls" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="trust-all-controls" className="text-xl font-semibold tracking-tight">
          {t(intl, 'controls', 'Controls')}
        </h2>
        <ReviewedPill at={content.controlsReviewedAt} />
      </div>
      {content.controlGroups.map((group) => (
        <section
          key={group.id}
          id={`group-${group.id}`}
          aria-labelledby={`group-${group.id}-heading`}
          className={cn(PANEL, 'flex scroll-mt-24 flex-col gap-4 p-6')}
        >
          <div className="flex flex-col gap-1">
            <h3 id={`group-${group.id}-heading`} className="text-base font-semibold tracking-tight">
              {group.name}
            </h3>
            {group.description ? (
              <p className="text-sm text-muted-foreground">{group.description}</p>
            ) : null}
          </div>
          <ul className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
            {group.controls.map((c) => (
              <ControlRow key={c.id} status={c.status} name={c.name} description={c.description} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

export function TrustSubprocessors({ content }: { content: TrustPageContent }): ReactElement {
  const intl = useIntl()
  return (
    <section aria-labelledby="trust-subprocessors" className="flex flex-col gap-4">
      <h2 id="trust-subprocessors" className="text-xl font-semibold tracking-tight">
        {t(intl, 'subprocessors', 'Subprocessors')}
      </h2>
      <div className={cn(PANEL, 'overflow-x-auto')}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">
            {t(intl, 'subprocessors.caption', 'Services that process data for this app')}
          </caption>
          <thead className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-3">
                {t(intl, 'subprocessors.name', 'Name')}
              </th>
              <th scope="col" className="px-5 py-3">
                {t(intl, 'subprocessors.purpose', 'Purpose')}
              </th>
              <th scope="col" className="px-5 py-3">
                {t(intl, 'subprocessors.location', 'Location')}
              </th>
              <th scope="col" className="px-5 py-3">
                {t(intl, 'subprocessors.data', 'Data')}
              </th>
            </tr>
          </thead>
          <tbody>
            {content.subprocessors.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-b-0 align-top">
                <th scope="row" className="px-5 py-3 font-medium text-foreground">
                  {s.website ? (
                    <a href={s.website} className="underline underline-offset-4 hover:no-underline">
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                </th>
                <td className="px-5 py-3 text-muted-foreground">{s.purpose}</td>
                <td className="px-5 py-3 text-muted-foreground">{s.location}</td>
                <td className="px-5 py-3 text-muted-foreground">{s.dataCategories ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function TrustFaq({ content }: { content: TrustPageContent }): ReactElement {
  const intl = useIntl()
  return (
    <section aria-labelledby="trust-faq" className="flex flex-col gap-4">
      <h2 id="trust-faq" className="text-xl font-semibold tracking-tight">
        {t(intl, 'faq', 'Frequently asked questions')}
      </h2>
      <ul className={cn(PANEL, 'flex flex-col')}>
        {content.faq.map((article) => (
          <li key={article.id} className="border-b border-border last:border-b-0">
            <a
              href={article.href}
              className="flex items-center gap-3 px-5 py-4 outline-none hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{article.title}</span>
                {article.description ? (
                  <span className="text-xs text-muted-foreground">{article.description}</span>
                ) : null}
              </span>
              <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
