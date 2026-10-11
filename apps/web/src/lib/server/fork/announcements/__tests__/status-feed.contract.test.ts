import { describe, expect, it } from 'vitest'
import * as status from '@/lib/server/domains/status'
import * as statusSettings from '@/lib/server/domains/settings/settings.status'
import * as settingsService from '@/lib/server/domains/settings/settings.service'
import * as sharedStatus from '@/lib/shared/status-settings'
import { statusIncidents } from '@/lib/server/db'

/**
 * Status banners read upstream's status domain without changing it (§4.5).
 * This pins what they rely on, so an upstream sync that renames or reshapes
 * any of it fails here instead of silently emptying the banner strip.
 */
describe('upstream status surface used by status banners', () => {
  it('still exports the gate and projection functions', () => {
    expect(typeof status.getPublicStatusIncident).toBe('function')
    expect(typeof status.isStatusAudienceGranted).toBe('function')
    expect(typeof statusSettings.getStatusSettings).toBe('function')
    expect(typeof settingsService.isFeatureEnabled).toBe('function')
    expect(typeof sharedStatus.isStatusPagePublished).toBe('function')
  })

  it('still has the status_incidents columns the candidate query reads', () => {
    for (const column of [
      'id',
      'kind',
      'status',
      'scheduledStartAt',
      'scheduledEndAt',
      'resolvedAt',
      'deletedAt',
    ] as const) {
      expect(statusIncidents[column], column).toBeDefined()
    }
  })
})
