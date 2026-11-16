import { beforeEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({
  ctx: null as null | { principal: { id: string; type: string }; permissions: string[] },
  enabled: true,
  admitted: true,
  doc: null as null | Record<string, unknown>,
  grant: false,
  audits: [] as unknown[],
}))

vi.mock('@/lib/server/functions/auth-helpers', () => ({
  hasAuthCredentials: () => s.ctx !== null,
  getOptionalAuth: async () => s.ctx,
}))
vi.mock('@/lib/server/fork/settings/features', () => ({
  isForkFeatureEnabled: async () => s.enabled,
}))
vi.mock('@/lib/server/functions/portal-access', () => ({
  resolvePortalAccessForRequest: async () => ({ granted: s.admitted }),
}))
vi.mock('@/lib/server/db', () => ({
  eq: () => null,
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (s.doc ? [s.doc] : []) }) }),
    }),
  },
}))
vi.mock('@/lib/server/fork/db', () => ({ forkTrustDocuments: { id: 'id' } }))
vi.mock('@/lib/server/fork/trust/access.service', () => ({ hasLiveGrant: async () => s.grant }))
vi.mock('@/lib/server/audit/log', () => ({
  actorFromAuth: () => ({}),
  recordAuditEvent: async (e: unknown) => void s.audits.push(e),
}))
vi.mock('@/lib/server/config', () => ({ config: { s3Proxy: false } }))
vi.mock('@/lib/server/storage/s3', () => ({
  generatePresignedGetUrl: async () => 'https://storage.internal/signed',
  getS3Object: async () => ({ body: null }),
}))

const { handleTrustDocumentDownload } = await import('../$documentId')
const ID = '8b9c2f1e-0000-4000-8000-000000000001'
const get = () =>
  handleTrustDocumentDownload({
    request: new Request(`http://x/api/fork-trust/documents/${ID}`),
    params: { documentId: ID },
  })

beforeEach(() => {
  s.ctx = { principal: { id: 'principal_1', type: 'user' }, permissions: [] }
  s.enabled = true
  s.admitted = true
  s.grant = false
  s.audits = []
  s.doc = {
    id: ID,
    storageKey: 'fork-trust/x.pdf',
    published: true,
    access: 'open',
    fileName: 'x.pdf',
    version: 1,
  }
})

describe('trust document downloads (D-TS3)', () => {
  it('needs a signed-in person', async () => {
    s.ctx = null
    expect((await get()).status).toBe(401)
  })

  it('hands a signed-in employee an open document, and audits it', async () => {
    const res = await get()
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://storage.internal/signed')
    expect(s.audits).toHaveLength(1)
  })

  it('refuses a restricted document without a live approval, and allows it with one', async () => {
    s.doc!.access = 'restricted'
    expect((await get()).status).toBe(403)
    expect(s.audits).toHaveLength(0)
    s.grant = true
    expect((await get()).status).toBe(302)
  })

  it('hides drafts and everything while the page is off, but not from trust staff', async () => {
    s.doc!.published = false
    expect((await get()).status).toBe(404)
    s.ctx!.permissions = ['trust.view']
    s.doc!.access = 'restricted'
    expect((await get()).status).toBe(302)
    s.ctx!.permissions = []
    s.doc!.published = true
    s.enabled = false
    expect((await get()).status).toBe(404)
  })

  it('refuses someone the portal does not admit', async () => {
    s.admitted = false
    expect((await get()).status).toBe(403)
  })
})
