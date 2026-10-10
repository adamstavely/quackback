/**
 * Sends a query-less `GET /` to the help hub, the portal home (D-T15).
 *
 * Registered last in `start.ts` (seam T-16), after workspace resolution, so an
 * unknown or deleted workspace host still gets its own 404 rather than a
 * redirect. The redirect is temporary (307), so a browser never caches it.
 * Why this lives at the request layer rather than on the route is explained in
 * `lib/shared/fork/portal-home.ts`.
 */
import { createMiddleware } from '@tanstack/react-start'
import { isBarePortalRootRequest, PORTAL_HOME_PATH } from '@/lib/shared/fork/portal-home'

export const portalHomeMiddleware = createMiddleware().server(({ next, request }) => {
  if (!isBarePortalRootRequest(request.method, request.url)) return next()
  return new Response(null, { status: 307, headers: { Location: PORTAL_HOME_PATH } })
})
