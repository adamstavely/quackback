import { describe, expect, it } from 'vitest'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import { narrowServicePermissions } from '../key-authority'

const set = (...keys: PermissionKey[]) => new Set<PermissionKey>(keys)

describe('narrowServicePermissions (D-R13)', () => {
  it('drops ticket and conversation keys when the set cannot see them all', () => {
    const narrowed = narrowServicePermissions(
      set(
        PERMISSIONS.TICKET_VIEW,
        PERMISSIONS.TICKET_REPLY,
        PERMISSIONS.CONVERSATION_VIEW,
        PERMISSIONS.POST_VIEW_PRIVATE
      )
    )
    expect([...narrowed]).toEqual([PERMISSIONS.POST_VIEW_PRIVATE])
  })

  it('keeps ticket keys alongside ticket.view_all, and conversation keys alongside conversation.view_all', () => {
    const narrowed = narrowServicePermissions(
      set(
        PERMISSIONS.TICKET_VIEW,
        PERMISSIONS.TICKET_VIEW_ALL,
        PERMISSIONS.CONVERSATION_VIEW,
        PERMISSIONS.CONVERSATION_REPLY
      )
    )
    expect([...narrowed].sort()).toEqual(
      [PERMISSIONS.TICKET_VIEW, PERMISSIONS.TICKET_VIEW_ALL].sort()
    )
  })

  it('leaves the Manager preset untouched', async () => {
    const { permissionsForLegacyRole } = await import('@/lib/server/policy/permissions')
    const manager = permissionsForLegacyRole('member')
    expect(narrowServicePermissions(manager)).toBe(manager)
  })
})
