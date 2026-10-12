import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  plan: vi.fn(),
  migrate: vi.fn(),
  list: vi.fn(),
  states: vi.fn(),
}))
vi.mock('@/lib/server/workspaces/registry', () => ({ listActiveWorkspaces: state.list }))
vi.mock('@/lib/server/fleet/schema-state', () => ({ listSchemaState: state.states }))
vi.mock('@/lib/server/fleet/migrator', () => ({
  planWorkspace: state.plan,
  migrateWorkspace: state.migrate,
}))
import { runForkFleetMigrations } from '../migrate'
beforeEach(() => {
  vi.resetAllMocks()
  state.list.mockResolvedValue({ workspaces: [{ workspaceKey: 'one' }], refused: [] })
  state.states.mockResolvedValue([{ workspaceKey: 'one', status: 'succeeded' }])
  state.plan.mockResolvedValue({ refusal: null, replaySet: [] })
  state.migrate.mockResolvedValue({ ok: true, detail: 'done' })
})
it('reconciles an upstream-current tenant excluded from upstream claims', async () => {
  expect((await runForkFleetMigrations()).failed).toBe(0)
  expect(state.migrate).toHaveBeenCalledOnce()
})
it('does not advance a withheld upstream migration', async () => {
  state.plan.mockResolvedValue({ refusal: null, replaySet: ['withheld'] })
  expect((await runForkFleetMigrations()).failed).toBe(1)
  expect(state.migrate).not.toHaveBeenCalled()
})
it('does not report success for a selected suspended or missing tenant', async () => {
  state.list.mockResolvedValue({ workspaces: [], refused: [] })
  expect((await runForkFleetMigrations({ workspaceKey: 'suspended' })).failed).toBe(1)
})
it('does not migrate a blocked workspace', async () => {
  state.states.mockResolvedValue([{ workspaceKey: 'one', status: 'blocked' }])
  expect((await runForkFleetMigrations({ workspaceKey: 'one' })).failed).toBe(1)
  expect(state.migrate).not.toHaveBeenCalled()
})
