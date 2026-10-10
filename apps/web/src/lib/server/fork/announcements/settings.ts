import { z } from 'zod'
import {
  announcementsConfigSchema,
  announcementTemplatesSchema,
  type AnnouncementTemplate,
} from '@/lib/shared/fork/announcements/schema'
import { defineForkSetting } from '@/lib/server/fork/settings/fork-settings'

/** `fork_settings.announcements`: embed, status fold-in and lead time. */
export const announcementsConfig = defineForkSetting('announcements', announcementsConfigSchema)

/** `fork_settings.announcement_templates`; `items: null` until an admin saves their own. */
export const announcementTemplatesSetting = defineForkSetting(
  'announcement_templates',
  z.object({ items: announcementTemplatesSchema.nullable().default(null) })
)

/** Offered until the workspace saves its own list (§4.2). */
export const STARTER_TEMPLATES: AnnouncementTemplate[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Scheduled maintenance',
    kind: 'maintenance',
    title: 'Scheduled maintenance {date} {time}',
    body: 'Some features may be unavailable while we work. We will update this banner when it is done.',
    linkUrl: null,
    linkLabel: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Investigating an issue',
    kind: 'critical',
    title: 'Investigating: {service}',
    body: 'We are looking into reports of problems with {service}. Updates to follow.',
    linkUrl: null,
    linkLabel: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Issue resolved',
    kind: 'success',
    title: 'Resolved: {service}',
    body: '{service} is working normally again. Thank you for your patience.',
    linkUrl: null,
    linkLabel: null,
  },
]
