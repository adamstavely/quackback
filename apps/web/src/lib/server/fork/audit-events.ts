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
