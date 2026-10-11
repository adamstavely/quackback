/**
 * The banner's own styles, applied inside its shadow root as a constructable
 * stylesheet. The embedding app cannot change how the banner looks:
 *
 *   - `:host` resets everything with `all: initial !important`. Inside a shadow
 *     root, `!important` on `:host` beats the page's rules for the element,
 *     including the page's own `!important` and a `style=""` attribute, so
 *     the page cannot restyle, hide or recolour it.
 *   - Every variable the banner uses is declared on `.qb-root`, an element the
 *     page cannot select, so values a page sets on the element are inherited
 *     but always overridden. The workspace theme (from everyone.json) is
 *     scoped to `.qb-root` too.
 *   - The font is always Inter, loaded from this Quackback instance under a
 *     private family name ('QuackbackInter') so it never collides with a font
 *     the app defines.
 *
 * Colours: the workspace's theme tokens (`--background`, `--foreground`,
 * `--destructive`, `--warning`, `--success`, `--radius`, `--ring`), and for
 * information and maintenance the same blue and violet as the portal
 * (Tailwind's blue/violet 600, and 400 in dark mode). The values below are
 * the platform defaults, used until the theme arrives.
 */
export const BASE_CSS = `
:host {
  all: initial !important;
  display: block !important;
  contain: content !important;
}
:host([hidden]) { display: none !important; }

.qb-root {
  all: initial;
  display: block;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --warning: oklch(0.52 0.125 55);
  --success: oklch(0.49 0.115 165.6);
  --radius: 0.625rem;
  --ring: oklch(0.708 0 0);
  --qb-info: oklch(54.6% 0.245 262.881);
  --qb-maintenance: oklch(54.1% 0.281 293.009);
  color: var(--foreground);
  font-family: 'QuackbackInter', 'Inter Variable', 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.qb-root.qb-dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --warning: oklch(0.78 0.14 75);
  --success: oklch(0.696 0.149 163);
  --ring: oklch(0.556 0 0);
  --qb-info: oklch(70.7% 0.165 254.624);
  --qb-maintenance: oklch(70.2% 0.183 293.541);
}
.qb-root *, .qb-root *::before, .qb-root *::after { box-sizing: border-box; }

.strip { display: flex; flex-direction: column; gap: 8px; padding: 8px 12px; }

.bar {
  --qb-kind: var(--qb-info);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid color-mix(in oklch, var(--qb-kind) 35%, transparent);
  border-radius: var(--radius);
  background: color-mix(in oklch, var(--qb-kind) 10%, var(--background));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
}
.qb-dark .bar { background: color-mix(in oklch, var(--qb-kind) 16%, var(--background)); }
.bar.kind-critical { --qb-kind: var(--destructive); }
.bar.kind-warning { --qb-kind: var(--warning); }
.bar.kind-success { --qb-kind: var(--success); }
.bar.kind-info { --qb-kind: var(--qb-info); }
.bar.kind-maintenance { --qb-kind: var(--qb-maintenance); }

.icon { flex: none; width: 20px; height: 20px; margin-top: 1px; color: var(--qb-kind); }

.content { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
@media (min-width: 640px) {
  .content { flex-direction: row; align-items: baseline; gap: 16px; }
  .text { flex: 1; }
}
.text { margin: 0; min-width: 0; }
.title { font-weight: 600; }

.link {
  flex: none;
  color: inherit;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
  border-radius: 2px;
}
.link:hover { text-decoration: none; }

button { font: inherit; color: inherit; cursor: pointer; }

.dismiss {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: -6px -8px -6px 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
}
.dismiss:hover { background: color-mix(in oklch, currentColor 10%, transparent); }
.dismiss svg { width: 16px; height: 16px; }

.more {
  align-self: flex-start;
  padding: 2px;
  border: 0;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
  opacity: 0.8;
}
.more:hover { opacity: 1; }

.link:focus-visible, .dismiss:focus-visible, .more:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`
