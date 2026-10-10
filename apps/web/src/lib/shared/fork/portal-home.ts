/**
 * The help hub is the portal's home page (D-T15).
 *
 * Upstream keeps the feedback board at the portal root `/`, so the hub cannot
 * simply take that path, and the router cannot tell "home" from "the board"
 * either: on the server and in the browser alike it fills in the board's
 * search defaults (`?sort=trending`) before any route hook runs. The raw
 * request still can. Once the router has been involved, every board URL carries
 * a query string, so a query-less `GET /` is someone arriving from outside
 * (a typed URL, a bookmark, the SSO return, a link in an email or another app).
 * That entry goes to the hub; every board URL is left as it was.
 *
 * Inside the portal the logo is the way home, so it links to the hub too.
 * Links that mean "the board" carry `FEEDBACK_BOARD_SEARCH`, the board's own
 * default, so their href is `/?sort=trending` and opening one in a new tab
 * (a raw request again) still lands on the board.
 */
export const PORTAL_HOME_PATH = '/hub'

/** Search that marks a link to `/` as "the feedback board", not "home". */
export const FEEDBACK_BOARD_SEARCH = { sort: 'trending' } as const

/** Search for a built-in portal nav tab's link: only the Feedback tab has one. */
export function portalNavTabSearch(type: string): typeof FEEDBACK_BOARD_SEARCH | undefined {
  return type === 'feedback' ? FEEDBACK_BOARD_SEARCH : undefined
}

const ENTRY_METHODS = new Set(['GET', 'HEAD'])

/** True for a request that enters the portal at its root with no query string. */
export function isBarePortalRootRequest(method: string, url: string): boolean {
  if (!ENTRY_METHODS.has(method)) return false
  const { pathname, search } = new URL(url)
  return pathname === '/' && search === ''
}
