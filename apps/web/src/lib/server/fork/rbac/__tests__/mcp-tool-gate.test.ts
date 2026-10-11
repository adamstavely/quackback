import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import type { McpAuthContext } from '@/lib/server/mcp/types'

const hoisted = vi.hoisted(() => ({
  commentAuthor: null as string | null,
  assertTicketVisible: vi.fn(async () => ({})),
}))

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            hoisted.commentAuthor ? [{ principalId: hoisted.commentAuthor }] : [],
        }),
      }),
    }),
  },
}))
vi.mock('@/lib/server/domains/tickets/ticket.service', () => ({
  assertTicketVisible: hoisted.assertTicketVisible,
}))

const { forkMcpToolGate } = await import('../mcp-tool-gate')
const { forkMcpResourceGate } = await import('../mcp-resource-gate')

const P = PERMISSIONS
const UX_TEAM: PermissionKey[] = [
  P.POST_VIEW_PRIVATE,
  P.POST_CREATE,
  P.POST_SET_STATUS,
  P.POST_SET_TAGS,
  P.POST_MERGE,
  P.STATUS_VIEW,
  P.TAG_VIEW,
  P.CHANGELOG_VIEW_DRAFT,
]

function caller(keys: PermissionKey[], over: Partial<McpAuthContext> = {}): McpAuthContext {
  return {
    principalId: 'principal_ux' as McpAuthContext['principalId'],
    userId: 'user_ux' as McpAuthContext['userId'],
    name: 'UX',
    role: 'member',
    authMethod: 'oauth',
    scopes: [],
    permissions: new Set(keys),
    ...over,
  }
}

const denied = (p: Promise<void>) => expect(p).rejects.toThrow()

beforeEach(() => {
  hoisted.commentAuthor = null
  hoisted.assertTicketVisible.mockClear()
})

describe('forkMcpToolGate', () => {
  it('lets the UX Team change a status, but not assign an owner', async () => {
    await forkMcpToolGate(caller(UX_TEAM), 'triage_post', { postId: 'p', statusId: 's' })
    await expect(
      forkMcpToolGate(caller(UX_TEAM), 'triage_post', {
        postId: 'p',
        statusId: 's',
        ownerPrincipalId: 'me',
      })
    ).rejects.toThrow(`'${P.POST_SET_OWNER}'`)
  })

  it('rejects a triage with nothing to change', async () => {
    await expect(forkMcpToolGate(caller(UX_TEAM), 'triage_post', { postId: 'p' })).rejects.toThrow(
      'at least one field'
    )
  })

  it('names every missing key', async () => {
    await expect(forkMcpToolGate(caller([]), 'create_post', { tagIds: ['t'] })).rejects.toThrow(
      `'${P.POST_CREATE}', '${P.POST_SET_TAGS}'`
    )
  })

  it('denies a tool with no rule', async () => {
    await denied(forkMcpToolGate(caller(UX_TEAM), 'some_new_upstream_tool', {}))
  })

  it('leaves portal users to upstream', async () => {
    await forkMcpToolGate(caller([], { role: 'user' }), 'delete_post', { postId: 'p' })
  })

  it('dispatches search on its entity, defaulting to posts', async () => {
    await forkMcpToolGate(caller([P.POST_VIEW_PRIVATE]), 'search', {})
    await denied(forkMcpToolGate(caller([]), 'search', {}))
    await denied(forkMcpToolGate(caller([P.POST_VIEW_PRIVATE]), 'search', { entity: 'changelogs' }))
    await forkMcpToolGate(caller([]), 'search', { entity: 'articles' })
    await denied(forkMcpToolGate(caller(UX_TEAM), 'search', { entity: 'tickets' }))
  })

  it('dispatches get_details on the TypeID prefix', async () => {
    const postId = 'post_01h455vb4pex5vsknk084sn02q'
    await forkMcpToolGate(caller([P.POST_VIEW_PRIVATE]), 'get_details', { id: postId })
    await denied(forkMcpToolGate(caller([]), 'get_details', { id: postId }))
    await expect(
      forkMcpToolGate(caller(UX_TEAM), 'get_details', { id: 'ticket_01h455vb4pex5vsknk084sn02q' })
    ).rejects.toThrow('Unsupported entity type')
    // not a TypeID: upstream answers with a format hint and reads nothing
    await forkMcpToolGate(caller([]), 'get_details', { id: 'nope' })
  })

  it("checks every ticket ID is visible to the caller, with the caller's set", async () => {
    const agent = caller([P.TICKET_ASSIGN])
    await forkMcpToolGate(agent, 'link_ticket', { trackerTicketId: 't1', ticketId: 't2' })
    expect(hoisted.assertTicketVisible).toHaveBeenCalledTimes(2)
    expect(hoisted.assertTicketVisible).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ permissions: agent.permissions, principalType: 'user' })
    )
  })

  it("lets anyone edit their own comment, but someone else's needs comment.edit", async () => {
    hoisted.commentAuthor = 'principal_ux'
    await forkMcpToolGate(caller([]), 'update_comment', { commentId: 'c', content: 'x' })
    hoisted.commentAuthor = 'principal_other'
    await expect(
      forkMcpToolGate(caller([]), 'update_comment', { commentId: 'c', content: 'x' })
    ).rejects.toThrow(`'${P.COMMENT_EDIT}'`)
    await forkMcpToolGate(caller([P.COMMENT_EDIT]), 'update_comment', {
      commentId: 'c',
      content: 'x',
    })
  })

  it('lets read-only personas comment publicly, not privately (D-R6)', async () => {
    await forkMcpToolGate(caller([]), 'add_comment', {
      postId: 'p',
      content: 'x',
      isPrivate: false,
    })
    await denied(
      forkMcpToolGate(caller([]), 'add_comment', { postId: 'p', content: 'x', isPrivate: true })
    )
  })

  it('accepts any reply or note key for an upload', async () => {
    await forkMcpToolGate(caller([P.TICKET_NOTE]), 'upload_file', { name: 'a', contentBase64: '' })
    await denied(forkMcpToolGate(caller(UX_TEAM), 'upload_file', { name: 'a', contentBase64: '' }))
  })

  it('falls back to the role preset for a context built without a set', async () => {
    const manager = caller([], { permissions: undefined })
    await forkMcpToolGate(manager, 'delete_post', { postId: 'p' })
  })
})

describe('forkMcpResourceGate', () => {
  it('needs member.view for members, and keeps portal users out of it', async () => {
    expect(await forkMcpResourceGate(caller(UX_TEAM), 'quackback://members')).toMatch('member.view')
    expect(await forkMcpResourceGate(caller([P.MEMBER_VIEW]), 'quackback://members')).toBeNull()
    expect(await forkMcpResourceGate(caller([], { role: 'user' }), 'quackback://members')).toMatch(
      'team member'
    )
  })

  it('opens boards and roadmaps to every teammate (D-R5)', async () => {
    expect(await forkMcpResourceGate(caller([]), 'quackback://boards')).toBeNull()
    expect(await forkMcpResourceGate(caller([]), 'quackback://roadmaps')).toBeNull()
    expect(await forkMcpResourceGate(caller([]), 'quackback://statuses')).toMatch('status.view')
  })
})
