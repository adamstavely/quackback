import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/config', () => ({ config: { baseUrl: 'https://qb.example.internal' } }))

const { scopeThemeToShadowRoot } = await import('../embed')
const { formatWindow, isNewer } =
  await import('../../../../../../../../packages/widget/src/fork/banner/helpers')

describe('scopeThemeToShadowRoot', () => {
  const css =
    ':root { --background: white; --primary: gold; } .dark { --background: black; } body { color: red; } html body { font-family: X !important; }'

  it('moves the theme variables onto the banner root, where the page cannot override them', () => {
    const scoped = scopeThemeToShadowRoot(css)
    expect(scoped).toContain('.qb-root { --background: white; --primary: gold; }')
    expect(scoped).toContain('.qb-root.qb-dark { --background: black; }')
  })

  it('drops page-level rules, so nothing reaches the host app', () => {
    const scoped = scopeThemeToShadowRoot(css)
    expect(scoped).not.toMatch(/(^|\s)(body|html|:root|:host)\b/)
  })
})

describe('embed client helpers', () => {
  it('treats a higher revision or a new epoch as newer', () => {
    const shown = { epoch: 'E1', revision: 5 }
    expect(isNewer({ epoch: 'E1', revision: 6 }, shown)).toBe(true)
    expect(isNewer({ epoch: 'E1', revision: 5 }, shown)).toBe(false)
    expect(isNewer({ epoch: 'E2', revision: 1 }, shown)).toBe(true)
  })

  it('formats a same-day maintenance window with the end time only', () => {
    const text = formatWindow({ start: '2026-10-11T13:00:00Z', end: '2026-10-11T15:00:00Z' })
    expect(text).toContain('–')
    expect(text.split('–')[1]!.trim().length).toBeLessThan(text.split('–')[0]!.trim().length)
  })
})
