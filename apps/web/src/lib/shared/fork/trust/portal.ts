import type { ControlStatus } from './schema'

/**
 * What the portal's Trust & Security page shows (plans/v2/70-trust-security.md
 * §1). Only public fields: no audit columns, no storage keys, no drafts.
 */
export interface TrustPageControl {
  id: string
  name: string
  description: string | null
  status: ControlStatus
}

export interface TrustPageControlGroup {
  id: string
  name: string
  description: string | null
  controls: TrustPageControl[]
}

export interface TrustPageContent {
  intro: string
  contactEmail: string
  policyUrl: string
  policyLabel: string
  controlsReviewedAt: string | null
  complianceItems: { id: string; name: string; label: string; detail: string | null }[]
  controlGroups: TrustPageControlGroup[]
  subprocessors: {
    id: string
    name: string
    purpose: string
    location: string
    dataCategories: string | null
    website: string | null
  }[]
  faq: { id: string; title: string; description: string | null; href: string }[]
}

/**
 * `off`: the page is turned off (the route answers 404).
 * `signed_out`: the viewer must sign in first (D-TS2).
 */
export type TrustPage =
  { status: 'off' } | { status: 'signed_out' } | { status: 'ok'; content: TrustPageContent }
