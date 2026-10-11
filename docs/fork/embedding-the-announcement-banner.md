# Embedding the announcement banner in an internal app

Quackback announcements can appear inside your own internal apps, not only in
the Quackback portal. Admins publish a banner once, in **Announcements**, and
every app that embeds the banner shows it, in the same Quackback look, and
updates within a few seconds when it changes.

The steps below are also in the admin, under **Announcements → Install on an
app**, with your instance's address filled in.

## Before you start (admins)

1. **Announcements** are turned on (Announcements → Settings).
2. **Embedded apps** is turned on (Announcements → Settings → Embedded apps).
3. The portal is **public** (the intranet default). A private portal serves no
   banners to embeds.
4. Banners only appear in apps if their **Show it in** includes **Apps that embed
   the banner**, and their audience is **Everyone**. Segment-targeted banners
   stay in the portal for now.

Status-page incidents and maintenance appear too, when **Status incidents** is
on and the status page is public.

## Install (app teams)

Add one script tag. Replace the address with your Quackback instance.

```html
<script src="https://quackback.example.internal/api/fork-announcements/banner.js" defer></script>
```

That is a complete install: banners appear at the top of the page.

### Choose where banners go

Put a `<quackback-banner>` element where you want them. If the page has one, the
script uses it instead of adding its own.

```html
<quackback-banner></quackback-banner>
<script src="https://quackback.example.internal/api/fork-announcements/banner.js" defer></script>
```

### Match your app's light or dark look

By default the banner follows the Quackback workspace theme and, when that
follows the visitor, their system setting. Pin it to your app's look:

```html
<quackback-banner theme="light"></quackback-banner>
```

`theme="dark"` works the same way.

### Refresh on demand

```js
window.QuackbackBanner('refresh')
```

You rarely need this: the banner refreshes on its own.

## Content Security Policy

If your app sets a CSP, allow your Quackback instance:

```
script-src https://quackback.example.internal;
connect-src https://quackback.example.internal;
```

The banner adds its styles through constructable stylesheets inside its own
shadow root, so it needs no `style-src 'unsafe-inline'`. It loads no fonts,
images or scripts from anywhere else.

## Network and SSO

The banner's requests to Quackback carry **no cookies**: the script, the banner
list and the live-update stream are all anonymous. If an SSO proxy sits in
front of Quackback, it must let these paths through from your internal apps:

- `/api/fork-announcements/banner.js`
- `/api/fork-announcements/embed/everyone.json`
- `/api/fork-announcements/stream`

Everything stays inside the intranet; nothing is loaded from the internet.

## What users see

- The most important banner first (incident, maintenance, warning,
  information, resolved), with "N more announcements" to show the rest.
- Each banner can be dismissed. It stays hidden in that browser until an admin
  edits it.
- Maintenance shows its window in the user's own time zone.
- Changes appear within a few seconds while the tab is visible, and as soon as
  a hidden tab is shown again.

## Accessibility

The banner is built to WCAG 2.2 AA:

- It is a labelled region. Incidents are announced at once; other kinds are
  announced politely.
- The kind is spoken in words ("Maintenance: …"), not shown by colour or icon
  alone.
- The dismiss button is labelled ("Dismiss: <title>"), is 32 × 32 px and shows
  a visible focus ring, as do links and "N more".
- Text and icons meet contrast requirements in light and dark themes.

## Styling and isolation

The banner renders in a shadow root. Your app's CSS does not reach it and its
CSS does not reach your app. It uses the workspace's Quackback theme (colours,
radius, font) and the same fixed colours per kind as the portal. The portal's
custom CSS is **not** applied inside other apps.

## Troubleshooting

| Symptom                       | Check                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| Nothing appears               | Embedded apps on? Portal public? Is any live banner set to show in embedded apps, for Everyone?   |
| The script loads but is empty | It returns a no-op comment while the embed is off.                                                |
| Banners do not update live    | The SSO proxy must allow `/api/fork-announcements/stream` (server-sent events) without buffering. |
| CSP errors in the console     | Add the instance to `script-src` and `connect-src`.                                               |
| An old version of the script  | Browsers keep `banner.js` for up to five minutes.                                                 |
