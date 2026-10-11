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

function install(): void {
  if (!customElements.get(TAG)) customElements.define(TAG, QuackbackBannerElement)

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
