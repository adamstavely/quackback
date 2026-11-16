import { describe, expect, it } from 'vitest'
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from '@/lib/shared/permissions'

/** Who may do what on the Trust & Security admin (plans/v2/70-trust-security.md §3). */
describe('trust permissions by preset', () => {
  it('lets Contributors read the trust admin but not change it or approve access', () => {
    const contributor = SYSTEM_ROLE_PERMISSIONS.contributor
    expect(contributor).toContain(PERMISSIONS.TRUST_VIEW)
    expect(contributor).not.toContain(PERMISSIONS.TRUST_MANAGE)
    expect(contributor).not.toContain(PERMISSIONS.TRUST_APPROVE)
  })

  it('gives Managers and Owners all three', () => {
    for (const preset of ['manager', 'owner'] as const) {
      expect(SYSTEM_ROLE_PERMISSIONS[preset]).toEqual(
        expect.arrayContaining([
          PERMISSIONS.TRUST_VIEW,
          PERMISSIONS.TRUST_MANAGE,
          PERMISSIONS.TRUST_APPROVE,
        ])
      )
    }
  })
})
