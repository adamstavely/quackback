import { describe, expect, it } from 'vitest'
import { isUnderPath, samePortalPath } from '../portal-link-tab'

describe('nav link items that point at the portal (seam T-19)', () => {
  const base = 'https://help.acme.internal'

  it('turns a link to this portal into its path', () => {
    expect(samePortalPath('https://help.acme.internal/trust', base)).toBe('/trust')
    expect(samePortalPath('https://help.acme.internal/trust/controls?x=1#y', base)).toBe(
      '/trust/controls?x=1#y'
    )
  })

  it('leaves other sites, and anything unparseable, as plain links', () => {
    expect(samePortalPath('https://other.acme.internal/trust', base)).toBeNull()
    expect(samePortalPath('http://help.acme.internal/trust', base)).toBeNull()
    expect(samePortalPath('not a url', base)).toBeNull()
    expect(samePortalPath('https://help.acme.internal/trust', undefined)).toBeNull()
  })

  it('is active on the page and below it, not on a sibling that shares a prefix', () => {
    expect(isUnderPath('/trust', '/trust')).toBe(true)
    expect(isUnderPath('/trust/controls', '/trust')).toBe(true)
    expect(isUnderPath('/trusted', '/trust')).toBe(false)
  })
})
