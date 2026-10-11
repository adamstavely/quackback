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

  it('sends visitors from outside the portal to the hub', () => {
    expect(
      isBarePortalRootRequest('GET', 'http://acme.test/', 'https://idp.example/callback')
    ).toBe(true)
    expect(isBarePortalRootRequest('GET', 'http://acme.test/', 'not a url')).toBe(true)
  })

  it('leaves a portal link opened in a new tab on the board', () => {
    // e.g. the Feedback tab, middle-clicked from any portal page
    expect(isBarePortalRootRequest('GET', 'http://acme.test/', 'http://acme.test/roadmap')).toBe(
      false
    )
  })

  it('points home at the hub route', () => {
    expect(PORTAL_HOME_PATH).toBe('/hub')
  })
})
