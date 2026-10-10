import { describe, expect, it } from 'vitest'
import { isBarePortalRootRequest, PORTAL_HOME_PATH } from '../portal-home'

describe('isBarePortalRootRequest', () => {
  it('matches a query-less GET or HEAD of the portal root', () => {
    expect(isBarePortalRootRequest('GET', 'http://acme.test/')).toBe(true)
    expect(isBarePortalRootRequest('HEAD', 'http://acme.test/')).toBe(true)
  })

  it('leaves every board URL alone', () => {
    expect(isBarePortalRootRequest('GET', 'http://acme.test/?sort=trending')).toBe(false)
    expect(isBarePortalRootRequest('GET', 'http://acme.test/?board=ideas')).toBe(false)
    expect(isBarePortalRootRequest('GET', 'http://acme.test/?auth=signin')).toBe(false)
  })

  it('leaves other paths and methods alone', () => {
    expect(isBarePortalRootRequest('GET', 'http://acme.test/hub')).toBe(false)
    expect(isBarePortalRootRequest('GET', 'http://acme.test/roadmap')).toBe(false)
    expect(isBarePortalRootRequest('POST', 'http://acme.test/')).toBe(false)
  })

  it('points home at the hub route', () => {
    expect(PORTAL_HOME_PATH).toBe('/hub')
  })
})
