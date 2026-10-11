import { config } from '@/lib/server/config'
import {
  getPortalConfig,
  getWorkspaceSettings,
} from '@/lib/server/domains/settings/settings.service'
import { readForkFeatures } from '@/lib/server/fork/settings/features'
import { generateWorkspaceThemeCSS } from '@/lib/shared/theme'
import type { BannerFeed, BannerItem } from '@/lib/shared/fork/announcements/types'
import { buildBannerFeed } from './feed'
import { announcementsConfig } from './settings'

/** What `everyone.json` returns: the feed plus the app's theme for the banner's shadow root. */
export interface EmbedFeed extends BannerFeed {
  theme: {
    /** The workspace's theme variables, scoped to `:host` / `:host(.qb-dark)`. */
    css: string
    /** `user` follows the host page's colour-scheme preference. */
    mode: 'light' | 'dark' | 'user'
  } | null
}

const EMBED_OFF: EmbedFeed = {
  enabled: false,
  epoch: null,
  revision: 0,
  nextTransitionAt: null,
  items: [],
  theme: null,
}

/**
 * Whether the embed serves anything (§4.7): announcements on, "Embedded apps"
 * on, and a public portal. A private portal returns nothing rather than
 * re-implementing its access rules for requests that carry no session.
 */
export async function isEmbedAvailable(): Promise<boolean> {
  if (!(await readForkFeatures()).announcements) return false
  const [settings, portal] = await Promise.all([announcementsConfig.read(), getPortalConfig()])
  return settings.embedEnabled && portal.access?.visibility !== 'private'
}

/**
 * The identity-free embed feed: audience "Everyone" banners for the embed
 * surface, plus public status items, with the theme the banner draws in.
 * Identical for every caller, so it is safe to cache.
 */
export async function buildEveryoneEmbedFeed(): Promise<EmbedFeed> {
  if (!(await isEmbedAvailable())) return EMBED_OFF
  const [feed, settings] = await Promise.all([
    buildBannerFeed({ kind: 'everyone' }, 'embed'),
    getWorkspaceSettings(),
  ])
  if (!feed.enabled) return EMBED_OFF
  const branding = settings?.brandingConfig ?? {}
  return {
    ...feed,
    items: feed.items.map(absoluteLinks),
    theme: {
      css: scopeThemeToShadowRoot(generateWorkspaceThemeCSS(branding)),
      mode: branding.themeMode ?? 'user',
    },
  }
}

/** A banner on another app must link back to this instance, not to a path on that app. */
function absoluteLinks(item: BannerItem): BannerItem {
  if (!item.link || /^https?:\/\//i.test(item.link.url)) return item
  return { ...item, link: { ...item.link, url: new URL(item.link.url, config.baseUrl).toString() } }
}

/**
 * The portal's theme CSS, rewritten so its variables apply only inside the
 * banner's shadow root: `:root` becomes `:host`, `.dark` becomes
 * `:host(.qb-dark)`. Page-level rules (`body`, `html body`) are dropped; they
 * would never match in a shadow root, and the host page's own styles are not
 * ours to touch.
 */
export function scopeThemeToShadowRoot(css: string): string {
  return css
    .split(/(?<=\})\s*/)
    .map((block) => block.trim())
    .filter((block) => block.startsWith(':root') || block.startsWith('.dark'))
    .map((block) =>
      block.startsWith(':root')
        ? block.replace(/^:root/, ':host')
        : block.replace(/^\.dark/, ':host(.qb-dark)')
    )
    .join('\n')
}
