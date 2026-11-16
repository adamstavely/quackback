import { z } from 'zod'

/**
 * What admins write on the Trust & Security page (plans/v2/70-trust-security.md
 * §4). Limits match the database checks. Every list is ordered by the admin,
 * so new items go last and `reorderTrustItems` moves them.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null)

const id = z.string().uuid().optional()

export const CONTROL_STATUSES = ['in_place', 'in_progress', 'not_applicable'] as const
export type ControlStatus = (typeof CONTROL_STATUSES)[number]

export const DOCUMENT_ACCESS = ['open', 'restricted'] as const
export type DocumentAccess = (typeof DOCUMENT_ACCESS)[number]

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || /^https?:\/\//i.test(value), 'Enter a full http(s) address')
  .optional()
  .transform((value) => value || null)

export const complianceItemValuesSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(8),
  detail: optionalText(120),
  documentId: z.string().uuid().nullish(),
})

export const controlGroupValuesSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  description: optionalText(300),
})

export const controlValuesSchema = z.object({
  id,
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: optionalText(1000),
  status: z.enum(CONTROL_STATUSES),
})

export const subprocessorValuesSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(300),
  location: z.string().trim().min(1).max(120),
  dataCategories: optionalText(300),
  website: httpUrl,
})

export const documentGroupValuesSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
})

export const documentValuesSchema = z.object({
  id,
  groupId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: optionalText(500),
  access: z.enum(DOCUMENT_ACCESS),
  published: z.boolean(),
})

export const TRUST_ENTITIES = [
  'complianceItem',
  'controlGroup',
  'control',
  'subprocessor',
  'documentGroup',
  'document',
] as const
export type TrustEntity = (typeof TRUST_ENTITIES)[number]

/** One save shape for every list, told apart by `entity`. */
export const trustItemInputSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('complianceItem'), values: complianceItemValuesSchema }),
  z.object({ entity: z.literal('controlGroup'), values: controlGroupValuesSchema }),
  z.object({ entity: z.literal('control'), values: controlValuesSchema }),
  z.object({ entity: z.literal('subprocessor'), values: subprocessorValuesSchema }),
  z.object({ entity: z.literal('documentGroup'), values: documentGroupValuesSchema }),
  z.object({ entity: z.literal('document'), values: documentValuesSchema }),
])
export type TrustItemInput = z.input<typeof trustItemInputSchema>
export type TrustItem = z.output<typeof trustItemInputSchema>

export const trustItemRefSchema = z.object({
  entity: z.enum(TRUST_ENTITIES),
  id: z.string().uuid(),
})

/** The new order of one list: every id in it, top first. */
export const trustReorderSchema = z.object({
  entity: z.enum(TRUST_ENTITIES),
  ids: z.array(z.string().uuid()).min(1).max(500),
})

/** An update post (phase 4): plain text and an optional link, like a banner. */
export const trustUpdateValuesSchema = z.object({
  id,
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(2000),
  linkUrl: httpUrl,
  linkLabel: optionalText(60),
})
export type TrustUpdateValues = z.output<typeof trustUpdateValuesSchema>

/** Page settings (`fork_settings.trust`). */
export const trustConfigSchema = z.object({
  intro: z.string().trim().max(600).default(''),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .refine((value) => value === '' || /^[^\s@]+@[^\s@]+$/.test(value), 'Enter an email address')
    .default(''),
  policyUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || /^https?:\/\//i.test(value), 'Enter a full http(s) address')
    .default(''),
  policyLabel: z.string().trim().max(60).default(''),
  faqCategoryId: z.string().nullable().default(null),
  /** How long an approved request for a restricted document lasts (phase 3). */
  grantDays: z.number().int().min(1).max(365).default(30),
  /** Shown beside Controls as "Last reviewed"; null hides it. */
  controlsReviewedAt: z.string().datetime().nullable().default(null),
})
export type TrustConfig = z.output<typeof trustConfigSchema>
