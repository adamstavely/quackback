import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enabled: true,
  principal: { id: 'principal_1', type: 'user' } as { id: string; type: string } | null,
  granted: true,
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (fn: () => unknown) => fn,
    validator: () => ({ handler: (fn: () => unknown) => fn }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/lib/server/fork/settings/features', () => ({
  isForkFeatureEnabled: async () => state.enabled,
}))
vi.mock('@/lib/server/functions/auth-helpers', () => ({
  hasAuthCredentials: () => state.principal !== null,
  getOptionalAuth: async () => (state.principal ? { principal: state.principal } : null),
  policyActorFromAuth: async () => ({ principalId: 'principal_1' }),
}))
vi.mock('@/lib/server/functions/portal-access', () => ({
  resolvePortalAccessForRequest: async () => ({ granted: state.granted }),
}))
vi.mock('@/lib/server/fork/trust/portal', () => ({
  buildTrustPageContent: async () => ({ intro: 'Hello' }),
}))

const { getTrustPageFn } = await import('@/lib/server/functions/fork/trust-portal')
const call = getTrustPageFn as unknown as () => Promise<{ status: string }>

beforeEach(() => {
  state.enabled = true
  state.principal = { id: 'principal_1', type: 'user' }
  state.granted = true
})

describe('the portal Trust & Security page (D-TS2)', () => {
  it('is off until the workspace turns it on', async () => {
    state.enabled = false
    expect(await call()).toEqual({ status: 'off' })
  })

  it('asks a signed-out or anonymous viewer to sign in, and shows no content', async () => {
    state.principal = null
    expect(await call()).toEqual({ status: 'signed_out' })
    state.principal = { id: 'principal_anon', type: 'anonymous' }
    expect(await call()).toEqual({ status: 'signed_out' })
  })

  it('shows nothing to someone the portal does not admit', async () => {
    state.granted = false
    expect(await call()).toEqual({ status: 'signed_out' })
  })

  it('shows the content to a signed-in employee', async () => {
    expect(await call()).toEqual({ status: 'ok', content: { intro: 'Hello' } })
  })
})
