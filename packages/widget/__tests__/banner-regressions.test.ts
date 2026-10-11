// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { QuackbackBannerElement } from '../src/fork/banner/banner-element'
customElements.define('review-banner', QuackbackBannerElement)
const item = {
  id: 'a',
  source: 'announcement',
  kind: 'info',
  title: 'Notice',
  body: null,
  link: null,
  priority: 0,
  publishAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  updatedAt: '2026-01-01T00:00:00Z',
}
function feed(enabled = true) {
  return {
    enabled,
    epoch: 'epoch',
    revision: 1,
    nextTransitionAt: null,
    items: enabled ? [item] : [],
    theme: null,
  }
}
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
test.each(['getItem', 'setItem'] as const)(
  'dismiss works when browser storage %s fails',
  async (method) => {
    ;(window as Window & { __QUACKBACK_BANNER__?: { url: string } }).__QUACKBACK_BANNER__ = {
      url: 'https://example.internal',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => feed() }))
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error('blocked')
    })
    const el = document.createElement('review-banner') as QuackbackBannerElement
    document.body.append(el)
    await el.refresh()
    ;(el.shadowRoot!.querySelector('.dismiss') as HTMLButtonElement).click()
    expect(el.shadowRoot!.querySelector('.bar')).toBeNull()
  }
)
test('restores live connection after embed is turned back on', async () => {
  ;(window as Window & { __QUACKBACK_BANNER__?: { url: string } }).__QUACKBACK_BANNER__ = {
    url: 'https://example.internal',
  }
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  let streams = 0
  class FakeEventSource {
    static CLOSED = 2
    readyState = 1
    constructor() {
      streams++
    }
    addEventListener() {}
    close() {
      this.readyState = 2
    }
  }
  vi.stubGlobal('EventSource', FakeEventSource)
  let value = feed(false)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => ({ ok: true, json: async () => value }))
  )
  const el = document.createElement('review-banner') as QuackbackBannerElement
  document.body.append(el)
  await el.refresh()
  const first = streams
  value = feed(true)
  await el.refresh()
  expect(streams).toBeGreaterThan(first)
})
test('a live update retains link focus, and final dismissal provides a focus destination', async () => {
  ;(window as Window & { __QUACKBACK_BANNER__?: { url: string } }).__QUACKBACK_BANNER__ = {
    url: 'https://example.internal',
  }
  let value = {
    ...feed(),
    items: [{ ...item, link: { url: 'https://example.internal/details', label: 'Details' } }],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => ({ ok: true, json: async () => value }))
  )
  const el = document.createElement('review-banner') as QuackbackBannerElement
  document.body.append(el)
  await el.refresh()
  ;(el.shadowRoot!.querySelector('.link') as HTMLElement).focus()
  value = { ...value, items: [{ ...value.items[0]!, title: 'Updated notice' }] }
  await el.refresh()
  expect(el.shadowRoot!.activeElement?.textContent).toBe('Details')
  const dismiss = el.shadowRoot!.querySelector('.dismiss') as HTMLButtonElement
  dismiss.focus()
  dismiss.click()
  expect(el.shadowRoot!.activeElement?.textContent).toBe('No more announcements.')
})
