/**
 * The help hub is the portal's home page (D-T15).
 *
 * Upstream keeps the feedback board at the portal root `/`, so the hub cannot
 * simply take that path, and the router cannot tell "home" from "the board"
 * either: on the server and in the browser alike it fills in the board's
 * search defaults (`?sort=trending`) before any route hook runs. The raw
 * request still can. Once the router has been involved every board URL carries
 * a query string, so a query-less `GET /` is a full page load of the bare root.
 * When it comes from outside the portal (a typed URL, a bookmark, the SSO
 * return, a link in an email or another app) it goes to the hub. When it comes
 * from a portal page (its Referer is the portal's own origin) it is a portal
 * link to the board opened in a new tab, such as the Feedback tab, and is left
 * alone. In-app navigation never reaches the server, so the Feedback tab keeps
 * upstream's link unchanged and the logo links to the hub (seam T-17).
 */
export const PORTAL_HOME_PATH = '/hub'

/** The board's default search; the hub's own links to the board carry it. */
export const FEEDBACK_BOARD_SEARCH = { sort: 'trending' } as const

const ENTRY_METHODS = new Set(['GET', 'HEAD'])

/** True for a full page load of the bare portal root that comes from outside the portal. */
export function isBarePortalRootRequest(
  method: string,
  url: string,
  referer: string | null = null
): boolean {
  if (!ENTRY_METHODS.has(method)) return false
  const { origin, pathname, search } = new URL(url)
  if (pathname !== '/' || search !== '') return false
  return !referer || !URL.canParse(referer) || new URL(referer).origin !== origin
}
