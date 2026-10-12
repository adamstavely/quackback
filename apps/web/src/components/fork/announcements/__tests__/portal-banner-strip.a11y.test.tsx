// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { IntlProvider } from 'react-intl'
import { PortalBannerStrip } from '../portal-banner-strip'
import type { BannerItem } from '@/lib/shared/fork/announcements/types'

const inIntl = (ui: ReactElement) => <IntlProvider locale="en">{ui}</IntlProvider>
vi.mock('@tanstack/react-router', () => ({ useRouterState: () => false }))
const item = (id: string): BannerItem => ({
  id,
  source: 'announcement',
  kind: 'info',
  title: id,
  body: null,
  link: null,
  priority: 0,
  publishAt: '2026-01-01',
  expiresAt: null,
  updatedAt: '2026-01-01',
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})
test('blocked storage keeps successive dismissals and keyboard focus', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  const user = userEvent.setup()
  render(inIntl(<PortalBannerStrip items={[item('First'), item('Second')]} />))
  await user.click(screen.getByRole('button', { name: 'Dismiss: First' }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss: Second' }))
  await user.keyboard('{Enter}')
  expect(screen.queryByRole('button', { name: 'Dismiss: First' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Dismiss: Second' })).toBeNull()
  expect(document.activeElement?.textContent).toContain('No more announcements')
})
test('removing a focused banner through a feed update restores focus within the strip', async () => {
  const { rerender } = render(inIntl(<PortalBannerStrip items={[item('First'), item('Second')]} />))
  screen.getByRole('button', { name: 'Dismiss: First' }).focus()
  rerender(inIntl(<PortalBannerStrip items={[item('Second')]} />))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss: Second' }))
})
