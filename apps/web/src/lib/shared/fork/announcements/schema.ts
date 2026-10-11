import { z } from 'zod'
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_SURFACES, AUDIENCE_TIERS } from './types'

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value) && URL.canParse(value), {
    message: 'Enter a link that starts with http:// or https://',
  })

const isoDate = z.string().datetime({ offset: true })

/** What the editor submits. `status` is draft or published; archive is its own action. */
export const announcementInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(ANNOUNCEMENT_KINDS),
    title: z.string().trim().min(1, 'Add a title').max(140),
    body: z.string().trim().max(500).nullable().default(null),
    linkUrl: httpUrl.nullable().default(null),
    linkLabel: z.string().trim().max(60).nullable().default(null),
    status: z.enum(['draft', 'published']),
    /** Absent means "now". */
    publishAt: isoDate.nullable().default(null),
    expiresAt: isoDate.nullable().default(null),
    priority: z.number().int().min(-100).max(100).default(0),
    surfaces: z
      .array(z.enum(ANNOUNCEMENT_SURFACES))
      .min(1, 'Choose where it shows')
      .default(['portal']),
    audience: z
      .object({
        tier: z.enum(AUDIENCE_TIERS),
        segmentIds: z.array(z.string().min(1)).max(50).default([]),
      })
      .default({ tier: 'authenticated', segmentIds: [] }),
  })
  .refine((a) => a.audience.tier !== 'segments' || a.audience.segmentIds.length > 0, {
    path: ['audience', 'segmentIds'],
    message: 'Choose at least one segment',
  })
  .refine((a) => !a.linkLabel || a.linkUrl, {
    path: ['linkUrl'],
    message: 'Add the link this label points to',
  })
  .refine(
    (a) =>
      a.expiresAt === null ||
      Date.parse(a.expiresAt) > (a.publishAt === null ? Date.now() : Date.parse(a.publishAt)),
    { path: ['expiresAt'], message: 'End the banner after it starts' }
  )

export type AnnouncementInput = z.input<typeof announcementInputSchema>
export type AnnouncementValues = z.output<typeof announcementInputSchema>

/** Workspace settings for announcements (`fork_settings.announcements`). */
export const announcementsConfigSchema = z.object({
  /** Serve banners to apps that embed them. Off until an admin turns it on. */
  embedEnabled: z.boolean().default(false),
  /** Show live status incidents and maintenance in the same banner strip. */
  foldInStatus: z.boolean().default(true),
  /** How long before scheduled maintenance its banner appears. */
  statusLeadHours: z.number().int().min(1).max(168).default(24),
})

export type AnnouncementsConfig = z.output<typeof announcementsConfigSchema>

export const announcementTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(ANNOUNCEMENT_KINDS),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().max(500).nullable().default(null),
  linkUrl: z.string().trim().max(2048).nullable().default(null),
  linkLabel: z.string().trim().max(60).nullable().default(null),
})

export type AnnouncementTemplate = z.output<typeof announcementTemplateSchema>

export const announcementTemplatesSchema = z.array(announcementTemplateSchema).max(50)
