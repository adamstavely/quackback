import type { ControlStatus, DocumentAccess, TrustConfig } from './schema'

/** The admin side of the Trust & Security page, as the server returns it. */

interface Ordered {
  id: string
  position: number
  updatedAt: string
}

export interface TrustComplianceItem extends Ordered {
  name: string
  label: string
  detail: string | null
  documentId: string | null
}

export interface TrustControlGroup extends Ordered {
  name: string
  description: string | null
}

export interface TrustControl extends Ordered {
  groupId: string
  name: string
  description: string | null
  status: ControlStatus
  source: 'manual' | 'integration'
  lastCheckedAt: string | null
}

export interface TrustSubprocessor extends Ordered {
  name: string
  purpose: string
  location: string
  dataCategories: string | null
  website: string | null
}

export interface TrustDocumentGroup extends Ordered {
  name: string
}

export interface TrustDocument extends Ordered {
  groupId: string
  title: string
  description: string | null
  access: DocumentAccess
  published: boolean
  fileName: string | null
}

export interface TrustAdminData {
  enabled: boolean
  config: TrustConfig
  complianceItems: TrustComplianceItem[]
  controlGroups: TrustControlGroup[]
  controls: TrustControl[]
  subprocessors: TrustSubprocessor[]
  documentGroups: TrustDocumentGroup[]
  documents: TrustDocument[]
  /** Help Center categories the FAQ can come from. */
  helpCenterCategories: { id: string; name: string }[]
}

/** What one viewer may do with a restricted document (phase 3). */
export type TrustDocumentAccess =
  | { state: 'granted'; expiresAt: string | null }
  | { state: 'pending' }
  | { state: 'declined' }

export interface TrustAccessRequest {
  id: string
  documentId: string
  documentTitle: string
  requesterName: string
  requesterEmail: string | null
  /** `expired` is an approval whose time has run out. */
  state: 'pending' | 'approved' | 'declined' | 'revoked' | 'expired'
  reason: string | null
  decisionNote: string | null
  ticketId: string | null
  createdAt: string
  decidedAt: string | null
  expiresAt: string | null
}
