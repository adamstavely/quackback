// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntlProvider } from 'react-intl'
import { HubRating } from '../hub-rating'

afterEach(cleanup)
test('arrow selection does not submit; explicit submit reports the result and restores focus', async () => {
  const onRate = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(
    <IntlProvider locale="en">
      <HubRating conversationId="one" onRate={onRate} />
    </IntlProvider>
  )
  await user.tab()
  await user.keyboard('{ArrowRight}')
  expect(onRate).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Submit rating' }))
  await waitFor(() => expect(onRate).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('status').textContent).toContain('Rated')
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change' }))
  )
  await user.click(screen.getByRole('button', { name: 'Change' }))
  await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('radio'))
})
test('a failed submit exposes an error and retains the selected rating for retry', async () => {
  const onRate = vi.fn().mockRejectedValue(new Error('offline'))
  const user = userEvent.setup()
  render(
    <IntlProvider locale="en">
      <HubRating conversationId="two" onRate={onRate} />
    </IntlProvider>
  )
  await user.click(screen.getByRole('radio', { name: '4 of 5' }))
  await user.click(screen.getByRole('button', { name: 'Submit rating' }))
  expect((await screen.findByRole('alert')).textContent).toContain('try again')
  expect(screen.getByRole('radio', { name: '4 of 5' }).getAttribute('aria-checked')).toBe('true')
})
