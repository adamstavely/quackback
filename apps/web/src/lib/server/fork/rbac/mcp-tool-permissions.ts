import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'

/**
 * What each MCP tool needs from a team caller's permission set, on top of
 * upstream's scope / team / feature guards (plans/v2/10 §4.3 item 5, seam R-5,
 * Appendix A.1). Every tool and every argument must be classified here: the
 * coverage test fails when upstream adds a tool or an argument, so each one is
 * a decision at merge time.
 *
 * - `base`: keys always required, or 'none' (an explicit decision).
 * - `anyOf`: at least one of these keys.
 * - `fields`: an argument that is set (not undefined, null or false) requires its key.
 * - `requireField`: reject a call that sets none of `fields` (nothing to do).
 * - `dispatch`: the spec depends on an argument's value (or a TypeID's prefix);
 *   an unknown value is denied.
 * - `ticketsVisible`: these ticket-ID arguments must be visible to the caller.
 * - `ownComment`: editing someone else's comment also needs `otherKey`.
 * - `inert`: arguments that need no key of their own.
 */
export interface McpToolSpec {
  base: readonly PermissionKey[] | 'none'
  anyOf?: readonly PermissionKey[]
  fields?: Readonly<Record<string, PermissionKey>>
  requireField?: boolean
  dispatch?: {
    arg: string
    /** Read the TypeID prefix of the argument rather than its value. */
    typeIdPrefix?: boolean
    /** The branch an absent argument selects. */
    default?: string
    branches: Readonly<Record<string, McpToolSpec>>
  }
  ticketsVisible?: readonly string[]
  ownComment?: { arg: string; otherKey: PermissionKey }
  inert?: readonly string[]
}

const P = PERMISSIONS
const none: McpToolSpec = { base: 'none' }
const needs = (...keys: PermissionKey[]) => keys

const SEARCH_FILTERS = [
  'query',
  'boardId',
  'categoryId',
  'status',
  'tagIds',
  'sort',
  'showDeleted',
  'dateFrom',
  'dateTo',
  'limit',
  'cursor',
  'authorPrincipalId',
  'authorEmail',
] as const

const CHANGELOG_FIELDS = {
  title: P.CHANGELOG_MANAGE,
  content: P.CHANGELOG_MANAGE,
  publish: P.CHANGELOG_MANAGE,
  publishedAt: P.CHANGELOG_MANAGE,
  displayDate: P.CHANGELOG_MANAGE,
  linkedPostIds: P.CHANGELOG_MANAGE,
} as const

export const FORK_MCP_TOOL_SPECS: Readonly<Record<string, McpToolSpec>> = {
  // ── search.ts ───────────────────────────────────────────────────────────
  search: {
    base: 'none',
    dispatch: {
      arg: 'entity',
      default: 'posts',
      branches: {
        posts: { base: needs(P.POST_VIEW_PRIVATE) },
        changelogs: { base: needs(P.CHANGELOG_VIEW_DRAFT) },
        articles: none, // no read key; upstream's team check stays
      },
    },
    inert: SEARCH_FILTERS,
  },
  get_details: {
    base: 'none',
    dispatch: {
      arg: 'id',
      typeIdPrefix: true,
      branches: {
        post: { base: needs(P.POST_VIEW_PRIVATE) },
        changelog: { base: needs(P.CHANGELOG_VIEW_DRAFT) },
        article: none,
        kb_article: none,
        kb_category: none,
      },
    },
  },

  // ── posts.ts ────────────────────────────────────────────────────────────
  triage_post: {
    base: 'none',
    fields: {
      statusId: P.POST_SET_STATUS,
      tagIds: P.POST_SET_TAGS,
      ownerPrincipalId: P.POST_SET_OWNER,
    },
    requireField: true,
    inert: ['postId'],
  },
  vote_post: { base: 'none', inert: ['postId'] }, // own vote (D-R12)
  proxy_vote: {
    base: needs(P.POST_VOTE_ON_BEHALF),
    inert: ['action', 'postId', 'voterPrincipalId', 'sourceType', 'sourceExternalUrl'],
  },
  create_post: {
    base: needs(P.POST_CREATE),
    fields: { statusId: P.POST_SET_STATUS, tagIds: P.POST_SET_TAGS },
    inert: ['boardId', 'title', 'content'],
  },
  merge_post: { base: needs(P.POST_MERGE), inert: ['duplicatePostId', 'canonicalPostId'] },
  unmerge_post: { base: needs(P.POST_MERGE), inert: ['postId'] },
  delete_post: { base: needs(P.POST_DELETE), inert: ['postId'] },
  restore_post: { base: needs(P.POST_DELETE), inert: ['postId'] },
  get_post_activity: { base: needs(P.POST_VIEW_PRIVATE), inert: ['postId'] },

  // ── comments.ts (read-only personas may comment, D-R6) ─────────────────
  add_comment: {
    base: 'none',
    fields: { isPrivate: P.COMMENT_VIEW_PRIVATE },
    inert: ['postId', 'content', 'parentId'],
  },
  update_comment: {
    base: 'none',
    ownComment: { arg: 'commentId', otherKey: P.COMMENT_EDIT },
    inert: ['content'],
  },
  delete_comment: {
    base: 'none',
    ownComment: { arg: 'commentId', otherKey: P.COMMENT_MODERATE },
  },
  react_to_comment: { base: 'none', inert: ['action', 'commentId', 'emoji'] }, // D-R12

  // ── changelog.ts (publish included, D-R10) ─────────────────────────────
  create_changelog: {
    base: needs(P.CHANGELOG_MANAGE),
    inert: ['title', 'content', 'publish', 'publishedAt'],
  },
  update_changelog: {
    base: needs(P.CHANGELOG_MANAGE),
    fields: CHANGELOG_FIELDS,
    requireField: true,
    inert: ['changelogId'],
  },
  delete_changelog: { base: needs(P.CHANGELOG_MANAGE), inert: ['changelogId'] },

  // ── suggestions.ts ──────────────────────────────────────────────────────
  accept_suggestion: { base: needs(P.SUGGESTION_MANAGE), inert: ['id', 'swapDirection'] },
  dismiss_suggestion: { base: needs(P.SUGGESTION_MANAGE), inert: ['id'] },
  restore_suggestion: { base: needs(P.SUGGESTION_MANAGE), inert: ['id'] },

  // ── help-center.ts ──────────────────────────────────────────────────────
  create_article: {
    base: needs(P.HELP_CENTER_MANAGE),
    inert: ['categoryId', 'title', 'content', 'slug', 'description', 'authorId'],
  },
  update_article: {
    base: needs(P.HELP_CENTER_MANAGE),
    inert: [
      'articleId',
      'title',
      'content',
      'slug',
      'description',
      'categoryId',
      'publishedAt',
      'authorId',
    ],
  },
  delete_article: { base: needs(P.HELP_CENTER_MANAGE), inert: ['articleId'] },
  manage_category: {
    base: needs(P.HELP_CENTER_MANAGE),
    inert: ['action', 'categoryId', 'name', 'slug', 'description', 'icon', 'parentId', 'isPublic'],
  },

  // ── conversations.ts (by-ID access stays upstream's, O-R7) ─────────────
  list_conversations: {
    base: needs(P.CONVERSATION_VIEW),
    inert: ['status', 'priority', 'assignedAgentPrincipalId', 'cursor', 'limit'],
  },
  get_conversation: {
    base: needs(P.CONVERSATION_VIEW),
    inert: ['conversationId', 'includeInternal', 'cursor'],
  },
  reply_to_conversation: {
    base: needs(P.CONVERSATION_REPLY),
    inert: ['conversationId', 'content', 'fileIds'],
  },
  suggest_post: {
    base: needs(P.CONVERSATION_REPLY),
    inert: ['conversationId', 'boardId', 'title', 'content'],
  },
  share_post: { base: needs(P.CONVERSATION_REPLY), inert: ['conversationId', 'postId'] },
  set_conversation_status: {
    base: needs(P.CONVERSATION_SET_STATUS),
    inert: ['conversationId', 'status'],
  },

  // ── tickets.ts ──────────────────────────────────────────────────────────
  list_tickets: {
    base: needs(P.TICKET_VIEW),
    inert: [
      'type',
      'ticketTypeId',
      'statusCategory',
      'stage',
      'requesterPrincipalId',
      'companyId',
      'sort',
      'limit',
    ],
  },
  get_ticket: {
    base: needs(P.TICKET_VIEW),
    ticketsVisible: ['ticketId'],
    inert: ['includeInternal', 'cursor'],
  },
  create_ticket: {
    base: needs(P.TICKET_CREATE),
    inert: [
      'type',
      'ticketTypeId',
      'title',
      'description',
      'priority',
      'requesterPrincipalId',
      'companyId',
    ],
  },
  reply_to_ticket: {
    base: needs(P.TICKET_REPLY),
    ticketsVisible: ['ticketId'],
    inert: ['content', 'fileIds'],
  },
  add_ticket_note: {
    base: needs(P.TICKET_NOTE),
    ticketsVisible: ['ticketId'],
    inert: ['content', 'fileIds'],
  },
  link_ticket: { base: needs(P.TICKET_ASSIGN), ticketsVisible: ['trackerTicketId', 'ticketId'] },
  unlink_ticket: { base: needs(P.TICKET_ASSIGN), ticketsVisible: ['trackerTicketId', 'ticketId'] },

  // ── files.ts: an upload is only ever attached to a reply or a note ─────
  upload_file: {
    base: 'none',
    anyOf: needs(P.CONVERSATION_REPLY, P.CONVERSATION_NOTE, P.TICKET_REPLY, P.TICKET_NOTE),
    inert: ['name', 'contentBase64'],
  },

  // ── widget.ts ───────────────────────────────────────────────────────────
  widget_install_status: { base: needs(P.INTEGRATION_VIEW) },

  // ── settings.ts / navigation.ts: upstream gates these on the caller's
  //    permission set itself (resolveMcpActor, navigation entries) ────────
  get_settings: { base: 'none', inert: ['area'] },
  propose_settings_change: { base: 'none', inert: ['changes'] },
  navigate_workspace: { base: 'none', inert: ['destination'] },
}
