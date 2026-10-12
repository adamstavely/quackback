import type { ReactElement } from 'react'
import { FormattedMessage } from 'react-intl'

/** The portal's main landmark; `_portal.tsx` gives `<main>` this id (seam A11Y-2). */
export const PORTAL_MAIN_ID = 'portal-main'

/**
 * First stop for keyboard users: past the portal header and its navigation,
 * straight to the page (WCAG 2.2 SC 2.4.1). Mirrors the admin shell's skip
 * link; the outline uses the text colour so it stays visible on any theme.
 */
export function PortalSkipLink(): ReactElement {
  return (
    <a
      href={`#${PORTAL_MAIN_ID}`}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-background focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-md focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current"
    >
      <FormattedMessage id="portal.fork.skipToContent" defaultMessage="Skip to content" />
    </a>
  )
}
