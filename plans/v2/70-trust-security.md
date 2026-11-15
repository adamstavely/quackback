# Trust & Security page — v2 Plan

> **Status:** plan, not built (2026-11-14). Direction **A — full trust center** chosen by the owner from three
> directions on the design canvas (artboard "Trust & Security — A: full trust center", restyled to Quackback's
> own look). Decisions: D-TS1 … D-TS8 in `01-decisions.md`.
> **Depends on:** Foundations (fork migration lineage, `fork_settings`, seams F-1/F-2/F-4/F-7/F-9/F-13).
> Independent of plans 10–50.

## 1. What it is

A top-level portal page, **Trust & Security** (`/trust`), per app, for any signed-in employee. Modelled on a
SaaS trust center:

| Section       | Content                                                                                                                                                                      | Who edits           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Header        | Title, intro, security contact, policy link, **Subscribe to updates**, **Request access**                                                                                    | Admin               |
| Compliance    | Attestations and approvals (e.g. authority to operate, SOC 2), each with a status line ("Valid to …") and an optional linked document                                        | Admin               |
| Documents     | Grouped (Policies, Reports, Questionnaires…). Each is **open** (any signed-in viewer downloads it) or **restricted** (viewer asks; an admin approves for a set time)         | Admin               |
| Controls      | Groups of controls, each with a status (in place, in progress, not applicable) and "Last reviewed". Entered by hand now, shaped so a compliance tool can push statuses later | Admin, later a tool |
| Subprocessors | Name, purpose, location, data categories                                                                                                                                     | Admin               |
| Updates       | Short dated posts; subscribers are told by email and in-app                                                                                                                  | Admin               |
| FAQ           | The articles of a Help Center category the admin picks                                                                                                                       | Help Center         |

Tabs: Overview (the canvas artboard), Documents, Controls, Subprocessors, Updates, FAQ.

## 2. Decisions (owner, 2026-11-14)

| ID    | Decision                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-TS1 | Direction A: full trust center.                                                                                                                                                           |
| D-TS2 | Audience: any signed-in employee (the portal's own sign-in gate). No per-section segment gating in v1.                                                                                    |
| D-TS3 | Restricted documents: the viewer's request becomes a **private support request** in the existing inbox; an admin approves or declines; approval grants access for a set time.             |
| D-TS4 | Controls: entered by hand now; the data model and an API are shaped so a compliance tool can push statuses later (phase 5).                                                               |
| D-TS5 | One page per app (per workspace), like the rest of the portal. The control tower may fill pages in later.                                                                                 |
| D-TS6 | Styling: platform components and tokens only (Inter, `bg-card`, `border-border`, `rounded-panel`, pill buttons, the workspace's `primary`), so each app's branding carries through.       |
| D-TS7 | Nav tab: ⏳ see §6 — a config link (no code) or one small seam for a real tab with active highlighting.                                                                                   |
| D-TS8 | "Updates" are fork-owned posts with their own subscribers, not changelog entries (changelog subscribers would otherwise get trust emails, and the changelog list has no category filter). |

## 3. What upstream already gives us (verified on `main`)

| Need                                        | Reuse                                                                                                                                                                                                                                                                                                                                                                                                                | Upstream edit?               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Page shell, branding, banners, sign-in gate | New route file `routes/_portal/trust.tsx` (+ child routes per tab) inside `_portal`                                                                                                                                                                                                                                                                                                                                  | No (route tree is generated) |
| File storage                                | `uploadObject` / `generateStorageKey` / `generatePresignedGetUrl` / `getS3Object` (`lib/server/storage/s3.ts`), private prefix `fork-trust/`. Downloads through a fork route that checks access, modelled on `routes/api/export/runs.$runId.download.ts` (presigned redirect, or streamed when `s3Proxy` is on). Upstream's `files` table is **not** used: its retention job deletes files not attached to a message | No                           |
| Access requests                             | A hidden ticket type "Trust access request" (customer category, `intakeVisible: false`), created server-side through `createMyTicket` with the document in `customAttributes`                                                                                                                                                                                                                                        | No                           |
| Approve / decline                           | In the fork's admin **Access requests** view: writes the grant, replies to the requester and closes the ticket through upstream's ticket service. The ticket links to that view. (Reacting to a ticket closed in the inbox itself would need a seam in `EVENT_REACTIONS`; not planned.)                                                                                                                              | No                           |
| Subscriptions                               | Fork table keyed by principal (modelled on `status_subscriptions`); email through `sendRawEmail` + `getEmailFrom()`; in-app through `createNotificationsBatch`                                                                                                                                                                                                                                                       | No                           |
| FAQ                                         | `listPublicArticlesForCategory(categoryId, viewer)` — visibility rules included                                                                                                                                                                                                                                                                                                                                      | No                           |
| Status (optional "uptime" strip)            | `getStatusPageSnapshot` / `getUptimeSeries`, as the banner's status feed already does                                                                                                                                                                                                                                                                                                                                | No                           |
| Admin area                                  | Rail item via F-4 (`FORK_RAIL_ITEMS`), like Announcements                                                                                                                                                                                                                                                                                                                                                            | Existing seam (list entry)   |
| Permissions                                 | `trust.view`, `trust.manage`, `trust.approve` via F-7                                                                                                                                                                                                                                                                                                                                                                | Existing seam (list entry)   |
| Audit                                       | Fork audit events via F-9 (`trust.document.uploaded`, `trust.access.granted/declined/revoked`, `trust.control.updated`, …)                                                                                                                                                                                                                                                                                           | Existing seam (list entry)   |

## 4. Data model (fork lineage, `fork_trust_*`)

- `fork_trust_compliance_items` (name, short label, status text, valid until, linked document, position).
- `fork_trust_document_groups` (name, position); `fork_trust_documents` (group, title, description, storage
  key, file name, content type, size, `access`: `open` | `restricted`, version, published, position).
- `fork_trust_access_requests` (document, requester principal, ticket id, state `pending|approved|declined|
revoked|expired`, decided by, decided at, expires at, reason). The grant **is** an approved, unexpired row.
- `fork_trust_control_groups` (name, position); `fork_trust_controls` (group, name, description, status
  `in_place|in_progress|not_applicable`, `source` `manual|integration`, `external_id`, last checked at).
- `fork_trust_subprocessors` (name, purpose, location, data categories, website, position).
- `fork_trust_updates` (title, body (plain text + link, like banners), published at, status).
- `fork_trust_subscriptions` (principal, created at, unsubscribed at).
- `fork_settings['trust']`: enabled, intro, contact email, policy link, FAQ category id, default grant length
  (e.g. 30 days), "last reviewed" date.

Principal re-point on merge (F-5) for requester and subscriber columns.

## 5. Behaviour and rules

- **Visibility:** the page and every read require a signed-in user principal (portal gate + server check).
  Restricted documents list to everyone (title, description) but download only with a live grant; team members
  with `trust.manage` always can.
- **Download route** `GET /api/fork-trust/documents/$id/download`: checks session, grant or permission, writes an
  audit row, then presigns or streams. Never a public storage URL.
- **Requesting access:** one open request per person per document; the button shows "Requested" until decided.
  Needs support tickets enabled; if they are off, the page shows the security contact instead.
- **Grant expiry:** checked at read time (no job needed); an optional sweep only tidies state.
- **Updates:** publishing one emails and notifies active subscribers once (idempotent per update).
- **Controls feed (phase 5):** `PUT /api/fork-trust/controls/$externalId` with an API key holding `trust.manage`
  (key authority as in plan 10's R-1) and an MCP tool; sets status and last checked time for `integration` rows.
- **Accessibility:** WCAG 2.2 AA as the hub and banners — real links and buttons, tabs as a nav with
  `aria-current`, status never by colour alone (icon + text), visible focus (`outline-solid`), 24 px targets.
- **i18n:** copy through react-intl (`portal.forkTrust.*`) with English defaults; catalogue entries with T-4.

## 6. Nav tab (D-TS7, owner to choose)

- **Option 1 — configuration, no code.** Admin adds a link item in Settings › Portal › Navigation. Upstream only
  accepts an absolute `https://…/trust` URL, renders it as a plain link (full page reload) and never highlights
  it as the current tab.
- **Option 2 — one small seam (recommended for a top-level page).** In `components/public/portal-header.tsx`,
  render a link item whose URL is the portal's own origin as an in-app tab (router link + active highlight).
  Generic (any same-origin link item benefits), a few lines, registered in `SEAMS.md` with a test.

## 7. Admin

Rail item **Trust & Security** (F-4) with views: Overview settings (intro, contacts, FAQ category, grant
length, enable), Compliance, Documents (upload, replace, open/restricted), Controls, Subprocessors, Updates
(draft, publish), **Access requests** (pending first; approve with length, decline with reason, revoke). Same
platform components and patterns as the Announcements admin.

## 8. Phases and gates

| Phase | Deliverable                                                                                                                        | Gate                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Migrations, settings, permissions (F-7), audit events (F-9), admin CRUD for compliance, controls, subprocessors, document metadata | `MATRIX.md` regenerated; module-state green; fork drift clean; Contributor 403 on writes                                       |
| 2     | Portal `/trust` (Overview + tabs) and nav (D-TS7)                                                                                  | Signed-out → sign-in; perf budgets; ssr-formats; WCAG checks; light/dark/brand colour                                          |
| 3     | Document upload + download route; access requests → ticket; Access requests admin view; grant expiry                               | Download denied without grant (portal, direct URL, expired); ticket created once; approve closes ticket and grants; audit rows |
| 4     | Updates + subscribe/unsubscribe; email + in-app                                                                                    | One email per subscriber per update; unsubscribe honoured                                                                      |
| 5     | Controls feed API + MCP tool                                                                                                       | API key without `trust.manage` denied; only `integration` rows changed                                                         |

Rough size: phases 1–4 about 3 weeks; phase 5 about 3 days.

## 9. Seams

None new for phases 1–5 beyond list entries in existing seams (F-4 rail item, F-5 re-point, F-7 keys, F-9
audit types) — unless Option 2 in §6 is chosen (one new seam in `portal-header.tsx`).
