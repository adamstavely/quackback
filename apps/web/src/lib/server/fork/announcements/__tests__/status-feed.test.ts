import { describe, expect, it } from 'vitest'
import { RESOLVED_BANNER_MS, statusIncidentToBanner } from '../status-feed'
import type { PublicStatusIncident } from '@/lib/server/domains/status/status.types'

const NOW = new Date('2026-10-12T10:00:00Z')
const HOUR = 60 * 60 * 1000
const LEAD = 24 * HOUR

function incident(over: Partial<PublicStatusIncident>): PublicStatusIncident {
  return {
    id: 'status_incident_1' as PublicStatusIncident['id'],
    kind: 'incident',
    title: 'Login is down',
    status: 'investigating',
    impact: 'major',
    scheduledStartAt: null,
    scheduledEndAt: null,
    startedAt: new Date(NOW.getTime() - HOUR),
    resolvedAt: null,
    affectedComponents: [],
    updates: [],
    ...over,
  }
}

describe('statusIncidentToBanner', () => {
  it('maps open incidents by impact', () => {
    expect(statusIncidentToBanner(incident({ impact: 'critical' }), LEAD, NOW)?.kind).toBe(
      'critical'
    )
    expect(statusIncidentToBanner(incident({ impact: 'major' }), LEAD, NOW)?.kind).toBe('critical')
    expect(statusIncidentToBanner(incident({ impact: 'minor' }), LEAD, NOW)?.kind).toBe('warning')
    expect(statusIncidentToBanner(incident({ impact: 'none' }), LEAD, NOW)?.kind).toBe('info')
  })

  it('links to the incident on the status page and prefixes its id', () => {
    const item = statusIncidentToBanner(incident({}), LEAD, NOW)!
    expect(item.source).toBe('status')
    expect(item.id).toBe('status:status_incident_1')
    expect(item.link).toEqual({ url: '/status/status_incident_1', label: 'View status' })
  })

  it('shows a resolved incident as Resolved for one hour', () => {
    const resolvedAt = new Date(NOW.getTime() - 10 * 60 * 1000)
    const item = statusIncidentToBanner(incident({ resolvedAt, status: 'resolved' }), LEAD, NOW)!
    expect(item.kind).toBe('success')
    expect(item.expiresAt).toBe(new Date(resolvedAt.getTime() + RESOLVED_BANNER_MS).toISOString())
    const old = new Date(NOW.getTime() - 2 * HOUR)
    expect(
      statusIncidentToBanner(incident({ resolvedAt: old, status: 'resolved' }), LEAD, NOW)
    ).toBeNull()
  })

  it('shows scheduled maintenance with its window, from the start of the lead window', () => {
    const start = new Date(NOW.getTime() + 3 * HOUR)
    const end = new Date(NOW.getTime() + 5 * HOUR)
    const item = statusIncidentToBanner(
      incident({
        kind: 'maintenance',
        status: 'scheduled',
        impact: 'maintenance',
        scheduledStartAt: start,
        scheduledEndAt: end,
      }),
      LEAD,
      NOW
    )!
    expect(item.kind).toBe('maintenance')
    expect(item.window).toEqual({ start: start.toISOString(), end: end.toISOString() })
    expect(Date.parse(item.publishAt)).toBeLessThanOrEqual(NOW.getTime())
  })

  it('shows maintenance in progress, and drops scheduled maintenance whose window has passed', () => {
    const start = new Date(NOW.getTime() - HOUR)
    const end = new Date(NOW.getTime() + HOUR)
    expect(
      statusIncidentToBanner(
        incident({
          kind: 'maintenance',
          status: 'in_progress',
          scheduledStartAt: start,
          scheduledEndAt: end,
        }),
        LEAD,
        NOW
      )?.kind
    ).toBe('maintenance')
    expect(
      statusIncidentToBanner(
        incident({
          kind: 'maintenance',
          status: 'scheduled',
          scheduledStartAt: start,
          scheduledEndAt: new Date(NOW.getTime() - 1),
        }),
        LEAD,
        NOW
      )
    ).toBeNull()
  })

  it('changes its dismissal key when the incident gets a new update', () => {
    const before = statusIncidentToBanner(incident({}), LEAD, NOW)!
    const after = statusIncidentToBanner(
      incident({
        updates: [
          {
            createdAt: new Date(NOW.getTime() - 60_000),
          } as PublicStatusIncident['updates'][number],
        ],
      }),
      LEAD,
      NOW
    )!
    expect(after.updatedAt).not.toBe(before.updatedAt)
  })
})
