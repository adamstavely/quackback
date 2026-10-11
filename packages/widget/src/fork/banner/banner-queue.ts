import { QuackbackBannerElement } from './banner-element'

/**
 * The script internal apps load from /api/fork-announcements/banner.js.
 *
 * It registers `<quackback-banner>`. Put the element where the banners should
 * appear; if the page has none when it finishes loading, one is added at the
 * top of <body>, so the script tag alone is a complete install.
 *
 * `window.QuackbackBanner('refresh')` refetches on demand. Identity
 * ('identify' / 'logout', for segment-targeted banners) arrives in a later
 * release and is a no-op until then.
 */
const TAG = 'quackback-banner'

type Command = 'refresh' | 'identify' | 'logout'

function run(command: Command): void {
  if (command === 'refresh') {
    for (const el of document.querySelectorAll(TAG)) void (el as QuackbackBannerElement).refresh()
  }
}

/**
 * Banners always render in Inter, served by this Quackback instance. It is
 * registered on the document (fonts declared inside a shadow root are not
 * reliably usable) under a private family name, so it never replaces a font
 * the app itself defines.
 */
function loadInter(base: string): void {
  if (!('fonts' in document) || typeof FontFace === 'undefined') return
  const face = new FontFace(
    'QuackbackInter',
    `url(${base}/api/fork-announcements/embed/inter.woff2) format('woff2')`,
    {
      weight: '100 900',
      style: 'normal',
      display: 'swap',
    }
  )
  document.fonts.add(face)
  face.load().catch(() => {
    // Unavailable (blocked by CSP, offline): the system fallback in the stack is used.
  })
}

function install(): void {
  if (!customElements.get(TAG)) customElements.define(TAG, QuackbackBannerElement)
  const base = (window as { __QUACKBACK_BANNER__?: { url?: string } }).__QUACKBACK_BANNER__?.url
  if (base) loadInter(base)

  const api = window as unknown as {
    QuackbackBanner?: ((command: Command) => void) & { q?: Command[][] }
  }
  const queued = api.QuackbackBanner?.q ?? []
  api.QuackbackBanner = (command: Command) => run(command)
  for (const [command] of queued) if (command) run(command)

  const mount = () => {
    if (!document.querySelector(TAG)) document.body.prepend(document.createElement(TAG))
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
  else mount()
}

install()
