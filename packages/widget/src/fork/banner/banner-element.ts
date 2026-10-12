import { ICONS, type IconPath } from './icons'
import { KIND_PRESETS, type BannerKind } from './presets'
import { BASE_CSS } from './styles'
import { formatWindow, isNewer } from './helpers'

/** One banner, as everyone.json returns it. */
export interface BannerItem {
  id: string
  source: 'announcement' | 'status'
  kind: BannerKind
  title: string
  body: string | null
  link: { url: string; label: string } | null
  priority: number
  publishAt: string
  expiresAt: string | null
  updatedAt: string
  window?: { start: string; end: string | null } | null
}

export interface EmbedFeed {
  enabled: boolean
  epoch: string | null
  revision: number
  nextTransitionAt: string | null
  items: BannerItem[]
  theme: { css: string; mode: 'light' | 'dark' | 'user' } | null
}

const DISMISSED_KEY = 'qb.banner.dismissed'
const MAX_JITTER_MS = 2000
const POLL_MS = 60_000
const SAFETY_REFRESH_MS = 5 * 60_000
const SVG_NS = 'http://www.w3.org/2000/svg'

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeDismissed(next: Record<string, string>): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: the dismissal lasts for this page view.
  }
}

function icon(paths: IconPath[], className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('class', className)
  for (const p of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', p.d)
    if (p.evenodd) {
      path.setAttribute('fill-rule', 'evenodd')
      path.setAttribute('clip-rule', 'evenodd')
    }
    svg.appendChild(path)
  }
  return svg
}

/**
 * `<quackback-banner>`: this workspace's announcement banners on an internal
 * app (plans/v2/60 §4.7). It renders in a shadow root with the app's
 * Quackback theme, updates within seconds of a change while the tab is
 * visible, and remembers dismissals in this browser.
 */
export class QuackbackBannerElement extends HTMLElement {
  private readonly root: ShadowRoot
  /** Everything renders inside this; the theme variables and the dark class live on it. */
  private readonly qbRoot: HTMLDivElement
  private readonly themeSheet: CSSStyleSheet | null
  private feed: EmbedFeed | null = null
  private dismissed: Record<string, string> = {}
  private expanded = false
  private rendered = ''
  private source: EventSource | null = null
  private timers: number[] = []
  private poll: number | undefined
  private dark: MediaQueryList | null = null

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
    const supportsSheets =
      'adoptedStyleSheets' in Document.prototype && 'replaceSync' in CSSStyleSheet.prototype
    if (supportsSheets) {
      const base = new CSSStyleSheet()
      base.replaceSync(BASE_CSS)
      this.themeSheet = new CSSStyleSheet()
      this.root.adoptedStyleSheets = [base, this.themeSheet]
    } else {
      // Older engines: one <style> in the shadow root (a stylesheet, not an inline style attribute).
      const style = document.createElement('style')
      style.textContent = BASE_CSS
      this.root.appendChild(style)
      this.themeSheet = null
    }
    this.qbRoot = document.createElement('div')
    this.qbRoot.className = 'qb-root'
    this.root.appendChild(this.qbRoot)
  }

  private get baseUrl(): string | null {
    return (window as { __QUACKBACK_BANNER__?: { url?: string } }).__QUACKBACK_BANNER__?.url ?? null
  }

  connectedCallback(): void {
    if (!this.baseUrl) return
    document.addEventListener('visibilitychange', this.onVisibility)
    void this.refresh()
    this.openStream()
    this.timers.push(
      window.setInterval(() => {
        if (document.visibilityState === 'visible') void this.refresh()
      }, SAFETY_REFRESH_MS)
    )
  }

  disconnectedCallback(): void {
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.dark?.removeEventListener('change', this.onColorScheme)
    this.closeStream()
    for (const t of this.timers) window.clearTimeout(t)
    this.timers = []
    window.clearInterval(this.poll)
  }

  /**
   * Fetch the feed and show it, unless it is older than what is on screen.
   *
   * everyone.json is cacheable, so the URL names the newest state the banner
   * knows of: the revision a stream frame announced, or the instant a banner
   * starts or ends. A newer state is a new URL, so the browser can never answer
   * it with a cached body from before the change.
   */
  async refresh(target?: { epoch: string; revision: number } | { at: string }): Promise<void> {
    const base = this.baseUrl
    if (!base) return
    const params = new URLSearchParams()
    const known = target && 'revision' in target ? target : this.feed
    if (known) params.set('rev', `${known.epoch}:${known.revision}`)
    if (target && 'at' in target) params.set('t', target.at)
    const query = params.toString() ? `?${params.toString()}` : ''
    try {
      const response = await fetch(`${base}/api/fork-announcements/embed/everyone.json${query}`, {
        credentials: 'omit',
      })
      if (!response.ok) return
      const next = (await response.json()) as EmbedFeed
      if (this.feed && !isNewer(next, this.feed) && next.revision < this.feed.revision) return
      this.feed = next
      this.applyTheme()
      this.scheduleTransition()
      this.render()
      if (!next.enabled) this.closeStream()
      else this.openStream()
    } catch {
      // Network trouble: keep what is shown; the stream or the next refresh tries again.
    }
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      void this.refresh()
      this.openStream()
    } else {
      this.closeStream()
    }
  }

  private openStream(): void {
    const base = this.baseUrl
    if (!base || this.source || document.visibilityState !== 'visible') return
    if (this.feed && !this.feed.enabled) return
    if (!('EventSource' in window)) return
    const source = new EventSource(`${base}/api/fork-announcements/stream`)
    this.source = source
    source.addEventListener('revision', (event) => {
      try {
        const frame = JSON.parse((event as MessageEvent<string>).data) as {
          epoch: string
          rev: number
        }
        const target = { epoch: frame.epoch, revision: frame.rev }
        if (isNewer(target, this.feed)) {
          // Spread refetches out so a broadcast does not reach the database all at once.
          this.timers.push(
            window.setTimeout(() => void this.refresh(target), Math.random() * MAX_JITTER_MS)
          )
        }
      } catch {
        /* ignore a malformed frame */
      }
    })
    source.addEventListener('open', () => {
      window.clearInterval(this.poll)
      this.poll = undefined
    })
    source.addEventListener('error', () => {
      // A refused stream (its limit reached, or embeds off) is closed for good: poll instead.
      if (source.readyState === EventSource.CLOSED) {
        this.source = null
        if (this.poll === undefined)
          this.poll = window.setInterval(() => void this.refresh(), POLL_MS)
      }
    })
  }

  private closeStream(): void {
    this.source?.close()
    this.source = null
  }

  private scheduleTransition(): void {
    const at = this.feed?.nextTransitionAt
    if (!at) return
    const delay = Math.max(0, Date.parse(at) - Date.now()) + Math.random() * 5000
    this.timers.push(
      window.setTimeout(() => void this.refresh({ at }), Math.min(delay, 2 ** 31 - 1))
    )
  }

  private applyTheme(): void {
    const theme = this.feed?.theme
    if (!theme) return
    this.themeSheet?.replaceSync(theme.css)
    this.dark?.removeEventListener('change', this.onColorScheme)
    this.dark = null
    if (theme.mode === 'user' && window.matchMedia) {
      this.dark = window.matchMedia('(prefers-color-scheme: dark)')
      this.dark.addEventListener('change', this.onColorScheme)
    }
    this.onColorScheme()
  }

  /**
   * Light or dark, from the workspace theme; "user" follows the visitor's
   * colour-scheme preference. The embedding app has no say in it.
   */
  private onColorScheme = (): void => {
    const mode = this.feed?.theme?.mode
    const dark = mode === 'dark' || (mode === 'user' && !!this.dark?.matches)
    this.qbRoot.classList.toggle('qb-dark', dark)
  }

  private visibleItems(): BannerItem[] {
    if (!this.feed?.enabled) return []
    const dismissed = { ...readDismissed(), ...this.dismissed }
    const now = Date.now()
    return this.feed.items.filter(
      (item) =>
        dismissed[item.id] !== item.updatedAt &&
        (item.expiresAt === null || Date.parse(item.expiresAt) > now)
    )
  }

  private dismiss(item: BannerItem): void {
    this.dismissed[item.id] = item.updatedAt
    writeDismissed({ ...readDismissed(), ...this.dismissed })
    this.render()
  }

  /** Re-renders only when what is shown changes, so assistive tech is not re-announced. */
  private render(): void {
    const items = this.visibleItems()
    const shown = this.expanded ? items : items.slice(0, 1)
    const signature = JSON.stringify([shown, items.length, this.expanded])
    if (signature === this.rendered) return
    this.rendered = signature

    const focused = this.root.activeElement as HTMLElement | null
    const focusedId = focused?.closest<HTMLElement>('[data-banner-id]')?.dataset.bannerId
    const focusedClass = focused?.className
    this.qbRoot.replaceChildren()
    this.hidden = items.length === 0 && !focused
    if (items.length === 0) {
      if (focused) {
        const empty = document.createElement('p')
        empty.textContent = 'No more announcements.'
        empty.tabIndex = -1
        empty.setAttribute('role', 'status')
        empty.className = 'strip'
        // Only a focus destination: once focus moves on, nothing is left to show.
        empty.addEventListener('blur', () => {
          if (this.visibleItems().length > 0) return
          empty.remove()
          this.hidden = true
        })
        this.qbRoot.appendChild(empty)
        empty.focus()
      }
      return
    }

    const strip = document.createElement('section')
    strip.className = 'strip'
    strip.setAttribute('aria-label', 'Announcements')
    for (const item of shown) strip.appendChild(this.renderItem(item))

    const rest = items.length - 1
    if (rest > 0) {
      const more = document.createElement('button')
      more.type = 'button'
      more.className = 'more'
      more.setAttribute('aria-expanded', String(this.expanded))
      more.textContent = this.expanded
        ? 'Show fewer'
        : `${rest} more announcement${rest === 1 ? '' : 's'}`
      more.addEventListener('click', () => {
        this.expanded = !this.expanded
        this.render()
        ;(this.qbRoot.querySelector('.more') as HTMLButtonElement | null)?.focus()
      })
      strip.appendChild(more)
    }
    this.qbRoot.appendChild(strip)
    if (focused) {
      const matchingBar = Array.from(strip.querySelectorAll<HTMLElement>('[data-banner-id]')).find(
        (bar) => bar.dataset.bannerId === focusedId
      )
      const selector =
        focusedClass === 'link' ? '.link' : focusedClass === 'more' ? '.more' : '.dismiss'
      const replacement =
        (focusedClass === 'more' ? strip : matchingBar)?.querySelector<HTMLElement>(selector) ??
        strip.querySelector<HTMLElement>('.dismiss, .more')
      replacement?.focus()
    }
  }

  private renderItem(item: BannerItem): HTMLElement {
    const preset = KIND_PRESETS[item.kind] ?? KIND_PRESETS.info
    const bar = document.createElement('div')
    bar.className = `bar kind-${item.kind}`
    bar.dataset.bannerId = item.id
    bar.setAttribute('role', preset.role)
    bar.appendChild(icon(ICONS[item.kind] ?? ICONS.info, 'icon'))

    const content = document.createElement('div')
    content.className = 'content'
    const text = document.createElement('p')
    text.className = 'text'
    // The kind in words, so it never rests on colour or icon alone (SC 1.4.1).
    const kind = document.createElement('span')
    kind.className = 'sr-only'
    kind.textContent = `${preset.label}: `
    const title = document.createElement('span')
    title.className = 'title'
    title.textContent = item.title
    text.append(kind, title)
    if (item.window) text.append(` ${formatWindow(item.window)}`)
    if (item.body) text.append(` ${item.body}`)
    content.appendChild(text)

    if (item.link && /^https?:\/\//i.test(item.link.url)) {
      const link = document.createElement('a')
      link.className = 'link'
      link.href = item.link.url
      link.rel = 'noopener noreferrer'
      link.textContent = item.link.label
      content.appendChild(link)
    }
    bar.appendChild(content)

    const dismiss = document.createElement('button')
    dismiss.type = 'button'
    dismiss.className = 'dismiss'
    dismiss.setAttribute('aria-label', `Dismiss: ${item.title}`)
    dismiss.appendChild(icon(ICONS.close, ''))
    dismiss.addEventListener('click', () => this.dismiss(item))
    bar.appendChild(dismiss)
    return bar
  }
}
