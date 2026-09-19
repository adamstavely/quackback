# RBAC Persona Extensions — v2 Plan

> **Status:** v2 (round-2 revision + staff-review revision + second-pass revision + third-review revision,
> 2026-09-19) — supersedes
> `plans/v1/rbac-persona-extensions-plan.md`. Nothing here is implemented.
> **Depends on:** Foundations (fork migration lineage `packages/db/drizzle-fork` + `drizzle.__fork_migrations`,
> `fork_settings`, shared seams F-1…F-11, `plans/v2/SEAMS.md`) — see `02-fork-conventions.md`, in particular
> §3.3a (fork-only releases run `seedSystemData`).
> **Decisions applied:** D1, D3, D4, D-R1…D-R9, D-T4, D-T7, D-A3, D-A4, D-A6, D-A8, D-P6, D-N8, D-C5 (🟡),
> D-C9, D-C15, D-C16.
> **Baseline:** upstream `780a7b577` (fork `main` has no `apps/`/`packages/` diff against it); staff-review
> additions re-verified against `eb79147`. Every `file:line` below was verified against that tree.

## 0. Round-2 changes

| Change | Driven by |
| --- | --- |
| Custom-roles-on-REST/MCP fix is a **permanent fork patch**; not offered upstream. R-1…R-5 are permanent seams. | D1, D3 (Q18) |
| Seat-exempt Phase 4, seam R-7 (`seat-usage.ts`) and the `seat_exempt` column **removed**. | D-R1, D4 |
| `fork_role_flags` → **`fork_role_templates`** (template identity only; still needed because custom roles have no semantic key, `role.service.ts:262-263`). | D-R1 |
| Phase 3 multi-role is **in scope** (no longer deferrable). | D-R4 |
| Board-scoped teammates **out of scope** (not an open item). | D-R5 |
| Phase 1b teammate comment gate **in scope** on dashboard, REST and MCP; one-time `comment.create` grant to existing custom roles. New seam **R-8** (REST comment route). | D-R6 |
| Eight persona templates defined (UX Team, Dev Team, Stakeholder (read-only), Tier 1/2/3 Agent, Fleet Agent, Fleet Observer). | D-R3, D-C9, D-P6, D-A8, D-N8 |
| `account.unlock` / `account.create` replaced by generic **`account.execute`**; tier gating is by `min_tier` in 40. | D-A6, D-A8 |
| `ticket.escalate` granted to Manager; `prioritization.manage` moved to admin-only; `prioritization.score` removed from Manager. | D-T7, D-P6 |
| `TEAM_SCOPABLE_PERMISSIONS` = `ticket.escalate`, `account.request`, `account.execute`. | D-A6, D-T4 |
| New §4.7: tower role bundles → tenant templates. | D-C9 |
| Settings nav entry and catalogue edits now satisfied by shared F-4 / F-7 (not counted here). | 02 §10 |

## 0a. Staff-review changes

| Finding ID | Change | Where in plan |
| --- | --- | --- |
| R1 (tool-name-only gate) | MCP gate is now **argument- and object-aware**: `forkMcpToolGate(auth, def.name, args)` evaluates a per-tool spec `{ base, fields, dispatch, objects }`. Mutation tools require the key of **every** field present (`triage_post`: `statusId→post.set_status`, `tagIds→post.set_tags`, `ownerPrincipalId→post.set_owner`, mirroring REST `permissionsForPostPatch`, `routes/api/v1/posts/$postId.ts:31-38`). `search`/`get_details` branches are keyed on `entity` / ID prefix, so a `dispatch` marker no longer stands in for a check. | §4.3 (5), Appendix A |
| R1 (resources) | MCP resources get the same gate: seam **R-11** in `mcp/server.ts` `scopeGated` (`:33`) calls `forkMcpResourceGate(auth, uri)`; `quackback://members` now requires `member.view` (today scope-only, `server.ts:125-136`). Unmapped resource = deny for team callers. | §4.3 (6), §7, Appendix A |
| R1 (object access) | Tools whose service reads/writes by ID without row checks get fork object checks before the handler: `get_ticket` (`getTicket(id)` has no actor, `mcp/tools/tickets.ts:174`, `ticket.service.ts:125`), `reply_to_ticket`/`add_ticket_note` (`loadTicketOr404`, `ticket-message.service.ts:263`), `link_ticket`/`unlink_ticket` (`ticket-links.service.ts:47-48`) → upstream `assertTicketVisible` (`ticket.service.ts:115`). Dashboard by-ID ticket reads with the same gap (`functions/tickets.ts:128,368,772`) get seam **R-12**. | §4.3 (7), §7 |
| R1 (REST actors) | `ApiAuthContext.permissions` (R-1) is threaded into **every** REST policy actor: shared builder `serviceActorFromApiAuth` (`domains/api/service-actor.ts:16`, 13 route files) = seam **R-9**; 10 inline actor literals = seam group **R-10**; `posts/$postId.comments.ts:159` folded into R-8. Audit-only actor literals are excluded. CI guard fails on any `principalType: 'service'` actor literal under `routes/api/v1/**` without `permissions`. | §4.3 (2), §7, §9, Appendix A |
| R1 (service row scope) | Default adopted: **API-key/service principals stay workspace-wide** (upstream `ticketFilter`/`conversationFilter` bypass, `policy/tickets.ts:48`, `policy/conversations.ts:38`, untouched) **but** a service principal's resolved set is narrowed: without `ticket.view_all` it loses every `ticket.*` key; without `conversation.view_all` every `conversation.*` key; team-scopable keys are always dropped. So copying a team-restricted creator's roles cannot widen their row scope. 🟡 O-R6. | §4.3 (3), §10 |
| R1 (tests) | Mandatory tests added: direct IDs outside the caller's team (MCP + REST + dashboard), mixed allowed/forbidden mutation fields, resources, service-principal narrowing, REST actor guard. | §8, §9 |
| C2 (`canInTeam`) | System-role branch reads **real system-role assignment rows** (`roles.is_system` + `roles.key`, `schema/rbac.ts:30-34`), never legacy `member` and never the zero-row fallback. Service principals never pass `canInTeam`. | §4.4 |
| C2 (zero-role fallback) | `permissionsForPrincipal` falls back to the Manager preset when a `member` has **no** workspace rows (`policy/permissions.ts:74`), and `seedSystemData` backfills such members to Manager on every migrate (`seed-system.ts:136-175`). Fail-closed for tower-managed principals: an empty-bundle sentinel template **`no_access`** keeps them at ≥1 workspace row (a row with no keys resolves to the empty set, `permissions.ts:75`); fork writers never delete the last row; invariant check `assertTowerPrincipalsFailClosed`. *Refined by the second-pass section: an active managed principal with an empty set is legacy `user` with zero rows; the sentinel is only used for a `member` with team-only roles.* | §4.8 |
| C2 (template sync) | `syncPersonaTemplateFn` add-only replaced by `reconcilePersonaTemplate(roleId, mode)`: `add_only` (local default, reports excess keys) or `exact` (removes keys not in the template via upstream `updateRole`, `role.service.ts:304`; removals are ceiling-free). Tower-managed templates (`fork_role_templates.managed_by = 'tower'`) are always reconciled `exact`. | §4.2, §5 |
| C2 (provenance hooks) | New fork table `fork_role_assignment_sources` (per assignment row: `source`, `bundle_key`, `sync_run_id`) + an exact-set writer (principal row `FOR UPDATE`, same lock upstream's role writer takes). Plan 20 builds tower sync on these hooks. *Superseded by the second-pass section: the writer is now `applyManagedRoleSet` (whole role set, D-C15).* | §4.8, §5 |
| F1 (catalogue) | Fork keys, Manager exclusions (`prioritization.manage` move) and preset changes reach a database **only** when `seedSystemData` runs (`seed-system.ts:28`, preset reconcile `:70-104`). Phase 1 depends on Foundations 02 §3.3a item 2 (`fork-migrate` = fork SQL **then** `seedSystemData`, every tenant, every release). Deploy gate asserts catalogue state per tenant. Custom (template) roles are not touched by `seedSystemData` — they reconcile via §4.2. | §4.1, §8 |
| C3 (RBAC side, via 60) | New read key ✱`announcement.view` (Manager ✓, Contributor ✓, Fleet Agent, Fleet Observer) so read-only fleet roles can list announcements without `announcement.manage`; fork MCP read tools from 50/60 added to the inventory. | §4.2, §6, Appendix A.1 |
| X-6 | Removed the request to plan 20 about observer token scopes; seam IDs aligned with `SEAMS.md` (R-9…R-12 new). Open items renamed to the `01-decisions.md` IDs (O-R3…O-R5). | §7, §10, §11 |
| X-7 | No phase of this plan is deferred; §8 states that Phase 0 templates do not bind on REST/MCP until 1a ships. | §8 |

## 0b. Second-pass review changes

Driven by `REVIEW-2026-09-19-SECOND-PASS.md` and owner decisions **D-C15** (the tower owns the entire app role
set of every tower-managed person) and **D-C16** (directory-driven revocation; disable = tenant-level denial on
every auth path). Where this section and an earlier changes table disagree, this section wins; the body is
rewritten to match it. Plan 20 consumes the contract in §4.8 and §4.9.

| Finding | Change | Where |
| --- | --- | --- |
| R2-3 (RBAC side) | **One writer for managed principals: `applyManagedRoleSet(principalId, desired, source)`.** It replaces **all** workspace-wide **and** team-scoped assignment rows of a tower-managed principal, including preset Owner/Manager rows, rows written by upstream role changes or role-delete reassignment, and fork-UI rows. It also sets the legacy role. Everything happens in one transaction under the locks upstream's role writer takes, in the same order: `pg_advisory_xact_lock(7061636)` then principal row `FOR UPDATE` (`principal.factory.ts:277,320`). It accepts the caller's executor, so plan 20/30 can put tier membership in the same transaction. The old `applyAssignmentSet` and its `authoritative` flag are **removed**; there are no `adopted_local` or "local roles survive" cases. Provenance lives only in `fork_role_assignment_sources`. Every row a managed principal holds must have `source = 'tower'`. The **managed-principal registry** is plan 20's `fork_tower_principals` (one row per managed principal). The writer refuses any principal that is not in it, and all fork-UI writers (Phase 2/3) refuse any principal that is. **Legacy role rule:** `admin` ⇒ the Owner preset row only. `member` ⇒ the desired templates, plus the `no_access` sentinel only when no workspace-wide template is desired. Empty desired set for an **active** principal ⇒ legacy **`user`** and zero rows (no sentinel). **Disabled** ⇒ `denyPrincipal` (R2-4). An upstream legacy-role change to a managed principal is reverted at the next sync and reported `drift_reverted`. `assertTowerPrincipalsFailClosed` now tests exactly this policy. | §2 R8, §4.4, §4.5, §4.7, §4.8, §5, §8, §9 |
| R2-4 (tenant denial) | **Tenant-level denial primitive, separate from grants.** New table `fork_principal_denials`, plus the functions `denyPrincipal(principalId, reason, opts)`, `liftPrincipalDenial` and `isPrincipalDenied(ids[])`. Once the denial row commits, every auth path refuses the principal. Session rows are deleted (`session` table, the same SQL as upstream `forceSignOutUserFn`, `functions/admin.ts:289-300`). OAuth access and refresh token rows are revoked (`oauth_access_token`/`oauth_refresh_token.revoked`, `schema/auth.ts:1046-1120`). The principal is demoted to `user` with zero assignments. Then every API key the principal created is revoked through upstream `revokeApiKey` (`api-key.service.ts:264-281`), which also demotes the key's service principal. **Check sites:** **R-1** (extended, this plan) refuses any API key whose service principal **or creator** is denied, on REST and MCP-key paths. **TW-1** (plan 20) is in the MCP handler, in the same fenced block as R-4: the OAuth path verifies the JWT and re-reads only `principal.role` (`mcp/handler.ts:90-113`). **TW-2** (plan 20) blocks new sessions and must sit at `databaseHooks.session.create.before` (`auth/index.ts:631-638`), which every sign-in method passes through. A new fork job via shared **F-8**, `fork-principal-denial-sweep` (every 5 min), re-applies all active denials. It closes the sign-in-concurrent-with-deny race, and it enforces the optional entitlement lease (off by default, 🟡 O-R8). *Superseded in part by §0c: the race and the lease are now enforced at existing-session resolution (R-13…R-15) on every request; the sweep is cleanup only.* | §2 R9, §4.9, §5, §7, §8, §9, §10 |

**Acceptance tests** (all mandatory, real Postgres, in §9):

- **R2-3.** Use one tower-managed principal P in the Tier 2 + Dev Team templates. Check the resolved permissions
  (`permissionsForPrincipal`, `teamPermissionsForPrincipal`) and `assertTowerPrincipalsFailClosed` after each step:
  1. A local admin grants UX Team to P through the upstream member-role dialog. Upstream replace-all leaves only
     UX Team, with no provenance. P holds UX Team until the next sync. The next `applyManagedRoleSet` restores
     Tier 2 + Dev Team, deletes UX Team and reports `drift_reverted`. The assertion is clean.
  2. The tower adds UX Team. The row exists with `source = 'tower'` and `bundle_keys` set.
  3. The tower removes UX Team. The row is gone and no local survivor exists.
  4. A local admin grants the Tier 2 team-scoped role on another team through the fork UI. The call is refused
     with `TOWER_MANAGED`. A row inserted directly in SQL is removed at the next sync.
  5. A local admin changes P's legacy role to `admin`. P holds the Owner preset until the next sync. The sync
     restores `member` + templates, removes Owner and reports `drift_reverted`.
  6. A local admin removes P from the team (legacy `user`). The next sync restores P.
  7. The tower removes every bundle. P becomes `user` with zero rows.
  8. The tower grants a team-only bundle (only if forced past the tower's write check). P becomes `member` with
     `no_access` + the team row.
  9. Run `seedSystemData`, `runMigrations` and `fork-migrate` between every step above. P **never** resolves to the
     Manager preset: there is no Manager row, and no `member`/`admin` principal has zero workspace-wide rows.
     `assertTowerPrincipalsFailClosed` fails on a hand-made zero-row managed `member`, a Manager row, or a row
     without tower provenance.
- **R2-4.** Start with managed principal Q, locally privileged (legacy `admin` via upstream UI, plus an extra
  local Manager row). Q holds a live dashboard session cookie, a widget/portal session, an unexpired MCP OAuth
  JWT with its refresh token, and an API key they created.
  - Call `denyPrincipal(Q, 'tower_disabled')` without Q visiting the tower. As soon as that call commits, the
    next dashboard request and portal upload return 401. MCP returns 401 although the JWT still verifies. The
    token refresh fails. The API key is refused on REST and on MCP. A fresh sign-in by SSO, magic link, OTP and
    recovery code is refused, with no session row created. Q is `user` with zero assignment rows and every
    key is `revoked_at`-stamped.
  - Race: *rewritten by §0c R3-1.* A session row inserted after the denial committed (its create-check ran
    first) is refused on its **first use** by the session-resolution checks (R-13…R-15). The sweep only deletes
    the row; it is not what closes the race.
  - Sync unavailable, lease **off**: the tenant keeps the last applied state. Access ends only when a sync
    delivers `denyPrincipal`, and plan 20's `directory_sync_stale` alarm fires.
  - Sync unavailable, lease **on**: *rewritten by §0c R3-2.* Access ends on every path at
    `entitlement_expires_at` = last directory observation + lease, checked per request with the sweep stopped.
    A later directory observation lifts only `lease_expired` denials and re-applies roles. A `tower_disabled`
    denial is never lifted by lease renewal.

## 0c. Third-review changes

Driven by `REVIEW-2026-09-19-MAIN-FOLLOWUP.md` findings **R3-1** and **R3-2**. This plan owns the denial design;
plan 20 references the same seams and the same bound (its "Third-review changes" section). Where this section and
§0b disagree, this section wins, and the body (§2 R9, §4.8, §4.9, §5, §7–§11) is rewritten to match. The reviewer
is right that a correct fix needs more integration than the original "no auth-helper seam" estimate. The new
seams below are recorded as such, and every upstream upgrade must test them **semantically**, not only by grep.

| Finding | Change | Acceptance test | Where |
| --- | --- | --- | --- |
| R3-1 (P1): deletion + sign-in check is not immediate denial | **Denial is enforced when an existing session is resolved, not only when one is created.** There is no single upstream function every session consumer passes through, so the check sits at the **three resolvers** that exist (verified at this tree): (1) **R-13**, `auth/index.ts`, two fenced sites in one file: the `auth.api` proxy (`:899-911`) returns `null` from `getSession` when `isUserDenied(result.user.id)`, which covers every in-process `auth.api.getSession` caller (dashboard/portal `requireAuth`/`getOptionalAuth` via `auth-helpers.ts:61`, `auth/session.ts:43`, `bootstrap.ts:93`, `portal-access.ts:73,270`, `origin-transfer.ts:73`, `integrations/oauth-handlers.ts:172`, uploads `routes/api/upload/image.ts:20`, `portal/upload.ts:9`, `widget/upload.ts:12` (Bearer via the `bearer()` plugin, `:833`), and the chat stream's session branch `chat/stream.ts:79`); and `auth.handler` (`:912-925`), through which every Better Auth HTTP endpoint runs (`routes/api/auth/$.ts:82,144`, `origin-transfer.ts:55`), refuses with 401 a request whose cookie/Bearer session belongs to a denied user (except `/sign-out`). That covers `/get-session`, account/email/link endpoints and MCP OAuth authorize. (2) **R-14**, `functions/widget-auth.ts:59-64`: `getWidgetSession` reads the `session` table directly (not through Better Auth), so it returns `null` for a denied user. That covers `requireWidgetAuth`, `getOptionalWidgetAuth`, `uploads.ts:164`, `widget-viewer.ts:18`, `widget/session.ts:16`, `widget/device.ts:22`. (3) **R-15**, `routes/api/chat/stream.ts`: the signed stream-token branch (`:63-76`, a 2-min HMAC token that never touches a session) checks `isPrincipalDenied`, and the heartbeat's `onAlive` (`:415-423`, every 20 s) re-checks it and tears down an open stream. Row deletion in `denyPrincipal` Tx 1, the TW-2 `session.create.before` check (plan 20) and the sweep all **stay**, as cleanup and defence in depth. **Demotion is cleanup only.** Denial no longer depends on demotion succeeding. If the denied principal is the **last admin** (`LAST_ADMIN`, `principal.factory.ts:297`), the denial still applies on every path, the report records `demote_blocked_last_admin`, and an ops alert `denial_demote_blocked` fires. Plan 20's break-glass admin (legacy `admin`, not managed) normally prevents this; ops restore it. Sites that write sessions without the create hook (`routes/api/widget/identify.ts:138` direct insert) need no seam, because the row is refused on use. | Pause a sign-in after TW-2's check, commit `denyPrincipal`, then resume the insert. **Before any sweep** (sweep disabled): a portal write (`createCommentFn`), a dashboard request (`requireAuth`), a widget-Bearer call (`requireWidgetAuth`), a widget upload, a portal upload, `/api/auth/get-session`, a new chat-stream handshake by session and by pre-minted stream token all return 401/null. An already-open SSE stream closes within one heartbeat. Repeat with Q as the **last admin** (break-glass removed): demotion fails with `demote_blocked_last_admin`, the alert fires, and every path above is still refused. | §2 R9, §4.9, §7 (R-13/R-14/R-15), §8, §9 |
| R3-2 (P1): tenant sync success is not directory freshness | **The lease renews only from a recorded directory observation.** The tower passes, per principal, the `observedAt` and `observationRef` of the latest successful **directory** read that showed the person active: a directory-API poll (full, or delta whose cursor advanced from a previously successful cursor; `observedAt` = poll read start) or a SCIM request carrying the full user resource with `active=true`. Tenant writes never renew it. New fork function `recordEntitlementObservation(principalId, { observedAt, observationRef }, { executor })` sets `entitlement_expires_at = GREATEST(existing, LEAST(observedAt, now()) + lease)`. It is a no-op when `observedAt` is not newer than the recorded `entitlement_observed_at`. A `sync-members` run without a newer observation re-applies roles but leaves expiry unchanged. **One bound (10 and 20):** with the lease on, a managed person's access on every auth path ends at `entitlement_expires_at` = the last directory observation of them as active + lease duration. That is **at most the lease duration after they are disabled**, whatever the sync, provisioner or sweep does. The check runs on **every authenticated request** in `isPrincipalDenied`/`isUserDenied` (R-13…R-15, TW-1, TW-2, R-1). Open SSE streams close at the next heartbeat (≤ 20 s later). With the lease off (default, 🟡 O-R8) there is **no hard maximum**, only plan 20's 15-min target. | Lease on (e.g. 60 min). Stop the directory poll and SCIM while `sync-members` keeps succeeding every 15 min, **and** stop the sweep worker. Access (dashboard, portal, widget, MCP JWT, API key, new sign-in) is refused at `last observedAt + 60 min` ± 1 request, not later. `entitlement_expires_at` never moves during the outage. A poll that resumes renews it and lifts only `lease_expired`. | §4.8, §4.9, §5, §9, §10 O-R8, O-R10 |

## 1. Changes from v1

| # | v1 issue (review §3.6, X4, X5, X7, cross-plan §4) | v2 resolution |
| --- | --- | --- |
| 1 | "Adding a key = `bun run db:permissions`" — wrong. That script only regenerates the client mirror `apps/web/src/lib/shared/permissions.ts`. | DB side reconciles via `seedSystemData` (`packages/db/src/seed-system.ts:28-175`), invoked from `runMigrations` (`packages/db/src/migrate-runtime.ts:271`) and, for fork-only releases, from `fork-migrate` (02 §3.3a). Both steps are in the Phase 1 gate. |
| 2 | v1 Phase 4 `viewer` legacy role "a small schema/enum addition". | **Dropped entirely** (D-R1, D4 — seat limits never apply). Read-only is expressed by bundles + Phase 1a/1b; no seat mechanics. |
| 3 | "`teamId` is unused, just read it in `permissionsForPrincipal`". | `teamId` is actively excluded with `isNull(teamId)` in 6 places (`policy/permissions.ts:70`, `domains/roles/role.service.ts:98,184,460`, `domains/principals/principal.factory.ts:369`, `functions/settings.ts:178`). v2 **keeps all 6 filters** and adds a fork-only team resolver (§4.4, D-R9). |
| 4 | "Multi-role: stop replace-all" (edit the writer). | The writer `reconcileWorkspaceAssignment` (`principal.factory.ts:357-398`) deletes all workspace rows on every role change. v2 does **not** edit it; extra hats are fork-written rows with documented reset semantics (§4.5) and provenance (§4.8). |
| 5 | **X5 — custom roles not enforced on REST/MCP** (not in v1). | **Phase 1a** (D3): REST and MCP resolve the principal's custom-role set ∩ scopes, threaded into every actor; an argument/object-aware fork gate covers MCP tools and resources. **Permanent fork patch** (D1/Q18). |
| 6 | **X4 — new keys auto-granted to Manager** (`rbac-catalogue.ts:644-649`). | Explicit per-key table (§6); keys Manager must not hold go into the fenced `WORKSPACE_ADMIN_PERMISSIONS` block (F-7). |
| 7 | **X7 / D-R2 — 3-part keys.** | Two-part only; `scopeForPermission` reads `split('.')[1]` (`lib/shared/api-key-scopes.ts:251`). Existing categories only, so `CATEGORY_SCOPES` (`api-key-scopes.ts:211-227`) is untouched. |
| 8 | Contributor assumed a good tier base. | Contributor has `conversation.*` but **no `ticket.*`** (`rbac-catalogue.ts:653-693`). Tier/Fleet templates list `ticket.*` keys explicitly. |
| 9 | `comment.create` gate "+ enforce". | `createCommentFn` is a bare `requireAuth()` shared with portal users (`functions/comments.ts:116-125`); widget reuses `runCreateComment` (`functions/widget/comments.ts:8-9`). Gate applies to **teammates only**, on dashboard (R-6), REST (R-8) and MCP (tool gate) — in scope per D-R6. |
| 10 | `post.view` read key. | **Dropped** — admin feedback inbox already gates on `post.view_private` (`functions/admin.ts:151`). |
| 11 | `roadmap.view` / board-scoped teammates. | **Out of scope** (D-R5). Teammates keep the `isTeamActor` bypass (`policy/boards.ts:54`, `policy/roadmaps.ts:13`). |
| 12 | `domains/*/portal-invites`. | Irrelevant now: all personas are dashboard teammates (D-R3). |
| 13 | Upgrade-safety "localized". | Own seams (§7): **23 upstream files** (14 seam IDs), all small fenced edits; catalogue + nav via shared F-7/F-4. The denial seams R-13…R-15 (R3-1) need semantic tests on every upgrade. |
| 14 | Cross-plan keys missing. | §6 is the single registry of all fork keys; §4.2 defines all eight templates (+ the `no_access` sentinel). |
| 15 | Fleet `viewer` vs tenant terminology. | No tenant `viewer`; fleet `observer` → **"Fleet Observer"** (D-C5), generalised by configurable tower bundles (D-C9, §4.7). |
| 16 | API keys ignored. | Every key mints a service principal whose legacy role = creator's (`domains/api-keys/api-key.service.ts:106-137`); §4.3 defines key authority for custom-role creators (D-R8) and its row scope (O-R6). |

## 2. Requirements

- **R1** Personas (UX Team, Dev Team, Stakeholder (read-only), Tier 1/2/3 Agent, Fleet Agent, Fleet Observer)
  are custom roles installable as templates without hand-picking keys (D-R3). All are dashboard teammates.
- **R2** A custom role's bundle is the authority on **every** surface: dashboard, REST API, MCP tools **and
  resources** (OAuth and API key), including argument-dependent fields and by-ID object access. No path falls
  back to the legacy Manager/Owner preset for a custom-role holder (D3).
- **R3** Fork keys exist with an explicit, reviewed default per system role, and reach every tenant database.
- **R4** Some grants apply only within a team (tier teams) — prerequisite for 30/40 (D-T4).
- **R5** A person can hold more than one role (e.g. Dev Team + Tier 2) (D-R4).
- **R6** Read-only teammates cannot comment on any surface (D-R6); existing custom-role holders keep commenting.
- **R7** Upgrade-safe: no upstream schema edits, no new legacy role, no seat mechanics (D4); seams limited to
  what R2 needs.
- **R8** Tower-managed principals fail closed: no state of theirs resolves to the Manager preset by fallback. The
  tower owns their **entire** role set (D-C15). Local grants and legacy-role edits do not survive the next sync.
- **R9** A disabled tower-managed person is denied at the tenant on every auth path, independent of grant
  bookkeeping (D-C16). The auth paths are cookie sessions (dashboard, portal, widget, uploads), MCP OAuth JWTs,
  OAuth refresh, API keys they created (REST and MCP), realtime streams and new sign-ins. Denial is checked
  whenever an **existing** session or credential is resolved (§4.9), so it does not depend on row deletion,
  demotion or the sweep (R3-1).

## 3. How it works today (verified)

- Two axes: legacy `principal.role` (`admin|member|user`, text column, `schema/auth.ts:821-823`) is the
  teammate wall; permission bundles live in `principal_role_assignments` (`schema/rbac.ts:62-97`). Custom
  roles ride legacy `member`; custom roles get `key = id` ("Customs have no semantic key",
  `role.service.ts:262-263`). Legacy `member` therefore says nothing about Manager.
- Resolution: `permissionsForPrincipal` (`policy/permissions.ts:58-76`) unions **workspace-wide** rows,
  falls back to the legacy preset when there are none (`:74`; `member` → Manager). A row whose role has no keys
  resolves to the empty set (`:75`). Dashboard gates resolve it (`functions/auth-helpers.ts:153`);
  non-dashboard audiences carry an empty set (`auth-helpers.ts:158-160`). `can()` uses `actor.permissions` or
  falls back to the legacy role (`policy/authorize.ts:21-23`).
- `seedSystemData` (every migrate): upserts the catalogue, reconciles the four presets insert+delete
  (`seed-system.ts:70-104`), heals stale NULL-grantor preset rows (`:106-133`) and **backfills every `member`
  with zero workspace rows to Manager** (`:136-175`). Upstream role writes delete all workspace rows and insert
  the preset (or `assignRoleId`) under `FOR UPDATE` on the principal row (`principal.factory.ts:314-320,357-398`);
  explicit grants record `granted_by_principal_id`, preset rows leave it NULL (`:391-393`).
- **Gap (X5/R1), REST:** `withApiKeyAuth` and `assertApiPermissions` use `resolveActorPermissions(auth.role)` —
  legacy preset only (`domains/api/auth.ts:134,158`). Policy actors handed to services omit `permissions`: the
  shared `serviceActorFromApiAuth` (`domains/api/service-actor.ts:16-23`, used by 13 route files) and 11 inline
  literals (Appendix A), so every domain `can()` falls back to the preset.
- **Gap, MCP:** contexts carry only `role` (`mcp/types.ts:16-31`, `mcp/handler.ts:98-128,183-200`); actors carry
  no permission set (`mcp/tools/helpers.ts:230-252`); tools gate on scope + `teamOnly` (`helpers.ts:171-204`).
  `triage_post` calls `updatePost` with an attribution object, not a policy actor (`mcp/tools/posts.ts:163-176`,
  `post.service.ts:349-357`); `search`/`get_details` gate per branch on scope + team only
  (`mcp/tools/search.ts:173-276`); resources are scope-gated only (`mcp/server.ts:33-53`), and
  `quackback://members` has no team check at all (`:125-136`); `get_ticket` reads ticket + messages with no actor
  (`mcp/tools/tickets.ts:174-178`). A custom-role holder on MCP therefore acts as **Manager**.
- **Gap, row scope:** service principals (API keys; MCP callers without `userId`, `helpers.ts:220-222`) bypass
  ticket/conversation team visibility (`policy/tickets.ts:48`, `policy/conversations.ts:38`). By-ID ticket reads
  skip `ticketFilter` on MCP (above), in the message/link services (`ticket-message.service.ts:263`,
  `ticket-links.service.ts:47-48`) and on the dashboard (`functions/tickets.ts:128,368,772`, gated on
  `ticket.view` only). Conversation by-ID access is `canViewConversation` = any `conversation.view` holder
  (`policy/conversation.ts:25-29`) on every surface — upstream's chosen semantics (O-R7).
- Keys: `createApiKey` mints a service principal with `role = isAdmin(creator) ? 'admin' : 'member'`
  (`api-key.service.ts:125-137`); service principals get **no** assignment rows (`principal.factory.ts:186-200`).
  `api_keys.created_by_id` is `ON DELETE SET NULL` (`schema/api-keys.ts:28-31`).
- Comments: all creation funnels through `createComment` (`domains/comments/comment.service.ts:42`), called
  from `runCreateComment` (`functions/comments.ts:89`; dashboard, portal, widget), REST
  (`routes/api/v1/posts/$postId.comments.ts:164`, gated `comment.moderate` at `:74`), MCP `add_comment`
  (`mcp/tools/comments.ts:107`, scope only) and conversation→post convert (`conversation.convert.ts:60`, a
  private tracking note written by an agent already authorised to convert).
- `prioritization.manage` exists (RESERVED, category `feedback`, `rbac-catalogue.ts:81,407-410`) and is **not**
  in `WORKSPACE_ADMIN_PERMISSIONS` (`:613-642`), so Manager holds it today.

## 4. Design

### 4.1 Fork catalogue block (Phase 1, via shared seam F-7)

Fork keys live in `packages/db/src/fork/rbac-catalogue.fork.ts` (exports `FORK_PERMISSIONS`,
`FORK_PERMISSION_CATALOGUE`, `FORK_WORKSPACE_ADMIN_PERMISSIONS`, `FORK_CONTRIBUTOR_PERMISSIONS`; type-only import
of `PermissionCategory`). F-7 spreads them into `PERMISSIONS` (keeps `as const` typing),
`PERMISSION_CATALOGUE`, `WORKSPACE_ADMIN_PERMISSIONS` and the `contributor` array. `FORK_WORKSPACE_ADMIN_PERMISSIONS`
may list the **existing** key `prioritization.manage` (D-P6); it is not re-declared in the catalogue. Then
`bun run db:permissions` (client mirror only).

**Reaching the database (F1).** Catalogue rows and preset bundles — including the Manager exclusions — change
only when `seedSystemData` runs: step 2 upserts keys, step 4 inserts missing and **deletes stale** preset rows
(`seed-system.ts:47-104`), which is what removes `prioritization.manage` from Manager. Single-tenant boot runs it
in `runMigrations` (`migrate-runtime.ts:271`). A pooled **fork-only** release reaches tenants only through
Foundations' `fork-migrate` running fork SQL **then** `seedSystemData` (02 §3.3a item 2); Phase 1 cannot ship
before that change. Resumed suspended tenants get the same via `fork-migrate --workspace` (02 §3.3a item 4).
`seedSystemData` never touches custom roles, so persona templates reconcile separately (§4.2).

### 4.2 Persona role templates (Phase 0, extended in Phase 1)

- Fork module `apps/web/src/lib/server/fork/rbac/persona-templates.ts`: pure data
  `{ templateKey, version, name, description, keys[], teamScopedKeys[] }`. `teamScopedKeys` are the
  `TEAM_SCOPABLE_PERMISSIONS` the template expects to be granted **team-scoped** (§4.4). `version` bumps on any
  bundle change.
- `installPersonaRolesFn({ templateKeys?, managedBy })` (`fork/rbac/functions.ts`,
  `requireAuth({ permission: 'role.manage' })`) calls upstream `createRole` with explicit `permissionKeys` (reusing
  ceiling, tier cap and `role.created` audit), then writes `fork_role_templates(role_id, template_key, version,
  managed_by)`. Idempotent per template (skip if a row exists; cascade-deleted with the role, so a deleted
  template can be reinstalled).
- **Reconcile (C2)** — `reconcilePersonaTemplate(roleId, { mode, dryRun })` replaces the add-only sync:
  - Computes `missing = template − role` and `excess = role − template`.
  - `add_only`: applies `missing`; reports `excess` (UI badge "differs from template"). Default for
    `managed_by = 'local'`, and the path that delivers Phase 1 keys to roles installed in Phase 0.
  - `exact`: calls upstream `updateRole(roleId, { permissionKeys: template.keys })` (`role.service.ts:304`) —
    audited, ceiling applies to additions only, removals are free (`:326-333`), system roles refused (`:311`).
    Always used for `managed_by = 'tower'`; available to local admins as an explicit "Reset to template".
  - Upstream refuses editing a role the editor holds (`assertNotHeldByEditor`, `role.service.ts:189-202`): the
    tower's installer identity must not hold persona roles; the refusal is surfaced, never bypassed.
  - Records `version` applied; `dryRun` returns the diff for tower preview.
- Pure service `ensurePersonaRoles(installer, templateKeys, { managedBy, reconcile })` + fork MCP tool
  `fork_install_persona_roles` (`mcp/tools/fork-rbac.ts`, registered via F-3) so the tower installs **and
  reconciles** roles per tenant (§4.7).
- **Sentinel `no_access` template** (C2): empty bundle, `managed_by = 'tower'`, installed with the others; used
  only by `applyManagedRoleSet` (§4.8) when a tower-managed `member` has team-scoped roles but no workspace-wide
  template, so it still holds ≥1 workspace-wide row. An empty desired set yields legacy `user` instead.
- Not seeded on migrate: installation is an explicit, audited admin action (ceiling applies).

Bundles (✱ = fork key; **T** = team-scoped grant on the tier team, §4.4; tier bundles are starting points —
30/40 own final tier semantics):

| Template | Bundle |
| --- | --- |
| **UX Team** | `post.view_private`, `post.create`, `post.set_status`, `post.set_tags`, `post.merge`, `status.view`, `tag.view`, `suggestion.view`, `member.view`, `segment.view`, `analytics.view`, `changelog.view_draft`, ✱`comment.create`, ✱`prioritization.score`, `prioritization.manage` (D-P6) |
| **Dev Team** | Feedback triage/status: `post.view_private`, `post.create`, `post.set_status`, `post.set_board`, `post.set_tags`, `post.set_owner`, `post.merge`, `status.view`, `tag.view`, `suggestion.view`, `suggestion.manage`, `member.view`; roadmap: `roadmap.manage`; changelog: `changelog.view_draft`, `changelog.manage` (🟡 O-R4: full publish); ✱`comment.create`. No `prioritization.*`. |
| **Stakeholder (read-only)** | View keys only: `post.view_private`, `changelog.view_draft`, `status.view`, `tag.view`, `member.view`, `analytics.view`. **No** ✱`comment.create` (D-R6). |
| **Tier 1 Agent** | `conversation.view/reply/note/set_status/set_tags`, `ticket.view/reply/note/set_status`, `people.view`, `company.view`, `member.view`, `tag.view`, `integration.view`, `copilot.use`, ✱`account.request`, ✱`account.execute`; **T** ✱`ticket.escalate`, ✱`account.request`, ✱`account.execute` |
| **Tier 2 Agent** | Tier 1 + `conversation.assign`, `ticket.assign`, `ticket.create` (roll-up, D-A8) |
| **Tier 3 Agent** | Tier 2 + `conversation.view_all`, `ticket.view_all` |
| **Fleet Agent** (D-C5) | Contributor preset (incl. ✱`comment.create` and ✱`announcement.view` via the fenced contributor list) + `ticket.view/reply/note/assign/set_status/create` + ✱`announcement.view`, ✱`announcement.manage` (D-N8) |
| **Fleet Observer** (D-C5, D-R7) | Read-only: `post.view_private`, `conversation.view`, `conversation.view_all`, `ticket.view`, `ticket.view_all`, `people.view`, `company.view`, `member.view`, `segment.view`, `status.view`, `tag.view`, `suggestion.view`, `changelog.view_draft`, `analytics.view`, `integration.view`, ✱`announcement.view`. No ✱`comment.create`, no ✱`announcement.manage`. |
| **No access** (sentinel) | Empty. Never assigned by hand; §4.8 only. |

- **Tier keys:** every tier holds `account.request` **and** `account.execute`; what an agent may run or approve
  is decided by the action's `min_tier` against the agent's effective tier (highest tier team they belong to,
  D-A8) in 40 — not by the key. Tier 3 keeps `ticket.escalate` by roll-up; 30 treats T3 as having no target.
- No new read keys: every read a read-only persona needs already exists as a `*.view*` key (`READ_VERBS`,
  `api-key-scopes.ts:234`). Genuine read-only comes from Phase 1a (argument-aware MCP gate) + Phase 1b.
- Read-only teammates keep own votes and emoji reactions (🟡 O-R5, default allowed): `vote_post` and
  `react_to_comment` map to "no key" in the MCP gate; `runAddReaction` (`functions/comments.ts:127-154`) stays
  ungated.

### 4.3 Phase 1a — custom-role enforcement on REST and MCP (D3, permanent fork patch)

**Principle:** authority = *principal's resolved permission set* (narrowed for service principals) ∩ *credential
scopes*, checked per argument and per object, on every surface. Not offered upstream (D1/Q18); R-1…R-5 and
R-8…R-12 are carried permanently and re-applied at every sync. Appendix A is the complete inventory.

1. **REST gate** (`domains/api/auth.ts`, R-1): `requireApiKey` resolves
   `permissions = forkNarrowServicePermissions(await permissionsForPrincipal(apiKey.principalId, role))` once
   and stores it on `ApiAuthContext`; `withApiKeyAuth` (`:134`) and `assertApiPermissions` (`:158`) read
   `auth.permissions` instead of `resolveActorPermissions(auth.role)`. No assignment rows → legacy preset →
   zero change for existing keys (Manager preset holds both `view_all` keys, so narrowing is a no-op for it).
2. **REST actors (R-9, R-10, R-8):** every policy actor built from an API key carries
   `permissions: auth.permissions`:
   - R-9: `serviceActorFromApiAuth` (`domains/api/service-actor.ts:16-23`) — covers the 13 ticket/conversation
     mutation routes that call it.
   - R-10: the 10 inline literals that still build their own actor (Appendix A.3), one added property each.
   - R-8 file also carries its `createComment` actor (`posts/$postId.comments.ts:159`).
   - Audit-only literals (`users/identify.ts:56`, `segments/$slug.members.ts:91,139`, `moderation/-audit.ts:15`)
     are attribution for `recordAuditEvent`, not policy actors — excluded by name in the guard.
   - **CI guard:** a fork test scans `routes/api/v1/**` for object literals containing
     `principalType: 'service'` (and calls of `serviceActorFromApiAuth`) and fails when a literal lacks
     `permissions` and is not on the audit allowlist — new upstream routes force a decision at merge time.
3. **API-key authority and row scope** (R-2, O-R6):
   - The service principal receives a **copy of the creator's workspace-wide role assignments** at creation
     (hook after `createServicePrincipal`, `api-key.service.ts:133-137`). Role edits propagate; the key survives
     creator removal; the creator's ceiling bounds it. Rejected: "creator's live set ∩ scopes" (extra query,
     undefined once `created_by_id` is nulled).
   - **Row scope (default, 🟡 O-R6):** service principals stay workspace-wide (upstream bypass,
     `policy/tickets.ts:48`, `policy/conversations.ts:38`, not patched). Because copying roles cannot copy team
     membership, `forkNarrowServicePermissions(set)` (used by R-1 and by MCP for service callers) removes every
     `ticket.*` key unless the set holds `ticket.view_all`, every `conversation.*` key unless it holds
     `conversation.view_all`, and all `TEAM_SCOPABLE_PERMISSIONS`. A Tier 1/2 creator's key therefore cannot
     touch tickets or conversations; Tier 3 / Fleet Observer / presets keep workspace-wide reach they already
     have on the dashboard. Team-restricted agents use MCP via OAuth (a `user` principal, filtered normally).
     The key-creation UI warns which keys a key will not carry.
   - **Existing keys (D-R8):** `backfillKeyAuthorityFn` (`api_key.manage`): dry-run report of each key whose
     creator holds non-preset assignments and what it would lose (including narrowing); explicit apply.
     Recorded in `fork_settings['rbac.key_backfill']`.
   - Side-effect: service principals count in role holder counts (`role.service.ts:98,184`) and move on
     delete-with-reassign (`:460`) — noted in the UI.
4. **MCP context and actors** (R-3, R-4, R-5): `McpAuthContext.permissions?: ReadonlySet<PermissionKey>`. At the
   single consumer (`mcp/handler.ts:240`, after `resolveAuthContext`) call fork `resolveMcpPermissions(auth)` =
   `permissionsWithinScopes(narrowIfService(await permissionsForPrincipal(principalId, role)), new Set(scopes))`
   (`api-key-scopes.ts:319-325`). Covers OAuth (`handler.ts:98-128`) and API keys. Both actor builders
   (`helpers.ts:230-252`) add `permissions: auth.permissions`.
5. **MCP tool gate — argument-aware** (R-5): the `wrapped` callback in `registerTool` (`helpers.ts:182`) calls
   `await forkMcpToolGate(auth, def.name, args)` after the `teamOnly` guard, for team-role callers only (portal
   OAuth users keep upstream behaviour). `FORK_MCP_TOOL_SPECS` (`fork/rbac/mcp-tool-permissions.ts`), per tool:
   - `base: PermissionKey[] | 'none'` — all required (`'none'` is an explicit decision, e.g. own votes);
   - `fields: Record<argName, PermissionKey>` — for every argument **present** in the call (not `undefined`),
     its key is required; a call with no mutating field is rejected (`triage_post`, `update_changelog`);
   - `dispatch: { arg, branches: Record<value, Spec> }` — `search` on `entity`, `get_details` on TypeID prefix;
     unknown branch = deny;
   - `objects: { arg, check }[]` — object checks run before the handler (item 7);
   - `ownership: { arg, otherKey }` — when the caller is not the object's author, `otherKey` is also required
     (`update_comment` → `comment.edit`, `delete_comment` → `comment.moderate`).
   Denials return the standard error result naming every missing key. **Unmapped tool = deny for team
   callers** + a CI test over `scanAllMcpTools` (`policy/authz-matrix/scan.ts:321`) that fails on any unmapped
   tool **and** on any tool schema argument not classified in its spec (every argument is either a `fields`
   entry, a `dispatch`/`objects` argument, or listed in `inert`), so an upstream tool or argument addition forces
   an explicit fork decision at merge time.
6. **MCP resources** (R-11): `scopeGated` (`mcp/server.ts:33`) calls `forkMcpResourceGate(auth, uri)` after the
   scope check, team callers only; `FORK_MCP_RESOURCE_PERMISSIONS`: `boards → none`, `statuses → status.view`,
   `tags → tag.view`, `roadmaps → none` (teammate board/roadmap reads are open, D-R5), `members → member.view`,
   `help-center/categories → none` (upstream team check `:160` stays). Unmapped resource = deny; CI test over the
   `RESOURCE_SCOPES` keys (`mcp/required-scope.ts:49-56`) fails on an unmapped URI.
7. **Object (row) checks** where services have none:
   - MCP (in the gate's `objects`): `get_ticket`, `reply_to_ticket`, `add_ticket_note` → `assertTicketVisible(
     ticketId, mcpAgentActor(auth))` (`ticket.service.ts:115`, i.e. `ticketFilter`); `link_ticket`/`unlink_ticket`
     → both IDs. Conversation tools keep upstream `assertConversationViewable`/`canViewConversation` (O-R7).
   - Dashboard (R-12): `getTicketFn` (`functions/tickets.ts:128`), `getTicketLinksFn` (`:368`) and
     `exportTicketTranscriptFn` (`:772`) call `assertTicketVisible(ticketId, actor)` before `getTicket`, matching
     the sibling fns that already do (`:143,:750,:889,:901`). Without this a Tier 1 agent without `view_all`
     reads any ticket by ID on the dashboard.
   - REST ticket/conversation routes run as service principals → workspace-wide by the O-R6 default; narrowing
     (item 3) is what limits them.
8. Not fixed (non-security): `functions/admin.ts:397` onboarding checklist uses `permissionsForLegacyRole` (O6).

### 4.4 Phase 2 — team-scoped RBAC (prerequisite for 30/40, D-T4, D-R9)

- **Storage:** upstream's reserved `principal_role_assignments.team_id` (FK → `teams.id` ON DELETE CASCADE,
  `schema/rbac.ts:86-91`). No fork DDL on that table. The partial unique index exempts `team_id IS NOT NULL`
  (`:92-95`), so the fork writer dedupes under `pg_advisory_xact_lock` + existence check.
- **Isolation:** all 6 upstream `isNull(teamId)` filters stay, so team-scoped rows are invisible to every
  upstream check. Merge checklist: watch for removal of those filters (D-R9).
- **`TEAM_SCOPABLE_PERMISSIONS`** = `ticket.escalate`, `account.request`, `account.execute` — checked only in
  fork code (30/40), always through `canInTeam`, never `can()` (fork lint test).
- **Resolver** (`fork/rbac/team-permissions.ts`):
  - `teamPermissionsForPrincipal(principalId)` → `Map<TeamId, Set<PermissionKey>>`, counting a row only if the
    principal is a teammate (`isTeamMember(role)`) **and** in `team_members` for that team (`schema/teams.ts:71`).
  - `systemRolesForPrincipal(principalId)` → the `roles.key` of workspace-wide assignment rows whose role has
    `is_system = true` (`schema/rbac.ts:30-34`). **Never** derived from legacy `principal.role` and never from the
    zero-row fallback (C2): a `member` holding only custom roles, or no rows at all, has no system role here.
  - `canInTeam(actor, key, teamId, scopes?)` = `actor.principalType !== 'service'` **and** (*system-role grant*:
    an Owner or Admin row → any scopable key; a Manager row → `ticket.escalate` only, D-T7 — **or**
    `teamSet(teamId).has(key)`), intersected with MCP/key scopes. Service principals never pass (escalation and
    account actions are human-attributed, D-C2). A scopable key reaching a person only through a
    **workspace-wide custom-role** assignment is inert (flagged in the UI) — so a Tier role can be assigned
    workspace-wide for its dashboard keys without its scopable keys leaking beyond the tier team.
- **Tier assignment** (unmanaged principals) = one fork action `assignTierAgentFn(principal, tierTeam)`
  (`member.manage`). It writes a workspace-wide assignment of the Tier N role (dashboard keys) and a team-scoped
  grant of the same role on the tier team (scopable keys), both through the local writer (§4.8,
  `source = 'fork_ui'`). For a **tower-managed** principal the tier roles come only from the tower through
  `applyManagedRoleSet`, and `assignTierAgentFn` refuses with `TOWER_MANAGED` (D-C15). Effective tier and roll-up
  are computed by 30/40 from tier-team membership (D-A8).
- **Writer:** `grantTeamRoleFn` / `revokeTeamRoleFn` (`member.manage` + `assertGrantableRole`,
  `domains/roles/role.grants.ts:22-38`), for unmanaged principals only; both refuse a tower-managed principal
  with `TOWER_MANAGED`. Audit via `user.role.changed` (`audit/log.ts:68`) with metadata
  `{ scope: 'team', teamId, roleId, op, source }`. A role with no scopable keys is rejected for team-scoped
  assignment.
- **Upstream interactions (accepted):** role delete ignores team-scoped holders in its in-use check and
  cascades them (`role.service.ts:405+`) — the fork page lists them before delete; demotion to `user` leaves
  rows inert.

### 4.5 Phase 3 — multi-role assignment (in scope, D-R4)

- `addRoleAssignmentFn` / `removeRoleAssignmentFn` (fork, `member.manage` + ceiling) insert or delete extra
  workspace-wide rows (`team_id IS NULL`, protected by the existing partial unique index) through the local
  writer (§4.8), recording `source = 'fork_ui'`. Resolution already unions (`permissions.ts:75`). Both refuse the
  last remaining row (use the upstream role change instead) and the Owner preset. Both refuse a tower-managed
  principal with `TOWER_MANAGED`: a managed person's hats come only from the tower (D-C15).
- **Reset semantics (documented, not patched):** any upstream role change calls `reconcileWorkspaceAssignment`,
  which deletes **all** workspace rows (`principal.factory.ts:364-371`) — extra hats are cleared (team-scoped
  rows are untouched: that delete filters `isNull(teamId)`, `:369`); their provenance rows cascade away. Same-role
  saves do not reconcile (`:325-334`). The fork page shows "additional roles"; upstream's members table
  (`functions/settings.ts:165-185`) keeps showing one, which is acceptable. For tower-managed principals, any
  upstream reset is drift: the next tower sync replaces the whole set and reports `drift_reverted` (§4.8).

### 4.6 Phase 1b — teammate comment gate (in scope, D-R6)

- **Key:** `comment.create` (fork, category `feedback`). Owner/Admin/Manager hold it by construction;
  Contributor via the fenced contributor list; templates as §4.2.
- **Dashboard / portal / widget (R-6):** first line of `runCreateComment` (`functions/comments.ts:65`):
  `await forkAssertTeammateMayComment(auth)`. Applies only when the **principal record's** legacy role is
  `admin|member` (portal users untouched); resolves `permissionsForPrincipal` itself because non-dashboard
  audiences carry an empty set (`auth-helpers.ts:158-160`) — so a read-only teammate cannot comment from the
  portal or widget either.
- **REST (R-8):** after `withApiKeyAuth(…, COMMENT_MODERATE)` (`$postId.comments.ts:74`):
  `assertApiPermissions(auth, [PERMISSIONS.COMMENT_CREATE])` — upstream's own helper (`domains/api/auth.ts:154-167`),
  which reads the R-1 resolved set; the route's `createComment` actor (`:159`) gains `permissions`. Same
  `write:feedback` scope as today; legacy keys unaffected (all presets hold the key).
- **MCP:** `add_comment` spec `base: comment.create`, `fields: { isPrivate: comment.view_private }` (a teammate
  may not write internal notes it cannot read); no extra seam.
- **Not gated:** `conversation.convert.ts:60` (tracking note written as part of a conversion the agent is already
  authorised for).
- **Rollout:** `enableTeammateCommentGateFn` (`role.manage`) first runs a one-time, idempotent grant of
  `comment.create` to **every existing non-system role** (`roles.is_system = false`, `schema/rbac.ts:34`) that
  lacks it — **except** installed templates whose bundle omits it (Stakeholder (read-only), Fleet Observer,
  No access) — then sets `fork_settings['rbac.teammate_comment_gate'] = true` in the same transaction. Report
  stored in `fork_settings['rbac.comment_create_backfill']`. Roles created afterwards get the key only if chosen
  (catalogue keys default-off for custom roles, `role.service.ts:22-24`).

### 4.7 Tower role bundles → tenant templates (D-C9; tower side in 20)

- Tower authorization is **configurable role bundles**; `observer`/`agent`/`owner` are only seeds (D-C9). Each
  bundle carries its tower capabilities **and** a tenant role target: `admin` (legacy Admin, seed `owner`) or a
  **`template_key`** from §4.2 (seeds: `agent → fleet_agent`, `observer → fleet_observer`, D-C5 🟡).
- Tenant-side contract this plan provides:
  - `fork_install_persona_roles({ templateKeys, reconcile: 'exact' })` installs and reconciles tower-managed
    templates.
  - `applyManagedRoleSet` (§4.8) sets a managed principal's **entire** role set (legacy role, workspace-wide
    rows and team rows) with provenance.
  - `denyPrincipal` / `liftPrincipalDenial` / `isPrincipalDenied` (§4.9) handle account disablement.
  - `assertTowerPrincipalsFailClosed` reports violations.

  Tenant keys are always enforced by the tenant (Phase 1a); tower capabilities by the tower.

### 4.8 Managed role sets, provenance and fail-closed principals (C2, D-C15; contract consumed by 20)

**Ownership (D-C15).** A principal is **tower-managed** iff it has a row in the managed-principal registry,
plan 20's `fork_tower_principals` (§5.3 there: `principal_id` PK → `principal.id` ON DELETE CASCADE,
`tower_user_id`, `managed_since`, …). This plan reads `principal_id` and writes the columns plan 20 adds
for it (§5): `last_applied_legacy_role`, `last_applied_at` and `last_sync_run_id`, plus `entitlement_expires_at`,
`entitlement_observed_at` and `entitlement_observation_ref` for the lease (§4.9). The rules:

- The tower owns the entire role set of a managed principal: its legacy role, every workspace-wide row and every
  team-scoped row. Nothing granted locally survives the next sync.
- Unmanaged principals are never touched by the managed writer or the managed checks. They keep upstream
  behaviour plus the fork-UI writers.
- Plan 20 inserts the registry row in the same transaction as the first `applyManagedRoleSet`. To stop managing
  a principal, plan 20 applies the final state (or `denyPrincipal`) first and then deletes the registry row.

**Provenance.** `fork_role_assignment_sources(assignment_id PK → principal_role_assignments.id ON DELETE
CASCADE, source, bundle_keys, sync_run_id)` is the only provenance table. Plan 20's `fork_tower_assignments` is
dropped, because the desired state lives in the tower and is recomputed on every sync.

- `source = 'tower'`: written by `applyManagedRoleSet`. **Every** row a managed principal holds must carry it.
- `source = 'fork_ui'`: written by the local writer for unmanaged principals.
- No provenance row: written by upstream (invite, role change, role-delete reassignment
  `role.service.ts:464`, seed backfill).
- An upstream replace-all deletes and re-inserts rows (`principal.factory.ts:365,388`), so the provenance row
  cascades away with the old row. A managed row without tower provenance is itself the drift signal.

**The managed writer.**

```ts
applyManagedRoleSet(
  principalId: PrincipalId,
  desired: {
    legacyRole: 'admin' | 'member' | 'user'
    workspaceRoles: { roleId: RoleId; bundleKeys: string[] }[]            // team_id IS NULL
    teamScopedRoles: { teamId: TeamId; roleId: RoleId; bundleKeys: string[] }[]
  },
  source: { kind: 'tower'; syncRunId: string; grantorPrincipalId: PrincipalId }, // tower.sync_principal_id
  opts?: { executor?: Tx }            // caller's transaction (plan 20 adds tier membership via plan 30)
): Promise<{ applied: Diff; driftReverted: DriftItem[]; denied: boolean; cacheKeysToBust: string[] }>
```

1. **Validate `desired`**, refusing with `INVALID_DESIRED` when the input breaks one of these rules:
   - `user` ⇔ both sets are empty.
   - `admin` ⇒ `workspaceRoles` is empty (the Owner preset rides the legacy role) and `teamScopedRoles` may be
     non-empty.
   - `member` ⇒ at least one set is non-empty, and neither set contains a system preset (the tower never grants
     Manager). Team roles must pass the §4.4 "has scopable keys" rule.
2. **Lock** in upstream's order, which avoids a lock-order inversion with a concurrent `setPrincipalRole`:
   `pg_advisory_xact_lock(7061636)` (`principal.factory.ts:277`), then `SELECT … FROM principal WHERE id = $1
   FOR UPDATE` (`:320`). Both locks are re-entrant within the transaction when `setPrincipalRole` takes them
   again in step 5.
3. **Refuse** with `NOT_MANAGED` when there is no registry row. When an active `fork_principal_denials` row
   exists (§4.9), replace `desired` with `{ user, [], [] }` and return `denied: true`, so a stale sync run can
   never re-grant a disabled person.
4. **Record drift:** a legacy role that differs from the registry's `last_applied_legacy_role`, and every
   existing row without `source = 'tower'` provenance. Report each as `driftReverted`.
5. **Legacy role:** if the current role ≠ `desired.legacyRole`, call upstream
   `setPrincipalRole(ref, desired.legacyRole, { executor, assignRoleId, assignGrantedBy: grantorPrincipalId })`
   (`SetRoleOpts`, `principal.factory.ts:231-245`). `assignRoleId` is the first workspace role, the `no_access`
   sentinel when a `member` has none, and omitted for `admin`/`user`. Using the upstream call keeps its
   last-admin guard, audit and membership sync.
6. **Exact workspace-wide set.** The target is `{Owner preset}` for `admin`, `workspaceRoles ∪ ({no_access} if
   workspaceRoles is empty)` for `member`, and `∅` for `user`. Delete every workspace-wide row not in the target,
   including NULL-grantor Owner/Manager preset rows and local grants. Insert missing rows with
   `granted_by_principal_id = grantorPrincipalId`, except the Owner preset, which stays NULL-grantor as upstream
   writes it. On an existing row that is still desired, set the grantor to the sync principal.
7. **Exact team-scoped set.** Delete every team-scoped row not in `teamScopedRoles`, whatever wrote it, then
   insert the missing ones. The principal row lock serialises every fork writer for this principal, and upstream
   never writes team rows.
8. **Provenance:** upsert `fork_role_assignment_sources` for every surviving row (`source = 'tower'`,
   `bundle_keys`, `sync_run_id`). Update the registry's `last_applied_legacy_role`, `last_applied_at` and
   `last_sync_run_id`.
9. **Audit** one `user.role.changed` row with `{ source: 'tower', syncRunId, diff, driftReverted }`. Return
   `cacheKeysToBust`, which the caller busts after commit. The call is idempotent: a re-run with the same
   `desired` is a no-op diff.

**The local writer** (unmanaged principals only) is used by Phase 2/3 fns and tier assignment. It applies the
same row-diff helper with `source = 'fork_ui'`, touching only the rows the call names. It refuses registry
principals with `TOWER_MANAGED`, and it never leaves a `member` with zero workspace-wide rows.

**Legacy-role changes through upstream UI on a managed principal.** These are not blocked (no seam; 🟡 O-R9).
Examples: the member-role dialog, "remove from team", or a role delete with reassignment. Upstream applies its
replace-all, and the change stays live until the next sync (plan 20's target interval). The next sync reverts it
and reports `drift_reverted` to the tower.

**Fail-closed (R8).** Policy and the checks that prove it:

- **Active + non-empty:** `admin` + Owner row, or `member` + ≥1 workspace-wide row (a template or the
  sentinel), all with tower provenance. Neither the runtime fallback (`permissions.ts:74`, zero rows only) nor
  the seed backfill (`seed-system.ts:136-175`, zero rows only) applies. The seed heal (`:106-133`) only deletes
  NULL-grantor Owner/Manager rows whose legacy role no longer matches, which the writer never leaves.
- **Active + empty:** legacy `user`, zero rows. `user` maps to no preset (`rbac-catalogue.ts:725-729`), backfill
  selects only `admin`/`member` (`seed-system.ts:148-157`), and SSO JIT never promotes it. Plan 20 configures
  `autoProvisionRole = 'user'` with no claim mapping, so `handleAutoProvisionAfter` returns early at
  `auth/hooks.ts:746,750`.
- **Disabled:** legacy `user`, zero rows, plus an active denial (§4.9).
- `canInTeam` never uses the fallback (§4.4).
- **`assertTowerPrincipalsFailClosed()`** returns a violation for any managed principal that meets one of
  these conditions:
  - (a) legacy `admin`/`member` with zero workspace-wide rows;
  - (b) any workspace-wide or team row without `source = 'tower'` provenance;
  - (c) a Manager preset row, or an Owner row while legacy ≠ `admin`;
  - (d) legacy `user` while holding any row;
  - (e) an active denial while legacy ≠ `user`, or while any assignment row, session row, unrevoked
    OAuth token or unrevoked API key created by the principal remains.

  It runs after every sync (plan 20 repairs through `applyManagedRoleSet` / `denyPrincipal`), after every
  `fork-migrate` (after `seedSystemData`), and as a deploy-gate query. (a)–(c) together mean no Manager
  fallback or Manager row is reachable for a managed principal.
- **Remaining window (documented):** between upstream principal creation at a person's first sign-in and the
  first `applyManagedRoleSet`. With `autoProvisionRole = 'user'` that principal is `user` (no preset), so the
  window grants nothing. Plan 20 pre-provisions managed principals before their first sign-in.

### 4.9 Tenant-level denial (D-C16, R2-4, R3-1, R3-2; contract consumed by 20)

Disablement is independent of grants: grants can be re-applied, but a denial blocks every path until it is
lifted explicitly. Module `apps/web/src/lib/server/fork/rbac/denials.ts`.

**The rule (R3-1).** A denial is effective when its row commits, because every place that turns a credential into
a principal checks it: sign-in (TW-2), **existing-session resolution** (R-13, R-14, R-15), MCP OAuth (TW-1) and
API keys (R-1). Deleting sessions, revoking tokens and keys, and demoting the principal are **cleanup**. They
shrink what a bug in a check could expose, but no guarantee depends on them finishing or succeeding.

- **`isPrincipalDenied(principalIds: PrincipalId[]): Promise<boolean>`** and **`isUserDenied(userId)`** (the
  same check resolved through `principal.user_id`) run one indexed SQL statement. It is true when any id has a
  `fork_principal_denials` row with `lifted_at IS NULL` (partial index), or, only when
  `fork_settings['rbac.entitlement_lease'].enabled` (read in the same statement), has a registry row with
  `entitlement_expires_at IS NULL OR entitlement_expires_at <= now()` (the database clock). There is **no**
  Redis or cross-request cache, because a cache would add revocation latency. Results are memoised per request
  only, via upstream's `memoizePerRequest` (`functions/auth-request-cache.ts:52`), which lives for exactly one
  request. The cost is one extra indexed query per authenticated request. On a database error the check
  **fails closed**: the session is treated as absent (401), and the error is logged.
- **`denyPrincipal(principalId, reason, { syncRunId?, actor })`** runs in three stages. `reason` is one of
  `tower_disabled`, `idp_removed`, `tower_deprovisioned`, `lease_expired`. The call is idempotent and returns a
  report.
  1. **Tx 1 (the denial; effective at commit):**
     - Upsert the denial row: `denied_at`, `reason`, `lifted_at = NULL`. From this commit, every check above
       refuses the principal.
     - Cleanup in the same transaction: `DELETE FROM session WHERE user_id = <principal.user_id>` (the same
       statement as upstream `forceSignOutUserFn`, `functions/admin.ts:289-300`), and `UPDATE
       oauth_access_token / oauth_refresh_token SET revoked = now() WHERE user_id = … AND revoked IS NULL`
       (`schema/auth.ts:1046-1120`).
     - Write the audit row `session.revoked.individual` with `reason: 'principal_denied'`.

     Tx 1 takes no upstream role locks, so it commits even when stage 2 is refused.
  2. **Tx 2 (cleanup):** `applyManagedRoleSet(principalId, { user, [], [] })` for a registry principal, or
     `setPrincipalRole(user)` plus deletion of team rows for an unmanaged one.
     - **Last admin.** If this returns `LAST_ADMIN` (`principal.factory.ts:297`: no other `user`-type
       `admin`), the report records `demote_blocked_last_admin`, the ops alert `denial_demote_blocked` fires,
       and `assertTowerPrincipalsFailClosed` (e) keeps reporting it.
     - The denial **still applies on every path**: the principal stays legacy `admin` in the database but
       cannot authenticate anywhere.
     - Plan 20's break-glass admin (legacy `admin`, not tower-managed, created at provisioning) keeps this from
       happening. If ops removed it, they restore it through the provisioner. The sweep retries the demotion,
       and it succeeds once another admin exists.
  3. **Keys (cleanup):** for each `api_keys` row with `created_by_id = principalId` and `revoked_at IS NULL`,
     call upstream `revokeApiKey(id)` (`api-key.service.ts:264-281`). It stamps `revoked_at` and demotes the
     key's service principal to `user`, and `API_KEY_NOT_FOUND` is treated as done. The keys are already refused
     at the Tx 1 commit, because R-1 checks the creator.
- **`liftPrincipalDenial(principalId, { onlyReason? })`** sets `lifted_at`. It restores nothing: roles come back
  only through the next `applyManagedRoleSet`, and sessions come back only through a new sign-in.
- **Entitlement lease (R3-2; optional, 🟡 O-R8, default off).**
  - **What renews it.** Only a recorded **directory observation** renews the lease, never a tenant write.
  - **`recordEntitlementObservation(principalId, { observedAt, observationRef }, { executor })`** is called
    by plan 20's `sync-members` in the same transaction as `applyManagedRoleSet`. It is called only when the
    tower holds a directory observation newer than the tenant's `entitlement_observed_at`.
  - **What counts as an observation.** A successful directory-API poll that covered the person, or a SCIM
    request carrying their full resource, with `active = true` (plan 20 §4.5.4). `observationRef` names the
    poll run and cursor/version, or the SCIM request id.
  - **The update.** `entitlement_observed_at = observedAt`, `entitlement_observation_ref = observationRef` and
    `entitlement_expires_at = GREATEST(entitlement_expires_at, LEAST(observedAt, now()) + lease)`. Clamping to
    `now()` prevents a skewed tower clock from extending the lease.
  - **What does not renew it.** A `sync-members` run that re-applies cached tower state, succeeds or not,
    changes nothing here. `applyManagedRoleSet` never touches the lease.
  - **Lifting.** When the renewal moves `entitlement_expires_at` past `now()`, it also lifts a `lease_expired`
    denial, and only that reason.
  - **First sync.** A new registry row starts with `entitlement_expires_at = NULL`. With the lease on, that
    counts as expired until the first observation is recorded, which the same first sync supplies.
- **Sweep job** `fork-principal-denial-sweep` (shared F-8, every 5 min, per tenant). It is **cleanup only**:
  no bound depends on it.
  - It re-runs stages 1–3 for every active denial. This deletes a session row that a sign-in racing the denial
    inserted (that row was already unusable) and retries a blocked demotion.
  - When the lease is on, it writes `denyPrincipal(p, 'lease_expired')` for every registry principal past
    `entitlement_expires_at`, so its sessions, tokens and roles are cleaned up and the lapse is audited.
  - It emits `fork_denial_sweep` metrics, including `demote_blocked_last_admin` counts.

**Where each check lives** (every path that turns a credential into a principal):

| Auth path | Enforcement | Site / seam |
| --- | --- | --- |
| Every in-process `auth.api.getSession` caller: dashboard/portal `requireAuth`/`getOptionalAuth` (`auth-helpers.ts:61`), `auth/session.ts:43` `getSession` (settings, invitations, onboarding, user, admin, devices, widget-sso, …), `bootstrap.ts:93`, `portal-access.ts:73,270`, `origin-transfer.ts:73`, `integrations/oauth-handlers.ts:172`, uploads (`api/upload/image.ts:20`, `api/portal/upload.ts:9`, `api/widget/upload.ts:12` by Bearer through the `bearer()` plugin), chat stream by session (`api/chat/stream.ts:79`) | The `auth.api` proxy returns `null` from `getSession` when `isUserDenied(result.user.id)`; callers already treat `null` as unauthenticated | **R-13a**, `auth/index.ts` `auth.api` proxy (`:899-911`), `prop === 'getSession'` branch |
| Better Auth HTTP endpoints (`routes/api/auth/$.ts:82,144`, `origin-transfer.ts:55`): `/get-session`, account, email-change, link-social, MCP OAuth `authorize`, and so on | Before delegating, a request carrying a session cookie or `Bearer` resolves its session through the unwrapped instance; a denied user gets 401 (`/sign-out` is let through) | **R-13b**, `auth/index.ts` `auth.handler` (`:912-925`) |
| Widget Bearer (`getWidgetSession`, a direct `session` table read, `functions/widget-auth.ts:59-64`): `requireWidgetAuth`, `getOptionalWidgetAuth`, `functions/uploads.ts:164`, `widget/widget-viewer.ts:18`, `api/widget/session.ts:16`, `api/widget/device.ts:22` | Returns `null` when `isUserDenied(sessionRecord.userId)` | **R-14** |
| Realtime chat stream by signed stream token (`api/chat/stream.ts:63-76`; 2-min HMAC token, no session), and **already-open** streams | Token branch returns `null` when `isPrincipalDenied([row.id])`. The heartbeat's `onAlive` (`:415-423`, every 20 s, `SSE_HEARTBEAT_INTERVAL_MS`) re-checks and tears the stream down | **R-15** |
| New sign-in: SSO, magic link, email OTP, password, recovery code, one-time token | `if (await isUserDenied(sessionData.userId)) return false` before the session row exists | **TW-2** (plan 20), `databaseHooks.session.create.before` (`auth/index.ts:631-641`). Defence in depth: a row inserted by a sign-in that raced the denial, or by a writer that bypasses the hook (`api/widget/identify.ts:138`), is refused on use by R-13/R-14 |
| MCP OAuth JWT | The JWT is verified statelessly and the handler re-reads only `principal.role` (`mcp/handler.ts:90-113`). Denied ⇒ 401 before scope step-up | **TW-1** (plan 20), `mcp/handler.ts` after `:244`, in the same fenced block as R-4 |
| OAuth refresh | Refresh token `revoked` in Tx 1 (cleanup). A JWT minted anyway is refused by TW-1 | `denyPrincipal` + TW-1 |
| API key, REST and MCP-key (`withApiKeyAuth` → `requireApiKey`, used by `mcp/handler.ts:153`) | `requireApiKey` returns `null` (401) when `isPrincipalDenied([apiKey.principalId, apiKey.createdById])` | **R-1** (this plan, extended; `domains/api/auth.ts:72-86`) |

Not session consumers, so they need no check: the anonymous-merge lookup (`auth/identify-merge.ts:38`, anonymous
principals only, which are never managed), and session listing, counting and last-seen reads
(`principal.service.ts:104`, `user.detail.ts:312`, `user.public-profile.ts:337`, `utils/anon-rate-limit.ts:21`,
`functions/settings.ts:130`). In-process calls that use `getAuth()` directly (`functions/contact-email.ts:96,135,
203`, `auth/email-signin.ts:41`, `auth/magic-link-mint.ts:52`) bypass the proxy, but each is preceded by
`requireAuth` or is a sign-in path (TW-2).

**Upgrade dependency (recorded honestly).** R-13…R-15 are correct only while upstream keeps three resolvers: the
`auth.api` proxy / `auth.handler` pair, `getWidgetSession`'s direct read, and the stream-token branch. A fourth
resolver added upstream would bypass denial silently. §9 therefore adds a **resolver guard**, which fails on any
new `auth.api.getSession` bypass, direct `session`-table read by token, `getAuth()` user outside the allowlist,
or new signed principal token. It also adds the **semantic race test** below, run on every upstream sync.

**Revocation bound (one statement, shared with plan 20).**

- **Once the denial commits**, every path above refuses the principal on its next request, and an open SSE
  stream closes within one heartbeat (≤ 20 s). This does not depend on session deletion, demotion or the sweep.
- **Lease off** (default): from disablement in the directory to the denial commit is plan 20's **target**
  (≤ 15 min p99), with no hard maximum.
- **Lease on** (🟡 O-R8): access also ends at `entitlement_expires_at` = the last directory observation of the
  person as active + lease duration. That is at most the lease duration after disablement, even when the
  directory, the tower, the provisioner, `sync-members` or the sweep is down.

## 5. Data model (fork lineage)

`packages/db/drizzle-fork/00NN_fork_rbac.sql` + schema `packages/db/src/fork/schema/rbac.ts`:

**`fork_role_templates`**

| Column | Type | Notes |
| --- | --- | --- |
| `role_id` | `typeIdColumn('role')` **PK** | FK → `roles.id` ON DELETE CASCADE |
| `template_key` | text not null, **unique** | `ux_team`, `dev_team`, `stakeholder_readonly`, `tier1_agent`, `tier2_agent`, `tier3_agent`, `fleet_agent`, `fleet_observer`, `no_access` |
| `template_version` | integer not null | version last applied by install/reconcile |
| `managed_by` | text not null, check in (`local`, `tower`) | `tower` ⇒ always reconciled `exact` |
| `installed_at` | timestamptz not null default now() | |
| `installed_by_principal_id` | `typeIdColumnNullable('principal')` | FK → `principal.id` ON DELETE SET NULL; staff-only → exemption in the fork re-point registry (02 §8, F-5) |

**`fork_role_assignment_sources`**

| Column | Type | Notes |
| --- | --- | --- |
| `assignment_id` | `typeIdColumn('role_asgn')` **PK** | FK → `principal_role_assignments.id` (`schema/rbac.ts:65`) ON DELETE CASCADE |
| `source` | text not null, check in (`tower`, `fork_ui`) | `tower` = `applyManagedRoleSet` only |
| `bundle_keys` | text[] not null default `{}` | tower bundles that want the row (several bundles may want one role) |
| `sync_run_id` | text null | tower sync correlation id |
| `recorded_at` | timestamptz not null default now() | |

**`fork_principal_denials`** (§4.9)

| Column | Type | Notes |
| --- | --- | --- |
| `principal_id` | `typeIdColumn('principal')` **PK** | FK → `principal.id` ON DELETE CASCADE; one current row per principal (history in the audit log) |
| `reason` | text not null, check in (`tower_disabled`, `idp_removed`, `tower_deprovisioned`, `lease_expired`) | |
| `denied_at` | timestamptz not null | |
| `denied_by` | text not null | `sync_run_id`, or `sweep` for the lease |
| `lifted_at` | timestamptz null | NULL = active; partial index `WHERE lifted_at IS NULL` |
| `last_enforced_at` | timestamptz null | last `denyPrincipal` / sweep pass |
| `last_report` | jsonb null | stage 1–3 counts (sessions, tokens, keys, demotion outcome) |

- The managed-principal **registry** is plan 20's `fork_tower_principals` (not duplicated here). This plan
  requires its `principal_id` PK, `last_applied_legacy_role text null`, `last_applied_at` and
  `last_sync_run_id`, and, for the lease (R3-2), `entitlement_expires_at timestamptz null`,
  `entitlement_observed_at timestamptz null` (tower-side time of the directory observation) and
  `entitlement_observation_ref text null` (poll run + cursor/version, or SCIM request id). Only
  `recordEntitlementObservation` writes the three lease columns. Plan 20 adds these columns to its DDL.
- Principal references in `fork_role_assignment_sources` are indirect (via the assignment row), so it needs no
  re-point registry entry: upstream principal merge moves or deletes the assignment, and the cascade follows.
  `fork_principal_denials` references staff principals only, so it gets a re-point registry **exemption**
  (02 §8, F-5), like `fork_role_templates.installed_by_principal_id`.
- No other DDL: team-scoped and multi-role rows use existing `principal_role_assignments` columns.
- `fork_settings` keys: `rbac.key_backfill`, `rbac.teammate_comment_gate`, `rbac.comment_create_backfill`,
  `rbac.team_scoped_enabled`, `rbac.multi_role_enabled`, and `rbac.entitlement_lease` (`{ enabled, durationMinutes }`,
  default off, O-R8). The lease is switched on only by the provisioner, and only after every registry row has an
  `entitlement_observed_at`. Otherwise the NULL rows would read as expired and lock those people out. Phase 1a
  is never gated, because it is a fix.

## 6. Permissions

Registry of **all fork keys** (shared names) — every other v2 plan references this table. Owner/Admin hold
every key by construction (`rbac-catalogue.ts:645-646`).

| Key | Category (→ scope) | Manager | Contributor | Templates | Enforced in | Plan |
| --- | --- | --- | --- | --- | --- | --- |
| `prioritization.score` (new) | feedback (`write:feedback`) | ✗ (fenced admin block) | ✗ | UX Team | fork scoring fns / MCP | 50 |
| `prioritization.manage` (existing, RESERVED) | feedback | ✗ (**moved** into fenced admin block, D-P6; takes effect on next `seedSystemData`) | ✗ | UX Team | framework config | 50 |
| `ticket.escalate` (new) | support (`write:chat`) | ✓ (D-T7) | ✗ | Tier 1/2/3 (**T**) | `canInTeam` in escalation | 30 |
| `account.request` (new) | support (`write:chat`) | ✗ (fenced admin block, D-A4) | ✗ | Tier 1/2/3 (+ **T**) | `canInTeam` | 40 |
| `account.execute` (new; replaces `account.unlock`/`account.create`, D-A6) | support (`write:chat`) | ✗ (fenced admin block, D-A4) | ✗ | Tier 1/2/3 (+ **T**) | `canInTeam` + action `min_tier` vs effective tier (D-A8) | 40 |
| `announcement.view` (new) | status_page (`read:feedback`, `api-key-scopes.ts:226`) | ✓ | ✓ (fenced contributor list) | Fleet Agent, Fleet Observer | fork announcement admin reads; MCP `list_announcements`, `list_announcement_templates` | 60 |
| `announcement.manage` (new) | status_page (`write:feedback`) | ✓ | ✗ | Fleet Agent (D-N8) | fork announcement writes / MCP | 60 |
| `comment.create` (new) | feedback (`write:feedback`) | ✓ | ✓ (fenced contributor list) | UX, Dev, Fleet Agent (not Stakeholder, Fleet Observer, No access) | R-6, R-8, MCP `add_comment` | 10 |

- `FORK_WORKSPACE_ADMIN_PERMISSIONS` = `prioritization.score`, `prioritization.manage`, `account.request`,
  `account.execute`. `ticket.escalate`, `announcement.view` and `announcement.manage` are deliberately **not** in
  it (Manager ✓). `FORK_CONTRIBUTOR_PERMISSIONS` = `comment.create`, `announcement.view`.
- Fork server functions gate `requireAuth({ permission })`: `role.manage` (templates, reconcile, comment-gate
  enable), `member.manage` (team, multi-role and tier assignment through the local writer), `api_key.manage`
  (key backfill). `applyManagedRoleSet`, `denyPrincipal`, `liftPrincipalDenial` and
  `recordEntitlementObservation` are **not** server functions.
  They are called only by the provisioner's `sync-members` (plan 20, root key, scoped DB) and by the sweep job.
  Regenerate `MATRIX.md`.

## 7. Seams (own; catalogue = F-7, settings page = F-4, MCP registration = F-3, fork-only rollout = F-1/F-11)

| # | Upstream file | Change (one-liner) | Why unavoidable | Re-apply on conflict |
| --- | --- | --- | --- | --- |
| R-1 | `apps/web/src/lib/server/domains/api/auth.ts` | In `requireApiKey`: return `null` when `isPrincipalDenied([apiKey.principalId, apiKey.createdById])` (§4.9), then resolve + narrow `permissionsForPrincipal`; read `auth.permissions` at :134/:158 | REST authority and API-key identity (REST and MCP-key) are decided here (X5, D-C16) | Re-apply 4 marked edits; tests "custom-role key denied", "denied creator's key refused" |
| R-2 | `apps/web/src/lib/server/domains/api-keys/api-key.service.ts` | After `createServicePrincipal`: `await forkCopyCreatorAssignments(createdById, sp.id)` | Only point where creator and key principal are both known | Re-insert after the service-principal create |
| R-3 | `apps/web/src/lib/server/mcp/types.ts` | `permissions?: ReadonlySet<PermissionKey>` on `McpAuthContext` | Context must carry the set to tools | Re-add field |
| R-4 | `apps/web/src/lib/server/mcp/handler.ts` | After `resolveAuthContext` (:240): `auth.permissions = await resolveMcpPermissions(auth)`. Plan 20's TW-1 denial check sits in the same fenced block, first. | Single consumer of all context shapes | Re-insert after the call |
| R-5 | `apps/web/src/lib/server/mcp/tools/helpers.ts` | Actors: `permissions: auth.permissions`; `wrapped` in `registerTool`: `forkMcpToolGate(auth, def.name, args)` | Tool guard (with args) + actor construction live here | Re-apply 3 marked lines; run MCP coverage test |
| R-6 | `apps/web/src/lib/server/functions/comments.ts` | First line of `runCreateComment`: `await forkAssertTeammateMayComment(auth)` | Dashboard/portal/widget comment create has no permission gate | Re-insert first line of fn |
| R-8 | `apps/web/src/routes/api/v1/posts/$postId.comments.ts` | After `withApiKeyAuth` in POST (:74): `assertApiPermissions(auth, [COMMENT_CREATE])`; actor at :159 gets `permissions` | REST comment create gates only `comment.moderate`; actor falls back to preset | Re-insert both marked lines |
| R-9 | `apps/web/src/lib/server/domains/api/service-actor.ts` | `permissions: auth.permissions` in `serviceActorFromApiAuth` | Shared REST actor for 13 routes | Re-add property; run REST actor guard |
| R-10 | 10 route files (Appendix A.3) | `permissions: auth.permissions` on each inline service actor | Each builds its own actor; services `can()` on it | Re-add property per literal; REST actor guard lists misses |
| R-11 | `apps/web/src/lib/server/mcp/server.ts` | In `scopeGated` (:33): `forkMcpResourceGate(auth, uri)` after the scope check | Resources are registered outside `registerTool` | Re-insert one call; run resource coverage test |
| R-12 | `apps/web/src/lib/server/functions/tickets.ts` | `assertTicketVisible(ticketId, actor)` before `getTicket` at :128, :368, :772 | By-ID dashboard reads skip `ticketFilter` | Re-insert 3 marked lines; team-scope negative test |
| R-13 (R3-1) | `apps/web/src/lib/server/auth/index.ts` | Two fenced sites (`FORK-SEAM(principal-deny)`). **(a)** In the `auth.api` proxy (`:899-911`), a `getSession` result whose user `isUserDenied` becomes `null`. **(b)** At the top of `auth.handler` (`:912-925`), a request carrying a session cookie or `Bearer` whose session user is denied gets 401 (`/sign-out` excepted). Same file as plan 20's TW-2 (`:631-641`). | Upstream has no session-read hook: `databaseHooks.session` has only create-time hooks here, and there is no `customSession` plugin. The proxy is the one object every in-process `getSession` goes through, and `handler` is the one entry for Better Auth HTTP. | Re-apply both fenced blocks to whatever object upstream exports as `auth`. **Semantic tests on every upgrade** (not only grep): the §9 race test and the resolver guard. |
| R-14 (R3-1) | `apps/web/src/lib/server/functions/widget-auth.ts` | In `getWidgetSession`, after the session lookup (`:59-64`): `if (await isUserDenied(sessionRecord.userId)) return null` | The widget reads the `session` table directly, outside Better Auth, so R-13 never sees it | Re-insert after the lookup. **Semantic test on every upgrade:** a denied user's widget Bearer gets 401. |
| R-15 (R3-1) | `apps/web/src/routes/api/chat/stream.ts` | Two fenced sites: **(a)** in `resolveStreamPrincipal`'s token branch (`:63-76`), `null` when `isPrincipalDenied([row.id])`; **(b)** in the heartbeat's `onAlive` (`:415-423`), re-check and tear the stream down (rate-limited to one check per heartbeat, 20 s) | The stream token is an HMAC with no session behind it, and an open SSE stream is never re-authenticated | Re-insert both. **Semantic test on every upgrade:** a pre-minted token is refused after denial, and an open stream closes within one heartbeat. |

**Total: 14 seam IDs over 23 upstream files, all permanent**:

- R-1…R-5 and R-9…R-12 are Phase 1a (D3).
- R-6 and R-8 are Phase 1b (D-R6).
- R-13…R-15 are Phase 3t (R3-1).
- **R-7 (`seat-usage.ts`) is retired** (D-R1).

The second pass extended R-1 with the denial check. The third review (R3-1) adds **R-13, R-14 and R-15**, the
existing-session resolvers. This is more integration than the second pass estimated ("no auth-helper seam"),
and it is recorded here as such. These three seams, TW-1, TW-2 and R-1 are the denial's upstream dependencies.
Each must be **semantically** tested on every upstream upgrade (§9 merge rehearsal), because a grep for
`FORK-SEAM(principal-deny)` cannot detect a new upstream resolver that bypasses them. The MCP OAuth and
session-create checks are plan 20's TW-1/TW-2, placed as §4.9 specifies. The sweep job registers through shared
F-8. Not seams: fork route
`routes/admin/settings.fork-access.tsx` (via F-4), `mcp/tools/fork-rbac.ts` (via F-3), fork migration,
`MATRIX.md` / mirror regeneration.

## 8. Phases and validation gates

No phase is deferred. Phase 0 templates **do not bind on REST/MCP until 1a ships**, so 0 and 1a release
together.

| Phase | Deliverable | Gate |
| --- | --- | --- |
| **0** Persona templates | `fork_rbac` migration; 9 templates (existing keys only, incl. `no_access`); install + reconcile fns; fork settings page | Install twice → one role per template; installer lacking a key → ceiling error; `exact` reconcile removes an added key, `add_only` reports it. **Ships with 1a.** |
| **1a** Custom-role enforcement | R-1…R-5, R-9…R-12; narrowing; key backfill dry-run/apply; tool + resource specs and coverage tests; REST actor guard | All Appendix A rows tested; Tier 1 via MCP OAuth cannot `get_ticket`/`reply_to_ticket` on a ticket outside its teams, nor via dashboard `getTicketFn`; `triage_post` with `statusId`+`ownerPrincipalId` denied for UX Team (no `post.set_owner`), status-only allowed; a custom role without `member.view` denied `quackback://members`; Tier 1-created key has no `ticket.*`; legacy Owner/Manager keys unchanged (golden REST suite green) |
| **1** Fork keys | F-7 block; §6 keys; `bun run db:permissions`; template reconcile. **Requires Foundations `fork-migrate` → `seedSystemData` (02 §3.3a).** | Per tenant after `fork-migrate`: every `FORK_PERMISSIONS` key present in `permissions`; Manager holds `ticket.escalate`/`announcement.view`/`announcement.manage`/`comment.create`, Contributor holds `comment.create`/`announcement.view`, Manager lacks `account.*`/`prioritization.*` (incl. the moved `prioritization.manage`); `MATRIX.md` regenerated; `scopeForPermission` maps as §6. Fork-only release rehearsed on a populated pooled DB and a suspended-then-resumed tenant. |
| **1b** Comment gate | R-6, R-8; `add_comment` spec; enable fn with one-time grant | Portal user can still comment; Stakeholder and Fleet Observer cannot (dashboard, portal, widget, REST, MCP); pre-existing custom roles still can |
| **2** Team-scoped RBAC | Resolver, `systemRolesForPrincipal`, `canInTeam`, grant/revoke + `assignTierAgentFn` + UI | Team grant on T2 allows `account.execute` only via T2 team; workspace-wide custom-role scopable key is inert; custom-role `member` with no Manager row does **not** get `ticket.escalate` via the system branch; zero-row `member` denied; service principal denied; leaving `team_members` revokes; `permissionsForPrincipal` snapshot unchanged |
| **3** Multi-role + provenance | add/remove fns (local writer, unmanaged only), `fork_role_assignment_sources` + UI | Dev Team + Tier 2 union; an upstream role change clears the extra hats and their provenance but keeps team rows (asserted); the fns refuse a registry principal (`TOWER_MANAGED`); the last row is never removed |
| **3t** Managed principals + denial (ships before plan 20's `sync-members`) | `applyManagedRoleSet`, `denyPrincipal` / `liftPrincipalDenial` / `isPrincipalDenied` / `isUserDenied`, `recordEntitlementObservation`, `fork_principal_denials`, R-1 denial edit, **R-13, R-14, R-15** (session-resolution checks), sweep job (F-8, cleanup only), `assertTowerPrincipalsFailClosed`, resolver guard; plan 20 TW-1/TW-2 at the §4.9 sites | §0b R2-3 and R2-4 and §0c R3-1 and R3-2 acceptance tests pass (the race and lease tests run with the sweep **stopped**). A concurrent upstream `setPrincipalRole` and `applyManagedRoleSet` serialise with no deadlock (same lock order) and no zero-row `member` observed. Apply removes an invite-created Manager row. Apply on a denied principal yields `user`/zero rows. `assertTowerPrincipalsFailClosed` is clean after `seedSystemData` on a populated tenant. |

## 9. Testing strategy

- **Unit (fork `__tests__`):** template table ⊆ catalogue and roll-up (T1 ⊆ T2 ⊆ T3); Stakeholder bundle is
  read verbs only (`READ_VERBS`) and lacks `comment.create`; `resolveMcpPermissions` = narrowed resolved ∩
  scopes; `forkNarrowServicePermissions` truth table (`view_all` present/absent × ticket/conversation × scopable);
  `forkMcpToolGate` per spec kind (base, every-present-field, empty-mutation reject, dispatch incl. unknown
  branch, ownership); `canInTeam` truth table (membership, legacy role, system-role **row** vs legacy `member`,
  zero rows, custom workspace grant, service principal, scopes); `reconcilePersonaTemplate` diff in both modes.
- **Coverage guards:** every `scanAllMcpTools` tool has a spec and every schema argument is classified; every
  `RESOURCE_SCOPES` URI has a resource entry; REST actor guard (every `principalType: 'service'` literal or
  `serviceActorFromApiAuth` call carries `permissions`, audit allowlist explicit); every fork key has a defaults
  row (`WORKSPACE_ADMIN` membership asserted per key); no fork code calls `can()` with a
  `TEAM_SCOPABLE_PERMISSIONS` key; fork server fns appear in the authz matrix with a permission gate.
- **Mandatory negative authorization tests (staff review R1/C2)**, real Postgres:
  - *Direct IDs outside the caller's team:* Tier 1 (OAuth MCP) calls `get_ticket`, `reply_to_ticket`,
    `add_ticket_note`, `link_ticket` with a ticket assigned to another team → not found/forbidden; same ID via
    dashboard `getTicketFn`, `getTicketLinksFn`, `exportTicketTranscriptFn` → denied; Tier 3 → allowed.
  - *Mixed allowed/forbidden mutation fields:* `triage_post({statusId, ownerPrincipalId})` as UX Team → denied
    with `post.set_owner` named and **no** partial write; status-only → allowed; `create_post` with `tagIds` for
    a role lacking `post.set_tags` → denied; `add_comment({isPrivate:true})` without `comment.view_private` →
    denied; REST `PATCH /posts/:id` same matrix via R-1.
  - *Resources:* custom role without `member.view` reading `quackback://members` → denied; with it → allowed;
    `statuses`/`tags` likewise; portal OAuth user behaviour unchanged.
  - *Dispatch:* Stakeholder `search({entity:'changelogs'})` allowed (`changelog.view_draft`); role without
    `changelog.view_draft` denied; `get_details` on a changelog ID likewise.
  - *REST actors:* a custom-role key calling a ticket mutation route whose service checks a key the role lacks
    → denied (proves R-9/R-10 threading); Tier 1-created key → ticket list returns 403/empty (narrowing).
  - *Fail-closed:* a tower-managed principal with all bundles removed is `user` with zero rows and resolves to
    the empty set. It survives `seedSystemData` / `runMigrations` / `fork-migrate` without gaining Manager.
    `assertTowerPrincipalsFailClosed` flags each violation class (a)–(e) of §4.8 when it is made by hand.
  - *Tower owns everything (R2-3):* the §0b R2-3 sequence (local grant → removed at sync; add via tower; remove
    via tower; fork-UI grant refused; upstream legacy-role change → reverted and reported `drift_reverted`;
    seed/migration/reconciliation between every step → no Manager fallback).
  - *Tenant denial (R2-4):* the §0b R2-4 sequence (locally privileged managed user denied mid-session with a live
    cookie session, widget session, MCP JWT + refresh token and a self-created API key; every sign-in method
    refused; sync unavailable with the lease off and on).
  - *Session-resolution denial (R3-1), sweep worker stopped throughout:*
    1. Hold a sign-in (SSO callback, and separately OTP) between TW-2's check and the session insert, using a
       test barrier in the hook.
    2. Commit `denyPrincipal(Q)`, then release the insert, so a session row now exists.
    3. Immediately send, with that session:
       - a portal write (`createCommentFn` with the cookie);
       - a dashboard `requireAuth` server fn;
       - `GET /api/auth/get-session`;
       - a portal upload and a dashboard image upload;
       - a widget Bearer call (`requireWidgetAuth`), the same token on `POST /api/widget/upload` (the `bearer()`
         path), and a widget session minted by `api/widget/identify` (hook bypass);
       - a chat-stream handshake by cookie and by a stream token minted before the denial.

       Every one is refused (401 or `null` context), and no side effect is written.
    4. An SSE stream opened before the denial closes within one heartbeat.
    5. **Last admin:** remove the break-glass admin so Q (legacy `admin`) is the last admin, then repeat. Tx 2
       reports `demote_blocked_last_admin`, `denial_demote_blocked` alerts, Q stays `admin` in the database, and
       every request above is still refused.
    6. Restore an admin. The next sweep demotes Q.
  - *Lease freshness (R3-2), sweep worker stopped:*
    1. Turn the lease on (60 min) and record an observation at T0.
    2. Stop the directory poll and SCIM, and keep `sync-members` succeeding every 15 min for 90 min.
    3. `entitlement_expires_at` stays `T0 + 60 min` throughout. At `T0 + 60 min` every path (dashboard, portal,
       widget, stream, MCP JWT, API key, new sign-in) is refused, with no `lease_expired` row written yet.
    4. Resume the poll. The next `sync-members` sets `T_poll + 60 min`, and access returns after a new sign-in.
       Unit checks:
       - an observation older than `entitlement_observed_at` is a no-op;
       - a future `observedAt` is clamped to `now()`;
       - `applyManagedRoleSet` alone never changes the lease columns.
- **Integration (real Postgres, `QUACKBACK_TENANCY=single` and `pooled`):** REST + MCP (OAuth and key) matrix for
  Owner / Manager / Contributor / Tier 1 / Stakeholder / Fleet Observer; comment create across all five paths;
  key backfill dry-run vs apply; comment-gate one-time grant; role delete cascading team grants; upstream role
  change clearing extra hats; fork-only release reaching every pooled tenant's catalogue.
- **Regression:** upstream suites for `api/auth`, `mcp/handler`, `mcp/server`, `role.service`, `comments`,
  `functions/tickets` pass unchanged except where a seam intentionally changes behaviour.
- **Merge rehearsal:** after each upstream sync, run the MCP tool/argument/resource coverage tests and the REST
  actor guard first — the canaries for new upstream surfaces; check the 6 `isNull(teamId)` filters, the service
  bypass lines (`policy/tickets.ts:48`, `policy/conversations.ts:38`), `canViewConversation` semantics and the
  zero-row fallback (`permissions.ts:74`) / seed backfill (`seed-system.ts:136-175`) are unchanged (D-R9).
  Also re-verify the upstream behaviours the managed writer and the denial depend on (contract tests):
  `setPrincipalRole` lock order (`principal.factory.ts:277,320`) and replace-all; the absence of new
  assignment writers beyond `principal.factory.ts:365,388`, `role.service.ts:464` and
  `seed-system.ts:122,174` (a grep guard fails on a new one); sessions stored in the database with no cookie
  cache; the MCP OAuth path still not consulting token rows; and `databaseHooks.session.create.before`
  still aborting on `false`.
  **Denial resolver guard and semantic tests (R3-1), run on every upstream sync.**
  - A static guard fails on any of these:
    - an `auth.api.getSession` equivalent reached without the R-13 proxy (e.g. `getAuth().api.getSession`
      outside `auth/index.ts`);
    - a `getAuth()` caller outside the §4.9 allowlist;
    - a new `db.query.session` / `.from(session)` read keyed by token or by the request's cookie outside
      `widget-auth.ts` (R-14) and the allowlisted non-auth reads;
    - a new signed principal token, i.e. a `createHmac` over a principal id that is verified on a request
      path, beyond `realtime/stream-token.ts`.

    R-13 filters by user id after the lookup, so it holds even if upstream later adds a session cookie cache.
    Only the cleanup ("row deleted ⇒ no session") would weaken.
  - The R3-1 race test above then runs against the merged tree. A grep for `FORK-SEAM(principal-deny)` is
    necessary but not sufficient.

## 10. Open items

- **D-C5 (🟡, still open)** Confirm default fleet → tenant mapping (`owner → Admin`, `agent → Fleet Agent`,
  `observer → Fleet Observer`); seeds only, per D-C9.
- **O-R3 (🟡)** Owner and Admin hold every permission by design, so "only the UX team scores" means UX Team +
  Owner/Admin — accept? *Default: accept (no fork-side exclusion).*
- **O-R4 (🟡)** Dev Team changelog: upstream's single `changelog.manage` covers create, edit **and** publish
  (`functions/changelog.ts:58,98`) — give Dev Team full publish, or leave changelog out of Dev Team? *Default:
  full `changelog.manage`.* (A draft-only split would need a fork `changelog.publish` key and seams in
  `functions/changelog.ts` and `routes/api/v1/changelog/*`.)
- **O-R5 (🟡)** Strict read-only teammates (Stakeholder, Fleet Observer) can still vote and add emoji
  reactions — keep allowing that? *Default: yes, allowed.*
- **O-R6 (🟡, new)** Should an API key created by a team-restricted agent (e.g. Tier 1) be able to read and act on
  its creator's teams' tickets and conversations (needs a seam in upstream's ticket/conversation visibility
  filters), or do keys stay workspace-wide and simply carry no ticket/conversation access unless the creator
  can see all of them? *Default: workspace-wide keys, no ticket/conversation access for team-restricted
  creators.*
- **O-R7 (🟡, new)** Upstream lets any teammate with `conversation.view` open **any** conversation by ID
  (lists are team-filtered); tickets are team-filtered by ID after R-12. Keep upstream's conversation behaviour
  for Tier agents? *Default: keep upstream (no seam in `policy/conversation.ts`).*
- **O-R8 (🟡, still open)** Turn on the tenant-side entitlement lease?
  - With it on, a managed person loses app access when no **directory observation** has shown them active for
    the lease duration. Tenant syncs of cached state do not count (R3-2).
  - This makes "last directory observation + lease" a hard maximum, enforced on every request whether or not
    the sweep runs. That is at most the lease duration after disablement.
  - The cost: a directory, tower or provisioner outage longer than the lease locks every managed person out.
    The unmanaged break-glass admin is unaffected.

  *Default: off (15-minute target only, alarm on stale sync); if turned on, 4 hours.*
- **O-R10 (🟡, new, R3-2)** With the lease on, only a directory-API poll (or a full-resource SCIM request)
  renews it, so a deployment with SCIM push only and no poll could never renew people whose state did not
  change. Require the directory poll whenever the lease is on? *Default: yes. Plan 20's `verify` refuses to
  enable the lease without a healthy poll.*
- **O-R9 (🟡, new)** Should app admins be **blocked** from changing a tower-managed person's role in the app?
  Blocking needs a new seam in `setPrincipalRole`. Without it, the change is allowed and reverted at the next
  sync. *Default: allow, revert at next sync, report `drift_reverted`.*
- **O6** Onboarding checklist legacy resolution (`functions/admin.ts:397`) left as-is (non-security).

## 11. Relationship to other v2 plans

- **02 foundations:** Phase 1 depends on `fork-migrate` running `seedSystemData` after fork SQL (02 §3.3a) and on
  the fork image contents (F-11); this plan's deploy gate queries run after it.
- **30 tiered support:** consumes Phase 2 (`canInTeam`, team-scoped `ticket.escalate`, `assignTierAgentFn`);
  Phase 2 ships first (D-T4). Manager (a real Manager **row**) holds `ticket.escalate` (D-T7). Tier templates are
  starting bundles; 30 owns tier semantics (roll-up, top tier). R-12 gives tier agents team-scoped ticket reads
  by ID on the dashboard.
- **40 account actions:** consumes `account.request` / `account.execute` (generic, D-A6) and `canInTeam`
  (service principals never pass); owns `min_tier` gating and effective tier (D-A8), approver rules (D-A3),
  Manager exclusion (D-A4).
- **50 prioritization:** `prioritization.score` (UX Team only) and `prioritization.manage` (admin-only + UX Team)
  defaults defined here (D-P6).
- **60 announcements:** `announcement.view` (Manager, Contributor, Fleet Agent, Fleet Observer) and
  `announcement.manage` (Manager ✓, Fleet Agent template ✓, D-N8).
- **20 control tower:** relies on Phase 1a (tower acts through tenant MCP with human OAuth tokens, D-C2);
  configurable bundles map to tenant templates via `template_key` (§4.7, D-C9). Plan 20 builds role sync on
  `fork_install_persona_roles` (`exact`), `applyManagedRoleSet` (whole role set, D-C15) and
  `assertTowerPrincipalsFailClosed` (§4.8), and builds disablement on `denyPrincipal` / `liftPrincipalDenial`
  (§4.9, D-C16). Plan 20 calls `recordEntitlementObservation` with a directory observation only, never on a bare
  tenant write (R3-2). Plan 20 owns the registry `fork_tower_principals` (adding the columns listed in §5), seams
  TW-1 (MCP handler, same block as R-4) and TW-2 (at `databaseHooks.session.create.before`), the directory sync,
  the directory observations and the revocation budget. This plan owns the existing-session checks R-13…R-15 and
  the single revocation bound in §4.9, which plan 20 cites unchanged. Plan 20 drops `fork_tower_assignments`.

## Appendix A — Authorization inventory (Phase 1a; verified at `eb79147`)

"Team callers" = legacy `admin|member`. Keys listed are what the fork gate requires **in addition** to the
upstream scope/`teamOnly`/feature guards, which stay. ✚ = argument-dependent; ◆ = object check added by the
fork.

### A.1 MCP tools (`mcp/tools/*.ts`)

| Tool | Today | Fork requirement |
| --- | --- | --- |
| `search` | per-branch scope + team (`search.ts:173-196`) | dispatch `entity`: `posts → post.view_private`; `changelogs → changelog.view_draft`; `articles → none` (no read key; upstream team check stays) |
| `get_details` | per-prefix scope + team (`search.ts:217-276`) | dispatch prefix: `post → post.view_private`; `changelog → changelog.view_draft`; `article`/`kb_article`/`kb_category → none`; unknown → deny |
| `triage_post` | scope + team; `updatePost` with attribution only (`posts.ts:163-176`) | ✚ `statusId → post.set_status`, `tagIds → post.set_tags`, `ownerPrincipalId → post.set_owner`; all present required; none present → reject |
| `vote_post` | scope; `assertPostVotable` | `none` (O-R5) |
| `proxy_vote` | scope + team | `post.vote_on_behalf` |
| `create_post` | scope (portal users too); board gate via `mcpMemberActor` | `post.create`; ✚ `statusId → post.set_status`, `tagIds → post.set_tags` |
| `merge_post`, `unmerge_post` | scope + team | `post.merge` |
| `delete_post`, `restore_post` | scope + team | `post.delete` |
| `get_post_activity` | scope + team | `post.view_private` |
| `add_comment` | scope; `createComment` policy (`comments.ts:107-130`) | `comment.create`; ✚ `isPrivate → comment.view_private` |
| `update_comment` | scope; `assertCommentViewable` | `comment.create`; ◆ non-author → `comment.edit` |
| `delete_comment` | scope; `assertCommentViewable`; service checks legacy role (`comment.service.ts:433-436`) | `comment.create`; ◆ non-author → `comment.moderate` |
| `react_to_comment` | scope; `canViewPost` | `none` (O-R5) |
| `create_changelog`, `update_changelog`, `delete_changelog` | scope + team | `changelog.manage` (publish included, O-R4); `update_changelog` with no field → reject |
| `accept_suggestion`, `dismiss_suggestion`, `restore_suggestion` | scope + team | `suggestion.manage` |
| `create_article`, `update_article`, `delete_article`, `manage_category` | feature + scope + team | `help_center.manage` |
| `list_conversations` | scope + team; `conversationFilter` | `conversation.view` |
| `get_conversation` | `assertConversationViewable` | `conversation.view` (object rule = upstream, O-R7) |
| `reply_to_conversation` | scope + team; service policy | `conversation.reply` |
| `suggest_post`, `share_post` | `canActAsAgent` (`conversation.cards.ts:105`) | `conversation.reply` (matches `sharePostFn`, `functions/conversation.ts:1216`) |
| `set_conversation_status` | scope + team | `conversation.set_status` |
| `list_tickets` | scope + team; `ticketFilter` | `ticket.view` |
| `get_ticket` | scope + team; **no actor** (`tickets.ts:174-178`) | `ticket.view`; ◆ `assertTicketVisible(ticketId)` |
| `create_ticket` | scope + team; service `assertCan` | `ticket.create` |
| `reply_to_ticket` | `assertCan(TICKET_REPLY)`; `loadTicketOr404` (`ticket-message.service.ts:263,409`) | `ticket.reply`; ◆ `assertTicketVisible` |
| `add_ticket_note` | `assertCan(TICKET_NOTE)` (`:485`) | `ticket.note`; ◆ `assertTicketVisible` |
| `link_ticket`, `unlink_ticket` | scope + team; `loadTicketOr404` both (`ticket-links.service.ts:47-48`) | `ticket.assign` (matches dashboard, `functions/tickets.ts:378,389`); ◆ both IDs visible |
| `widget_install_status` | scope + team | `integration.view` |
| `list_announcements`, `list_announcement_templates` (fork, 60, via F-3) | `read:feedback` + team | `announcement.view` |
| announcement write tools (fork, 60) | `write:feedback` + team | `announcement.manage` |
| `list_post_prioritization` (fork, 50, via F-3) | `read:feedback` + team | `post.view_private` |
| other fork tools (`fork_*`, via F-3) | — | declared with their spec at registration; the coverage test covers them like upstream tools |

### A.2 MCP resources (`mcp/server.ts`, R-11)

| URI | Today | Fork requirement (team callers) |
| --- | --- | --- |
| `quackback://boards` | scope only (`:69-81`) | `none` |
| `quackback://statuses` | scope only (`:83-95`) | `status.view` |
| `quackback://tags` | scope only (`:97-109`) | `tag.view` |
| `quackback://roadmaps` | scope only (`:111-123`) | `none` (D-R5) |
| `quackback://members` | scope only, no team check (`:125-136`) | `member.view` |
| `quackback://help-center/categories` | scope + feature + team (`:139-190`) | `none` |

### A.3 REST actors and gates (`routes/api/v1/**`)

| Site | Today | Fork change |
| --- | --- | --- |
| `withApiKeyAuth` / `assertApiPermissions` (`domains/api/auth.ts:134,158`) | legacy preset | R-1: resolved + narrowed set |
| `serviceActorFromApiAuth` (`domains/api/service-actor.ts:16`) — used by `tickets/index.ts` (POST :124), `tickets/$ticketId.{assign,status,priority,reply,note}.ts`, `conversations/$conversationId.{status,read,note,priority,assign,tags,reply}.ts` | no `permissions` | R-9 |
| `tickets/index.ts:66` (GET list) | inline, no `permissions` | R-10 |
| `posts/index.ts:216` (`createPost`) | inline | R-10 |
| `status/summary.ts:31` | inline | R-10 |
| `conversations/$conversationId.ts:28`, `conversations/index.ts:32`, `conversations/$conversationId.messages.ts:36` | inline | R-10 |
| `apps/boards.ts:25`, `apps/search.ts:33`, `apps/suggest.ts:31`, `apps/posts.ts:79` | inline | R-10 |
| `posts/$postId.comments.ts:159` (`createComment`) | inline | R-8 |
| `users/identify.ts:56`, `segments/$slug.members.ts:91,139`, `moderation/-audit.ts:15` | audit attribution | none (guard allowlist) |
| Ticket/conversation row scope for keys | service bypass (`policy/tickets.ts:48`, `policy/conversations.ts:38`) | narrowing (§4.3 item 3), O-R6 |

### A.4 Dashboard by-ID ticket reads (`functions/tickets.ts`, R-12)

| Fn | Today | Fork change |
| --- | --- | --- |
| `getTicketFn` (`:124-129`) | `ticket.view` only; `getTicket(id)` | ◆ `assertTicketVisible` |
| `getTicketLinksFn` (`:360-368`) | `ticket.view` only | ◆ `assertTicketVisible` |
| `exportTicketTranscriptFn` (`:762-772`) | `ticket.view` + team role | ◆ `assertTicketVisible` |
