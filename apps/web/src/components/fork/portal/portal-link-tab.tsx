import type { ReactElement } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useBaseUrl } from '@/lib/client/hooks/use-root-context'

/**
 * The path a nav link item points at, when it points at this portal itself
 * (same origin as the workspace's base URL); otherwise null. Upstream's nav
 * editor only accepts absolute URLs, so a portal page arrives as one.
 */
export function samePortalPath(href: string, baseUrl: string | undefined): string | null {
  if (!baseUrl) return null
  try {
    const target = new URL(href)
    if (target.origin !== new URL(baseUrl).origin) return null
    return `${target.pathname}${target.search}${target.hash}` || '/'
  } catch {
    return null
  }
}

/** Active on the page itself and anything under it (`/trust`, `/trust/controls`). */
export function isUnderPath(pathname: string, path: string): boolean {
  const base = path.replace(/[?#].*$/, '').replace(/\/$/, '') || '/'
  return pathname === base || pathname.startsWith(`${base}/`)
}

/**
 * Seam T-19 (plans/v2/70-trust-security.md §6): a nav link item whose URL is
 * this portal renders as an in-app tab, with a router link and the active
 * highlight, like the built-in tabs. Upstream's nav editor saves every link
 * as "open in a new tab" with no way to change it, which suits other sites but
 * not the portal's own pages, so `newTab` is ignored here. Anything else
 * renders upstream's own link (`children`) unchanged.
 */
export function PortalLinkTab({
  href,
  label,
  className,
  children,
}: {
  href: string
  label: string
  className: (isActive: boolean) => string
  children: ReactElement
}): ReactElement {
  const baseUrl = useBaseUrl()
  const path = samePortalPath(href, baseUrl)
  const isActive = useRouterState({
    select: (s) => (path ? isUnderPath(s.location.pathname, path) : false),
  })
  if (!path) return children
  return (
    <Link
      to={path as never}
      aria-current={isActive ? 'page' : undefined}
      className={className(isActive)}
    >
      {label}
    </Link>
  )
}
