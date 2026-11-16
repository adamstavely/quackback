/**
 * Audit event types written by fork features. Upstream's `AuditEventType`
 * union includes this one (seam F-9), so fork events go through upstream's
 * audit log and its readers unchanged.
 */
export type ForkAuditEventType =
  | 'fork_announcement.created'
  | 'fork_announcement.updated'
  | 'fork_announcement.archived'
  | 'fork_announcement.deleted'
  | 'fork_announcement.config_updated'
  | 'fork_announcement.templates_updated'
  | 'fork_trust.created'
  | 'fork_trust.updated'
  | 'fork_trust.deleted'
  | 'fork_trust.reordered'
  | 'fork_trust.config_updated'
  | 'fork_trust.document_uploaded'
  | 'fork_trust.document_downloaded'
  | 'fork_trust.access_requested'
  | 'fork_trust.access_approved'
  | 'fork_trust.access_declined'
  | 'fork_trust.access_revoked'
  | 'fork_trust.update_published'
  | 'fork_trust.update_unpublished'
