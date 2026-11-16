import type { PrincipalId } from '@quackback/ids'
import {
  forkTrustComplianceItems,
  forkTrustControlGroups,
  forkTrustControls,
  forkTrustDocumentGroups,
  forkTrustDocuments,
  forkTrustSubprocessors,
} from '@/lib/server/fork/db'
import { and, asc, db, eq, isNotNull } from '@/lib/server/db'
import type { Actor } from '@/lib/server/policy/types'
import { DEFAULT_LOCALE } from '@/lib/shared/i18n'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { hcArticlePath } from '@/lib/shared/help-center-url'
import type { ControlStatus } from '@/lib/shared/fork/trust/schema'
import type {
  TrustPageContent,
  TrustPageDocumentAction,
  TrustPageDocumentGroup,
} from '@/lib/shared/fork/trust/portal'
import { accessForViewer } from './access.service'
import { isSubscribed, listPublishedUpdates } from './updates.service'
import { trustConfig } from './settings'

/**
 * The portal page's content for a signed-in viewer (the caller has already
 * checked the feature flag, the session and portal access). The FAQ is a Help
 * Center category, read with upstream's own visibility rules for this viewer.
 */
export async function buildTrustPageContent(viewer: Actor): Promise<TrustPageContent> {
  const [config, compliance, groups, controls, subprocessors] = await Promise.all([
    trustConfig.read(),
    db.select().from(forkTrustComplianceItems).orderBy(asc(forkTrustComplianceItems.position)),
    db.select().from(forkTrustControlGroups).orderBy(asc(forkTrustControlGroups.position)),
    db.select().from(forkTrustControls).orderBy(asc(forkTrustControls.position)),
    db.select().from(forkTrustSubprocessors).orderBy(asc(forkTrustSubprocessors.position)),
  ])

  return {
    intro: config.intro,
    contactEmail: config.contactEmail,
    policyUrl: config.policyUrl,
    policyLabel: config.policyLabel,
    controlsReviewedAt: config.controlsReviewedAt,
    complianceItems: compliance.map((c) => ({
      id: c.id,
      name: c.name,
      label: c.label,
      detail: c.detail,
    })),
    controlGroups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      controls: controls
        .filter((c) => c.groupId === g.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          status: c.status as ControlStatus,
          checkedAt: c.source === 'integration' ? (c.lastCheckedAt?.toISOString() ?? null) : null,
        })),
    })),
    subprocessors: subprocessors.map((s) => ({
      id: s.id,
      name: s.name,
      purpose: s.purpose,
      location: s.location,
      dataCategories: s.dataCategories,
      website: s.website,
    })),
    faq: config.faqCategoryId ? await faqArticles(config.faqCategoryId, viewer) : [],
    documentGroups: await documentGroups(
      viewer.principalId ?? null,
      viewer.permissions?.has(PERMISSIONS.TRUST_MANAGE) ?? false
    ),
    updates: await listPublishedUpdates(),
    subscribed: viewer.principalId ? await isSubscribed(viewer.principalId) : false,
  }
}

async function faqArticles(categoryId: string, viewer: Actor) {
  const { listPublicArticlesForCategory } =
    await import('@/lib/server/domains/help-center/help-center.article.query')
  try {
    const articles = await listPublicArticlesForCategory(categoryId, viewer)
    return articles.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      href: hcArticlePath({ locale: DEFAULT_LOCALE, urlId: a.urlId, slug: a.slug }),
    }))
  } catch {
    // A deleted or hidden category shows no FAQ rather than breaking the page.
    return []
  }
}

/** Published documents that have a file, grouped, with what this viewer can do. */
/** `staff` (trust.manage) may always download, as the download route allows. */
async function documentGroups(
  principalId: PrincipalId | null,
  staff: boolean
): Promise<TrustPageDocumentGroup[]> {
  const [groups, docs] = await Promise.all([
    db.select().from(forkTrustDocumentGroups).orderBy(asc(forkTrustDocumentGroups.position)),
    db
      .select()
      .from(forkTrustDocuments)
      .where(and(eq(forkTrustDocuments.published, true), isNotNull(forkTrustDocuments.storageKey)))
      .orderBy(asc(forkTrustDocuments.position)),
  ])
  const restrictedIds = docs.filter((d) => d.access === 'restricted').map((d) => d.id)
  const access = principalId ? await accessForViewer(principalId, restrictedIds) : new Map()
  const actionFor = (doc: (typeof docs)[number]): TrustPageDocumentAction => {
    if (doc.access === 'open' || staff) return { kind: 'download', expiresAt: null }
    const state = access.get(doc.id)
    if (state?.state === 'granted') return { kind: 'download', expiresAt: state.expiresAt }
    if (state?.state === 'pending') return { kind: 'pending' }
    if (state?.state === 'declined') return { kind: 'declined' }
    return { kind: 'request' }
  }
  return groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      documents: docs
        .filter((d) => d.groupId === g.id)
        .map((d) => ({
          id: d.id,
          title: d.title,
          description: d.description,
          restricted: d.access === 'restricted',
          fileName: d.fileName ?? 'document',
          action: actionFor(d),
        })),
    }))
    .filter((g) => g.documents.length > 0)
}

/** Counts for the hub card: controls in place of those that apply, and published documents. */
export async function buildTrustHubSummary() {
  const [config, controls, docs] = await Promise.all([
    trustConfig.read(),
    db.select({ status: forkTrustControls.status }).from(forkTrustControls),
    db
      .select({ id: forkTrustDocuments.id })
      .from(forkTrustDocuments)
      .where(and(eq(forkTrustDocuments.published, true), isNotNull(forkTrustDocuments.storageKey))),
  ])
  const applicable = controls.filter((c) => c.status !== 'not_applicable')
  return {
    controlsInPlace: applicable.filter((c) => c.status === 'in_place').length,
    controlsTotal: applicable.length,
    documents: docs.length,
    reviewedAt: config.controlsReviewedAt,
  }
}
