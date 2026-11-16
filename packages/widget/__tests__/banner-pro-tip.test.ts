// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { QuackbackBannerElement } from '../src/fork/banner/banner-element'
import { ICONS } from '../src/fork/banner/icons'
customElements.define('tip-banner', QuackbackBannerElement)

const item = (id: string, kind: string) => ({
  id,
  source: 'announcement',
  kind,
  title: `${kind} notice`,
  body: null,
  link: null,
  priority: 0,
  publishAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  updatedAt: '2026-01-01T00:00:00Z',
})

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

test('a Pro Tip draws as its own kind, with the lightbulb, announced politely', async () => {
  ;(window as Window & { __QUACKBACK_BANNER__?: { url: string } }).__QUACKBACK_BANNER__ = {
    url: 'https://example.internal',
  }
  const feed = {
    enabled: true,
    epoch: 'epoch',
    revision: 1,
    nextTransitionAt: null,
    items: [item('t', 'tip')],
    theme: null,
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => feed }))
  const el = document.createElement('tip-banner') as QuackbackBannerElement
  document.body.append(el)
  await el.refresh()

  const bar = el.shadowRoot!.querySelector('.bar') as HTMLElement
  expect(bar.classList.contains('kind-tip')).toBe(true)
  expect(bar.getAttribute('role')).toBe('status')
  expect(bar.textContent).toContain('Pro Tip')
  const drawn = [...bar.querySelectorAll('svg path')].map((p) => p.getAttribute('d'))
  expect(drawn).toEqual(expect.arrayContaining(ICONS.tip.map((p) => p.d)))
})
