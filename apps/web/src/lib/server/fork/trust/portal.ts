import {
  forkTrustComplianceItems,
  forkTrustControlGroups,
  forkTrustControls,
  forkTrustSubprocessors,
} from '@/lib/server/fork/db'
import { asc, db } from '@/lib/server/db'
import type { Actor } from '@/lib/server/policy/types'
import { DEFAULT_LOCALE } from '@/lib/shared/i18n'
import { hcArticlePath } from '@/lib/shared/help-center-url'
import type { ControlStatus } from '@/lib/shared/fork/trust/schema'
import type { TrustPageContent } from '@/lib/shared/fork/trust/portal'
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
