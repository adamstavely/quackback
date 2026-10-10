import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { PERMISSIONS } from '@/lib/shared/permissions'
import {
  announcementInputSchema,
  announcementsConfigSchema,
  announcementTemplatesSchema,
} from '@/lib/shared/fork/announcements/schema'
import { actorFromAuth } from '@/lib/server/audit/log'
import {
  archiveAnnouncement,
  deleteDraftAnnouncement,
  getAnnouncementsConfig,
  getAnnouncementsEnabled,
  listAnnouncements,
  listAnnouncementTemplates,
  saveAnnouncementTemplates,
  setAnnouncementsEnabled,
  updateAnnouncementsConfig,
  upsertAnnouncement,
  type AnnouncementWriter,
} from '@/lib/server/fork/announcements/announcements.service'
import { requireAuth, type AuthContext } from '../auth-helpers'

/**
 * Admin server functions for announcement banners (§4.9). Reads need
 * `announcement.view`, writes `announcement.manage`; turning the feature on or
 * off for the workspace is a workspace setting (`settings.manage`).
 */

function writerFrom(auth: AuthContext): AnnouncementWriter {
  return {
    principalId: auth.principal.id,
    audit: actorFromAuth(auth),
    headers: getRequestHeaders(),
  }
}

/** Everything the admin page shows, in one read. */
export const getAnnouncementsAdminFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth({ permission: PERMISSIONS.ANNOUNCEMENT_VIEW })
  const [enabled, config, announcements, templates] = await Promise.all([
    getAnnouncementsEnabled(),
    getAnnouncementsConfig(),
    listAnnouncements(),
    listAnnouncementTemplates(),
  ])
  return { enabled, config, announcements, templates }
})

export const upsertAnnouncementFn = createServerFn({ method: 'POST' })
  .validator(announcementInputSchema)
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.ANNOUNCEMENT_MANAGE })
    return upsertAnnouncement(writerFrom(auth), data)
  })

const idSchema = z.object({ id: z.string().uuid() })

export const archiveAnnouncementFn = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.ANNOUNCEMENT_MANAGE })
    return archiveAnnouncement(writerFrom(auth), data.id)
  })

export const deleteDraftAnnouncementFn = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.ANNOUNCEMENT_MANAGE })
    await deleteDraftAnnouncement(writerFrom(auth), data.id)
  })

export const updateAnnouncementsConfigFn = createServerFn({ method: 'POST' })
  .validator(announcementsConfigSchema)
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.ANNOUNCEMENT_MANAGE })
    return updateAnnouncementsConfig(writerFrom(auth), data)
  })

export const saveAnnouncementTemplatesFn = createServerFn({ method: 'POST' })
  .validator(z.object({ items: announcementTemplatesSchema }))
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.ANNOUNCEMENT_MANAGE })
    return saveAnnouncementTemplates(writerFrom(auth), data.items)
  })

export const setAnnouncementsEnabledFn = createServerFn({ method: 'POST' })
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.SETTINGS_MANAGE })
    return setAnnouncementsEnabled(writerFrom(auth), data.enabled)
  })
