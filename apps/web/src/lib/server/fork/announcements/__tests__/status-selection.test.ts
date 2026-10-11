import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  candidates: [] as { id: string; kind: string; status: string; scheduledStartAt: Date | null }[],
  incidents: new Map<string, unknown>(),
}))
vi.mock('@/lib/server/db', () => ({
  desc: () => null,
  and: () => null,
  eq: () => null,
  gt: () => null,
  gte: () => null,
  inArray: () => null,
  isNull: () => null,
  or: () => null,
  statusIncidents: {},
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async (n: number) => state.candidates.slice(0, n),
          }),
        }),
      }),
    }),
  },
}))
vi.mock('@/lib/server/domains/settings/settings.status', () => ({
  getStatusSettings: async () => ({}),
}))
vi.mock('@/lib/server/domains/settings/settings.service', () => ({
  isFeatureEnabled: async () => true,
}))
vi.mock('@/lib/shared/status-settings', () => ({ isStatusPagePublished: () => true }))
vi.mock('@/lib/server/domains/status', () => ({
  isStatusAudienceGranted: () => true,
  getPublicStatusIncident: async (_actor: unknown, id: string) => state.incidents.get(id) ?? null,
}))
import { buildStatusBanners } from '../status-feed'
it('ranks visible incidents before capping, including critical items after 40 candidates', async () => {
  state.candidates = Array.from({ length: 51 }, (_, i) => ({
    id: String(i),
    kind: 'incident',
    status: 'investigating',
    scheduledStartAt: null,
  }))
  state.incidents.clear()
  // The first 30 are restricted. The last candidate is the most important.
  for (let i = 30; i < 51; i++)
    state.incidents.set(String(i), {
      id: String(i),
      kind: 'incident',
      title: String(i),
      impact: i === 50 ? 'critical' : 'minor',
      startedAt: new Date('2026-10-01'),
      resolvedAt: null,
      updates: [],
    })
  const result = await buildStatusBanners({} as never, 24, new Date('2026-10-02'))
  expect(result.items).toHaveLength(10)
  expect(result.items[0]?.id).toBe('status:50')
  expect(result.items.every((i) => Number(i.title) >= 30)).toBe(true)
})
