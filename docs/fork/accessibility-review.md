# Portal hub and banner accessibility review

Reviewed 2026-10-11 against this branch. Standard: [WCAG 2.2, Level AA](https://www.w3.org/TR/WCAG22/).

**Status: identified defects corrected; full conformance is not yet established.**
This review covers the fork hub components, portal/embedded banners, and the shared
search and portal shell they use. It is not a certification of every portal route,
workspace theme, host app, SSO provider, or complete support process.

## Corrections and evidence

- **Focus order / keyboard operation (2.4.3, 2.1.1):** embedded live updates
  previously replaced the focused link and returned focus to BODY. The renderer
  now restores the corresponding control, or the next available control when its
  notice disappears. Last dismissal has an explicit focus destination. The portal
  strip handles focused notices removed by a feed update and remains mounted after
  the final notice is removed. Real Chromium reproduced the embed defect and
  verified focus on the replacement link and final status afterward.
- **Rating selection (3.2.2, 4.1.3):** arrow selection no longer submits and removes
  the radio group. A separate Submit rating action saves the selection. Failure
  displays an alert and retains the choice for retry; success exposes a status
  and moves focus to Change. Changing a rating restores focus to the radio group.
- **Search semantics (4.1.2, 4.1.3):** the hero search now exposes combobox expanded
  state, listbox ownership, and the same active option used by arrow navigation.
  Results/searching have a status message. Escape clears the exposed active option.
  The Ask AI row accepts optional option semantics without changing other callers.
- **Reflow and text spacing (1.4.4, 1.4.10, 1.4.12):** long banner words wrap rather
  than clip. Hub cards, status, and rating controls wrap at narrow widths. The actual
  components and application stylesheet were rendered in a local Chromium fixture:
  320 CSS pixels, then 200% root font size plus line-height 1.5, letter spacing
  .12em, word spacing .16em, and paragraph spacing 2em. The final fixture had
  document width 320 and no horizontal overflow. This is component-fixture evidence,
  not a full authenticated page or browser-zoom certification.
- **Contrast and focus visibility (1.4.3, 1.4.11, 2.4.7):** the default gold View all
  link measured 2.50:1 on white. Hub links now use foreground text (19.80:1 in the
  tested default light theme), and the tested focus outlines use foreground color
  rather than a translucent ring. Search result highlighting no longer uses the
  low-contrast gold text. Embedded default banner text measured 15.63:1–17.33:1
  across all five kinds in light/dark modes, using Chromium-rendered sRGB colors.
  Custom themes remain a separate validation requirement.
- **Bypass / target size (2.4.1, 2.5.8):** portal navigation has a keyboard-visible
  Skip to content link. More and Change controls have a minimum 24-pixel height;
  dismiss controls remain 32 pixels and rating choices 44 pixels at default sizing.
- **Reliable dismissal:** successive portal dismissals retain in-memory state when
  storage writes fail, so an earlier dismissed banner does not reappear.

## Automated regression checks

- `packages/widget/__tests__/banner-regressions.test.ts`: storage failures,
  re-enabling the stream, focused link updates, and final dismissal.
- `components/fork/announcements/__tests__/portal-banner-strip.a11y.test.tsx`:
  successive blocked-storage dismissal and focus after feed removal.
- `components/fork/hub/__tests__/hub-rating.a11y.test.tsx`: keyboard selection versus
  submit, result focus, editing, error alert, and retry selection.
- `components/help-center/__tests__/help-center-search.test.tsx`: combobox expanded,
  active-option and selected state, Escape, and existing Ask AI behavior.

The focused web suites passed 25 tests; the widget suite passed 96 tests. Widget
build, web typecheck and targeted lint were also exercised. Browser fixtures used
real components/built embed but mocked content, without a database or company IdP.
No axe scan or screen-reader run is claimed by these results.

## Release validation still required

Full-page and complete-process conformance requires testing more than the changed
components (WCAG conformance requirements 5.2.2 and 5.2.3). Before claiming AA:

1. Exercise the actual authenticated portal and embedded host with VoiceOver/Safari
   and NVDA/Firefox or Chrome: result announcements, live notices, focus changes,
   rating errors/success, and repeated updates. Check that live regions neither
   suppress important content nor repeat excessively.
2. Run keyboard-only flows through SSO, hub search/Ask AI, support chat, dialogs,
   attachments, account controls, and return navigation. Check focus traps,
   obscured focus, error identification, accessible authentication, and timeouts.
3. Test full pages at 200% text enlargement and 400% browser zoom, text-spacing
   overrides, forced colors, reduced motion, and both themes. Include long real
   content, all expanded notices, custom branding, and actual host CSS.
4. Run an automated accessibility scan over each state, then manually review
   contrast, labels, landmarks, page title/language, target spacing, and reading
   order. A clean scan alone does not establish conformance.
5. Validate host-page integration and third-party content. The embed cannot make
   an inaccessible surrounding app conformant, and arbitrary custom theme colors
   or CSS can invalidate the measured contrast and layout.

## Upstream maintenance

Most changes stay in fork-owned components. A11Y-1 touches the shared search and
Ask AI row; A11Y-2 touches the portal shell. Their behavioral tests and the keyboard
skip-link check must be repeated on upstream upgrades, including clean Git merges.
