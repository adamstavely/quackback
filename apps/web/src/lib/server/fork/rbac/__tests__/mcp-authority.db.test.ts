/** An OAuth MCP caller holds their custom role, cut to the token's scopes (seam R-3). */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type PrincipalId, type RoleId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import {
  inArray,
  permissions,
  principal,
  principalRoleAssignments,
  rolePermissions,
  roles,
  user,
} from '@/lib/server/db'
import { PERMISSIONS } from '@/lib/shared/permissions'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

const { oauthMcpPermissions } = await import('../mcp-authority')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: permissions.id }).from(permissions).limit(1)
  },
})

if (fixture.available) {
  beforeEach(() => fixture.begin())
  afterEach(() => fixture.rollback())
  afterAll(() => fixture.close())
}

describe.skipIf(!fixture.available)('oauthMcpPermissions (real Postgres)', () => {
  it("is the person's custom role within the token's scopes", async () => {
    const userId = createId('user') as UserId
    const principalId = createId('principal') as PrincipalId
    await testDb.insert(user).values({ id: userId, name: 'UX', email: `ux-${userId}@example.com` })
    await testDb
      .insert(principal)
      .values({ id: principalId, userId, role: 'member', type: 'user', createdAt: new Date() })
    const roleId = createId('role') as RoleId
    await testDb.insert(roles).values({ id: roleId, key: roleId, name: 'UX', isSystem: false })
    const keys = [
      PERMISSIONS.POST_VIEW_PRIVATE,
      PERMISSIONS.POST_SET_STATUS,
      PERMISSIONS.TICKET_VIEW,
    ]
    const rows = await testDb
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, keys))
    await testDb
      .insert(rolePermissions)
      .values(rows.map((row) => ({ roleId, permissionId: row.id })))
    await testDb.insert(principalRoleAssignments).values({ principalId, roleId })

    const feedbackOnly = await oauthMcpPermissions(principalId, 'member', [
      'read:feedback',
      'write:feedback',
    ])
    expect([...feedbackOnly].sort()).toEqual(
      [PERMISSIONS.POST_SET_STATUS, PERMISSIONS.POST_VIEW_PRIVATE].sort()
    )
    expect(feedbackOnly.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false)
  })
})
