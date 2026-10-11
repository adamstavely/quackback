/**
 * A key acts with its creator's custom role, never the Manager preset it would
 * get upstream (plans/v2/10 §4.3, seams R-1/R-2), and narrows ticket and
 * conversation access for team-restricted creators (D-R13).
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type PrincipalId, type RoleId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import {
  and,
  eq,
  inArray,
  permissions,
  principal,
  principalRoleAssignments,
  rolePermissions,
  roles,
  user,
} from '@/lib/server/db'
import { PERMISSIONS, type PermissionKey } from '@/lib/shared/permissions'
import { permissionsForLegacyRole } from '@/lib/server/policy/permissions'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

const { copyCreatorAssignments, resolveKeyPermissions } = await import('../key-authority')

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: roles.id }).from(roles).limit(0)
    await db.select({ id: permissions.id }).from(permissions).limit(1)
  },
})

if (fixture.available) {
  beforeEach(() => fixture.begin())
  afterEach(() => fixture.rollback())
  afterAll(() => fixture.close())
}

const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

async function seedTeammate(role: 'admin' | 'member' | 'user' = 'member') {
  const userId = createId('user') as UserId
  const principalId = createId('principal') as PrincipalId
  await testDb.insert(user).values({ id: userId, name: 'T', email: `t-${suffix()}@example.com` })
  await testDb
    .insert(principal)
    .values({ id: principalId, userId, role, type: 'user', createdAt: new Date() })
  return principalId
}

async function seedKeyPrincipal(role: 'admin' | 'member' = 'member') {
  const principalId = createId('principal') as PrincipalId
  await testDb.insert(principal).values({
    id: principalId,
    userId: null,
    role,
    type: 'service',
    displayName: 'Key',
    createdAt: new Date(),
  })
  return principalId
}

async function customRole(keys: PermissionKey[]): Promise<RoleId> {
  const id = createId('role') as RoleId
  await testDb.insert(roles).values({ id, key: id, name: `Custom ${suffix()}`, isSystem: false })
  const rows = await testDb
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.key, keys))
  expect(rows).toHaveLength(keys.length)
  await testDb
    .insert(rolePermissions)
    .values(rows.map((row) => ({ roleId: id, permissionId: row.id })))
  return id
}

async function assign(principalId: PrincipalId, roleId: RoleId) {
  await testDb.insert(principalRoleAssignments).values({ principalId, roleId })
}

const UX_KEYS: PermissionKey[] = [
  PERMISSIONS.POST_VIEW_PRIVATE,
  PERMISSIONS.POST_SET_STATUS,
  PERMISSIONS.TICKET_VIEW,
]

describe.skipIf(!fixture.available)('key authority (real Postgres)', () => {
  it("a new key carries its creator's custom role, not the Manager preset", async () => {
    const creator = await seedTeammate()
    await assign(creator, await customRole(UX_KEYS))
    const key = await seedKeyPrincipal()
    await copyCreatorAssignments(creator, key, testDb)

    const [copied] = await testDb
      .select()
      .from(principalRoleAssignments)
      .where(eq(principalRoleAssignments.principalId, key))
    expect(copied.grantedByPrincipalId).toBe(creator)

    const set = await resolveKeyPermissions({
      servicePrincipalId: key,
      serviceRole: 'member',
      createdById: creator,
    })
    // ticket.view is dropped: the creator cannot see every ticket (D-R13).
    expect([...set].sort()).toEqual([PERMISSIONS.POST_SET_STATUS, PERMISSIONS.POST_VIEW_PRIVATE])
    expect(set.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false)
  })

  it('loses authority when its creator is demoted', async () => {
    const creator = await seedTeammate()
    const ux = await customRole(UX_KEYS)
    await assign(creator, ux)
    const key = await seedKeyPrincipal()
    await copyCreatorAssignments(creator, key, testDb)

    const readOnly = await customRole([PERMISSIONS.POST_VIEW_PRIVATE])
    await testDb
      .update(principalRoleAssignments)
      .set({ roleId: readOnly })
      .where(
        and(
          eq(principalRoleAssignments.principalId, creator),
          eq(principalRoleAssignments.roleId, ux)
        )
      )

    const set = await resolveKeyPermissions({
      servicePrincipalId: key,
      serviceRole: 'member',
      createdById: creator,
    })
    expect([...set]).toEqual([PERMISSIONS.POST_VIEW_PRIVATE])
  })

  it('keeps only the copied role once its creator is gone (no Manager fallback)', async () => {
    const creator = await seedTeammate()
    await assign(creator, await customRole(UX_KEYS))
    const key = await seedKeyPrincipal()
    await copyCreatorAssignments(creator, key, testDb)

    const set = await resolveKeyPermissions({
      servicePrincipalId: key,
      serviceRole: 'member',
      createdById: null,
    })
    expect([...set].sort()).toEqual([PERMISSIONS.POST_SET_STATUS, PERMISSIONS.POST_VIEW_PRIVATE])
  })

  it("caps a key made before the fork (preset, no copied rows) at its creator's role", async () => {
    const creator = await seedTeammate()
    await assign(creator, await customRole(UX_KEYS))
    const key = await seedKeyPrincipal()

    const set = await resolveKeyPermissions({
      servicePrincipalId: key,
      serviceRole: 'member',
      createdById: creator,
    })
    expect([...set].sort()).toEqual([PERMISSIONS.POST_SET_STATUS, PERMISSIONS.POST_VIEW_PRIVATE])
  })

  it('holds nothing once its creator is no longer a teammate', async () => {
    const creator = await seedTeammate('user')
    const key = await seedKeyPrincipal()
    const set = await resolveKeyPermissions({
      servicePrincipalId: key,
      serviceRole: 'member',
      createdById: creator,
    })
    expect(set.size).toBe(0)
  })

  it("leaves an admin's key with the Owner preset", async () => {
    const creator = await seedTeammate('admin')
    const key = await seedKeyPrincipal('admin')
    await copyCreatorAssignments(creator, key, testDb)
    const set = await resolveKeyPermissions({
      servicePrincipalId: key,
      serviceRole: 'admin',
      createdById: creator,
    })
    expect(set).toEqual(permissionsForLegacyRole('admin'))
  })
})
