// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { HubTrustCard } = await import('../hub-trust-card')
const { HubStatusCard } = await import('../hub-status-card')

afterEach(cleanup)

const inIntl = (node: ReactNode) => render(<IntlProvider locale="en">{node}</IntlProvider>)

test('the trust card summarises controls and documents and links to the page', () => {
  inIntl(
    <HubTrustCard
      summary={{ controlsInPlace: 12, controlsTotal: 14, documents: 1, reviewedAt: null }}
    />
  )
  expect(screen.getByRole('heading', { level: 2, name: 'Trust & Security' })).toBeTruthy()
  expect(screen.getByText('12 of 14 controls in place')).toBeTruthy()
  expect(screen.getByText('1 document')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View Trust & Security' }).getAttribute('href')).toBe(
    '/trust'
  )
})

test('without a summary the trust card shows no numbers, only the link', () => {
  inIntl(<HubTrustCard summary={null} />)
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.getByRole('link', { name: 'View Trust & Security' })).toBeTruthy()
})

test('the compact status card keeps the state but drops the component list', () => {
  inIntl(
    <HubStatusCard
      compact
      hasIssue={false}
      headline="All systems operational"
      components={[{ id: 'api', name: 'API', degraded: false, statusLabel: 'Operational' }]}
    />
  )
  expect(screen.getByText('All systems operational')).toBeTruthy()
  expect(screen.queryByText('API')).toBeNull()
  expect(screen.queryByText('No maintenance scheduled.')).toBeNull()
})
