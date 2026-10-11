import { createServerFn } from '@tanstack/react-start'


/** One feedback post by the caller, trimmed to what the hub row shows. */
export interface HubFeedbackPost {
  postId: string
  title: string
  boardSlug: string
  statusName: string | null
  occurredAt: string
}

/**
 * The caller's own feedback posts, for the hub's Feedback card.
 *
 * The client session does not carry a principal id (see the note in
 * `components/public/comment-form.tsx`), so the caller is resolved server-side
 * and only ever reads its OWN activity: the principal comes from the session,
 * never from the request, so a caller cannot name whose feedback to read.
 * Visibility is upstream's: the profile reader filters posts through the
 * viewer's actor, and a portal that denies the caller returns nothing.
 */
export const getMyHubFeedbackFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ posts: HubFeedbackPost[] }> => {
    const empty = { posts: [] as HubFeedbackPost[] }
    // Lazy imports, like every other server fn here: the route module that
    // calls this must not pull the server graph into its own compile.
    const { getOptionalAuth, hasAuthCredentials, policyActorFromAuth } = await import(
      '@/lib/server/functions/auth-helpers'
    )
    const ctx = hasAuthCredentials() ? await getOptionalAuth() : null
    if (!ctx?.principal || ctx.principal.type === 'anonymous') return empty

    const { resolvePortalAccessForRequest } = await import(
      '@/lib/server/functions/portal-access'
    )
    const access = await resolvePortalAccessForRequest()
    if (!access.granted) return empty

    const { getPublicUserProfile } = await import('@/lib/server/domains/users/user.public-profile')
    const actor = await policyActorFromAuth(ctx)
    const profile = await getPublicUserProfile(ctx.principal.id, actor)
    if (!profile) return empty

    return {
      posts: profile.posts.map((post) => ({
        postId: post.postId,
        title: post.title,
        boardSlug: post.boardSlug,
        statusName: post.statusName,
        occurredAt:
          post.occurredAt instanceof Date ? post.occurredAt.toISOString() : String(post.occurredAt),
      })),
    }
  }
)
