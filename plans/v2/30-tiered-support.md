# Tiered Support (Tier 1/2/3) + Support Hub — v2 Design Plan

> **Status:** v2 (round 2 + staff review, `03-staff-review.md` + intranet revision, `04-intranet-deployment.md` + second-pass
> review, `REVIEW-2026-09-19-SECOND-PASS.md` R2-5/R2-6) — supersedes
> `plans/v1/tiered-support-helpdesk-plan.md`. Plan only; nothing is implemented.
> **Depends on:** Foundations (fork migration lineage, `fork_settings`, shared seams F-1…F-8, F-10, `SEAMS.md`; F-12 indirectly, because saving the intranet IdP needs it);
> `10-rbac-persona-extensions.md` Phase 1a (custom roles on REST/MCP) and Phase 2 (team-scoped RBAC, `canInTeam`) (D-T4);
> the `04-intranet-deployment.md` §3 baseline (SSO-only portal sign-in, IMAP inbound, SMTP outbound).
> **Decisions applied:** D1, D2, D3, D4, D-T1 … D-T14, D-A8 (tier roll-up), D-A11 (account-action escalation), D-E1 … D-E4
> (intranet-only, no egress, public portals with anonymous off and SSO-only sign-in, employee requesters; D-E3 supersedes
> D-N5). D-T8 is 🟡 (default adopted, flagged). D-T11 is decided: option B (hub landing + links).
> Baseline: upstream `780a7b577`. Claims that are new in round 2 were checked against `92fb29335`; claims new in the staff-review
> revision were checked against `eb7914767`; claims new in the intranet revision were checked against the current checkout
> (`d23ceb673`); second-pass claims were checked against the current checkout on 2026-09-19.
> **Conventions:** `02-fork-conventions.md` is binding.

## Round-2 changes

| Change | Driver |
| --- | --- |
| T1 intake by workflow is confirmed. Enabling tiered support now **requires** workspace auto-routing to be off (§4.6). OI-1 closed. | D-T5 ✅ |
| Seam T-1 (escalator keeps read access while watching) is approved. The sign-off caveats are removed and OI-10 is closed. | D-T6 ✅ |
| Managers hold `ticket.escalate` workspace-wide. It is **not** in the `WORKSPACE_ADMIN_PERMISSIONS` exclusion. OI-3 closed. | D-T7 ✅ |
| De-escalation is allowed only for agents on the tier that currently holds the ticket, with roll-up applied (§4.2 step 3). OI-4 closed. The remaining question is tracked under D-T8. | D-T8 🟡 |
| No automatic de-escalation. | D-T9 ✅ |
| Everything starts at T1. There is no skills or attribute routing and no intake to T2/T3. OI-11 removed. | D-T10 ✅ |
| The hub is **option B**: a landing page that runs find an answer → still need help → track → rate, with the announcements strip at the top. A widget Home section links into the existing pages. Option A is recorded as a rejected alternative (§4.10). OI-5 closed. | D-T11 ✅ (coordinator) |
| Signed-out and email-only requesters use the hub through passwordless sign-in. They can reach **only their own requests**, even on private portals (§4.11). OI-6 closed. | D-T12 ✅, D-N5 |
| Channels phase and OI-7 removed. | D-T13 ✅ |
| The balanced-distribution limitation is accepted. OI-8 closed. | D-T14 ✅ |
| `assignTierAgent` / `removeTierAgent` domain service (membership + workspace-wide Tier role + team-scoped grant), exposed to 10's `assignTierAgentFn` and to 20's `sync-members` via fork MCP tools (§4.12). | coordinator (20, 10) |
| **Effective tier** is defined (highest tier across a principal's tier-team memberships). `listTierMemberships(principalId)` → `[{teamId, tier}]` is exported for 40's per-team checks, with `getEffectiveTier` as a convenience built on it (§4.1). A top-tier agent's Escalate is a disabled no-op. | D-A8 ✅ |
| §4.2 now matches the §11 contract: `escalateTicket` performs no permission check. Callers authorize (`escalateTicketFn` → `assertCanEscalate`; 40 → `account.request`). | coordinator |
| The `escalateTicket` contract (§11) keeps `source: 'account_action'` and adds `targetTier` so that 40 can move the ticket to the tier that can approve. | D-A11 ✅ |
| Principal re-point is handled by the conventions §8 / F-5 registry (exemptions only). OI-9 closed. | 02 §8 |
| The Tiers settings page registers through **F-4**, so it is no longer an own seam (S3 dropped). The MCP tool registers through F-3. | 02 §10 |
| OI-2 is closed by 10's design: team-scoped rows are invisible to `requireAuth({permission})`, so `escalateTicketFn` gates on `ticket.view` and the service calls `canInTeam` (§6). | 10 §4.4 |
| Seam IDs are aligned with `SEAMS.md` (S1→T-1, S2→T-2). | — |

Rows above that the staff review changed (the auto-routing warning banner, the `setTeamMembers` membership write, the
`mergeLeadIntoUser` claim, the sequential escalation steps) are superseded by the table below. The D-T12 row (passwordless
sign-in, private portals) is superseded by the intranet table. The body reflects the current design only.

## Staff-review changes

| Finding ID | Change | Where in plan |
| --- | --- | --- |
| T1 | The hub no longer calls `mergeLeadIntoUser`: it rejects `!lead.userId` (`user.merge.ts:61`) and tears down a user identity, and cold-inbound leads have **no** user row (`conversation.email-cold-inbound.ts:118,139`). A fork **claim service** `claimRequesterLeads` re-points each standalone lead in one transaction through the upstream registry (`repointPrincipalActivity`, `principal-repoint.ts:552`, which also runs fork steps via F-5), then does a **principal-only** teardown (`DELETE principal WHERE id=lead AND type='anonymous' AND user_id IS NULL`). It requires a verified session email (inbox proof), exact normalized address match, `FOR UPDATE` on lead rows (concurrent claims serialize; a loser finds nothing), and keeps provenance: `unverifiedSender` stays on the conversation row, and the block transfers through the registry's `blocked_at` fill-if-empty step (`:420`). A **blocked** lead is kept as an activity-free **block anchor**, so later weak-DMARC mail from the address still reuses a blocked lead. The upstream helper is unchanged, and leads with a `userId` (widget pre-chat emails) are never claimed. Tests cover the OTP and magic-link paths. | §3, §4.11 step 3, §5, §9, §10 |
| T2 | *(Worker ownership, conversion, agent pick, effect dedup and ordering superseded by R2-5; see the second-pass table.)* Escalation is rewritten as a **durable operation**. First, **before any mutation**, it claims an operation row (ledger, `state='claimed'`), keyed `UNIQUE (subject_key, idempotency_key)` by the **required, caller-supplied** key; one un-applied operation is allowed per subject. Conversion (if needed) and the agent pick are persisted on that row. The state change then runs in **one transaction**: `SELECT … FOR UPDATE` on the ticket (then the paired conversation) row, a CAS on `expectedFromTeamId`, conditional `UPDATE`s of team and agent on both rows through fork primitives, and `state='applied'` with pre-images and a pending-effects list. Side effects (realtime, events, activity, SLA, attribute, note, watcher, system messages) then run from that outbox. Each is idempotent or deduplicated and is marked done individually. A retry with the same key **resumes** the same operation, and an F-8 sweep resumes stranded operations. Upstream writers that run concurrently block on the row lock and commit **after** the escalation; their hook (T3) records them. The escalation never calls `assignTicket`/`assignTeam`, so it never re-distributes and never stamps `firstResponseAt`. Mandatory tests: kill/retry at every step, and two competing escalations. | §4.2, §5, §7, §9 |
| T3 | *(The pre-hook/post-hook design and the `updated_at` reconciliation superseded by R2-6; see the second-pass table.)* **Every team-assignment path goes through one invariant.** Seams T-8 (`assignTicket`) and T-9 (`assignTeam`) call fork hooks. A pre-hook skips an **automated** (service-actor) team move that would lower a ticket's tier (D-T9) or undo an escalation, which covers delayed intake workflows. A post-hook writes a ledger row (`source='assignment'`) and **syncs the pair** so ticket team = conversation team, using the same locked fork primitive. The §4.1 fallback now applies only to ticket-less conversations. **Auto-routing is enforced off** by seam T-11 in `updateConversationRouting` (refuse, with a verify-after-write check), not just a warning. **Intake:** enabling requires a designated T1 intake team and turns on the seeded workflows. An F-8 intake sweep assigns unpaired and manual/API customer tickets with no team to the intake team. Back-office and tracker tickets stay untiered unless someone assigns them. **First response:** escalation does not count (default 🟡). The fork primitives never stamp `firstResponseAt`; ordinary upstream `assignTicket` keeps its behaviour (`ticket.service.ts:774`). Every tier change, including conversation-only changes before conversion, lands in the ledger, which becomes the source for per-tier metrics. | §4.1, §4.2, §4.6, §4.7, §5, §7, §9, §10 |
| X-1 | Tier membership no longer calls the replace-set `setTeamMembers` (`team.service.ts:205`). `assignTierAgent` / `removeTierAgent` use **atomic single-row** fork SQL: `INSERT … ON CONFLICT DO NOTHING` on `team_members_principal_team_uq`, and `DELETE … WHERE team_id AND principal_id`, with upstream's teammate validation replicated. A stale replace-set save from upstream's team UI can still drop a member (upstream's lost-update). The tier reconciliation (§4.12) repairs the grants when that happens. | §4.12, §9 |
| X-2 | Tiers are limited to **1–3** in v1 (`CHECK tier BETWEEN 1 AND 3`), matching the three Tier templates. `resolveTeamForTier` and the `targetTier` / `min_tier` contract reject values outside 1–3. | §4.1, §5, §11 |
| X-3 | **"Read access while watching" is read-only after handoff.** A write guard (`forkAssertTicketWritable`) is placed in the ticket writers (T-8: status, priority, assign, delete; T-10: agent reply and note in `insertTicketMessage`). It refuses a human actor who does not hold `ticket.view_all`, is not the assignee, is not on the assigned team, and whose only access is the escalator-watch term, once their operation's effects are done. The plan also states the limit: upstream ticket writers check permission only, not row scope, and `canViewConversation` already allows deep-links across teams. **Team queues are therefore not strict isolation.** Conversation-side writes on the pair stay a routing convention. | §4.5, §6, §7, §9 |
| X-6 | Coordination notes addressed to other plans were removed. Seam IDs now follow `SEAMS.md` (T-3 signup-policy, T-4 locales, T-5 widget, T-6 header; the classifications spread is shared seam F-10; T-7… later phases). New seams start at T-8. | §4.8, §7, §11 |
| X-7 | Deferred phases (6 automation, 8 stage email) and the hidden "Find an answer" section for ungranted requesters are labelled as **not** delivering the full capability. | §2, §4.10, §8 |
| Owner Q (OI-15) | Hiding "Find an answer" in the UI does not secure `/api/widget/kb-ask`, which checks only the `helpCenter` flag (`kb-ask.ts:141-145`) and never checks portal access. Seam **T-12** adds a private-portal gate there (`forkKbAskAllowed`), shipped with Phase 7b. | §4.10, §4.11 step 8, §7 |

The intranet revision keeps T1 (the claim service and its provenance rules), T2, T3, X-1, X-2 and X-3 unchanged. It
supersedes the OTP/magic-link parts of T1, the T-3 and T-6 entries of X-6, the "hidden Find an answer" part of X-7, and the
OI-15 row (T-12). See the next table.

## Intranet changes (D-E1…D-E6)

| Change | Decision | Where |
| --- | --- | --- |
| Hub users sign in with **SSO only**, through the portal's standard sign-in prompt. The hub has no email form, magic link or 6-digit code. | D-E1, D-E3 | §3, §4.10, §4.11 step 1 |
| The hub moves **inside `_portal`** (`routes/_portal/hub.tsx`). It sat outside only to escape the private-portal gate. On a public portal `evaluatePortalAccess` grants everyone (`portal-access.ts:151-152`), so the hub now inherits the portal loader's branding, fonts, custom CSS, intl, header and N-1 announcements banner. The fork `_fork-hub` layout, its duplicated branding loader and the separate banner mount are removed. | D-E3 | §4.10 |
| The hub uses the upstream visitor surfaces directly: rows open `/support/$conversationId`, "View all" opens `/support`, and it calls the upstream `getMyConversationsFn`, `createMyTicketFn` and `submitCsatFn`. The `/hub/requests` and `/hub/requests/$id` routes, the fork hub read/write functions and the drift-guard test are removed. | D-E3 | §4.10, §4.11 steps 4–7, §9 |
| **Email-only claim (T1) runs on SSO sign-in.** An employee may have emailed support before their first SSO sign-in (JIT provisioning). The claim now runs from a best-effort call in the sign-in after-hook (**new seam T-13**), and again on each hub load. It uses the address from the company IdP: `emailVerified` asserted by the IdP, **or** the callback provider owns the verified company domain (`findProviderForDomainEmail`, `provider-ids.ts:100`). The principal-only teardown, `FOR UPDATE`, block anchor and `unverifiedSender` provenance are unchanged. | D-E1, D-E4 | §4.11 step 3, §7 |
| **Seam T-3 is removed** (the signup-policy exemption for known requesters). SSO JIT provisioning creates the account (`autoCreateUsers`, `04-…` §3). No email sign-in path is left for T-3 to unlock. | D-E3 | §4.11 step 2, §7 |
| **Seam T-12 is removed** (the kb-ask private-portal gate). Portals are public inside the intranet, and the edge SSO keeps out unauthenticated readers. `kb-ask` does not need an identified visitor. It resolves the viewer from the widget session and falls back to `ANONYMOUS_ACTOR`, which sees only ungated articles (`kb-ask.ts:209-212`, `widget-viewer.ts:16-35`). `allowAnonymous=false` does not change this. | D-E1, D-E3 | §4.10, §7 |
| **OI-15 is closed as moot.** Every signed-in employee has portal access, so "Find an answer" is shown to everyone. | D-E3, D-E4 | §4.10, §10 |
| **Seam T-6 is removed** (the portal-header "Help hub" item). Upstream `portalConfig.nav` already supports admin link items (`portal-header-nav.ts:116-125`, `settings.types.ts:288-313`). Enabling the hub offers "Add Help hub to portal nav", which appends a link item through `updatePortalConfig` (`settings.service.ts:629`). | D-E3 | §4.10, §7, OI-20 |
| **OI-14 is re-framed for the internal mail server.** Upstream's verdict is kept as computed: mail with no `Authentication-Results` header is `unverified` (`email-auth.ts:268-274`), so it creates or reuses a lead with the badge even when the sender already has an account (`conversation.email-cold-inbound.ts:87-99`). The default stays "claim, keep the badge". The deployment note asks the internal MTA to stamp `Authentication-Results` so that mail from existing employees attaches directly. | D-E1, D-E2 | §4.11 step 3, §10 |
| Email (the existing resolution email, deferred Phase 8 stage email) goes through upstream's configured transport: SMTP to the internal relay or the SES SMTP VPC endpoint. Inbound email is IMAP. The fork adds no mail transport, no inbound webhook and no internet call, and hub links use the intranet portal URL. | D-E2 | §4.10, §8 |
| New 🟡 items: OI-19 (accept an IdP address without `email_verified` when the IdP owns the verified domain) and OI-20 (nav link item instead of a localized built-in). | — | §10 |

## Second-pass review changes (`REVIEW-2026-09-19-SECOND-PASS.md`)

The second pass found that a durable operation row did not serialize its workers (R2-5), and that ordinary assignment could
still undo an escalation between a pre-check and an unconditional upstream update (R2-6). This revision replaces the parts
of staff-review rows **T2** (steps 2–5 of the operation, the out-of-transaction agent pick, "find marker, then insert") and
**T3** (the pre-hook/post-hook two-call design and the `updated_at` reconciliation) described below. The 40 contract is kept:
`escalateTicket` takes a required, caller-supplied `idempotencyKey`, and every replay returns the same `escalationId`.

| Finding | Change | Where |
| --- | --- | --- |
| R2-5 (ownership) | **Operation lease with fencing.** Before running any step, a worker claims the operation row with `UPDATE fork_support_escalations SET lease_owner=$w, lease_until=now()+'30 s', lease_token=lease_token+1 WHERE id=$id AND state IN ('claimed','converting') AND (lease_owner IS NULL OR lease_until < now()) RETURNING lease_token`. Request threads (first call and same-key retries) and the recovery job all use this one claim, so only one worker runs a step at a time. Every step commits its writes **and** its state transition in one transaction, and that transition is `UPDATE … WHERE id=$id AND lease_token=$token AND state=$expected`. If it matches 0 rows, the lease was lost and the transaction rolls back. A worker that stalls past its lease therefore cannot commit a step. A same-key replay that cannot claim the lease waits up to 10 s for a terminal state, then throws a retryable `ESCALATION_IN_PROGRESS` error that carries the `escalationId`. It never starts a second operation. A same-key replay with different inputs gets `IDEMPOTENCY_KEY_REUSED` (the row stores `request_hash`). | §4.2 steps 1, 1a; §5 |
| R2-5 (conversion) | **One ticket per operation, durably.** `createTicketCore` opens its own transaction (`ticket-intake.service.ts:196`) and has no `tx` input. **New seam T-14** adds an optional `opts.inTx(tx, ticket)` callback, which runs inside that transaction right after the ticket insert. The fork callback (1) runs `UPDATE fork_support_escalations SET ticket_id=$new, state='converting' WHERE id=$op AND lease_token=$t AND ticket_id IS NULL`, which must match exactly one row; (2) locks the conversation `FOR UPDATE` and inserts the customer pair row into `ticket_conversations`. The 1:1 partial unique indexes reject a conversation that is already paired. Any failure rolls back the ticket. So a committed conversion ticket always has its op row pointing at it, and no orphan ticket is possible. The old JSON marker (`forkEscalationOpId`) and the separate `linkTicketToConversation` call are removed. That call also required `ticket.create` (`ticket-conversation-link.service.ts:103`), which Tier roles do not hold. The link's post-commit tail (the "Ticket created from this conversation" system message, the SLA handoff through exported `handoffConversationSlaToTicket` (`:324`), and the first-response backfill from an earlier agent reply) runs as the once-effect `conversion_tail`. If the conversation is already paired by another path, the op continues on that ticket, and the CAS still applies. | §3, §4.2 step 2, §7 |
| R2-5 (agent pick) | **The pick and the cursor advance commit in the apply transaction.** Upstream `distributeToTeamMember` reads the cursor from an unlocked `Team` object and writes it through `setRoundRobinCursor` in autocommit (`team-distribution.ts:55-56`, `team.service.ts:268-273`), so the escalation no longer calls it. A fork function, `pickTierAgentInTx(tx, teamId)`, does the same thing inside the apply transaction. It runs `SELECT … FROM teams WHERE id=$t FOR UPDATE` and computes candidates with the same exported helpers (`listTeamMemberPrincipalIds`, `listOnlineAgentIds`, `listAvailableAgentIds`, `pickRoundRobin`, `countOpenConversationLoad`, `pickLeastLoaded`). It then writes `teams.rr_cursor_principal_id` and the op row's `chosen_agent_id` in that transaction. A crash before commit rolls back both, and the retry picks again from the unchanged cursor. The "advance once" guarantee therefore **holds** for committed escalations. No seam is needed; a parity test pins the fork pick to upstream's rotation and least-loaded rules. | §4.2 step 3, §9 |
| R2-5 (once-effects) | **Atomic effect claims replace "find marker, then insert".** Effects that are promised once each get a row in `fork_tier_effects (ledger_id, effect)` PK. A runner owns an effect only if its `INSERT … ON CONFLICT DO NOTHING RETURNING` returned a row. It then runs the effect and sets `state='done'`. Only a `started` row older than 2 × the lease is taken over, and only after the new owner checks the effect's marker (`ESC-<id>` in the note, the op id in the system-message metadata). The activity row and the reason attribute are no longer effects at all. They are written **inside** the apply transaction: a direct `ticket_activity` insert, and the same `custom_attributes \|\| jsonb` merge that `setConversationAttribute` performs (`set-attribute.service.ts:175-185`). Upstream `recordTicketActivity` is fire-and-forget (`ticket-activity.service.ts:56-70`), so it cannot report success. **Stated limit:** events, webhooks and realtime stay at-least-once. A note or system message can repeat only if a runner stalls longer than 2 × the lease in the middle of the effect. | §4.2 step 5, §5 |
| R2-5 (ordering) | **Per-pair transition sequence.** New sidecar `fork_tier_pair_state` (one row per ticket/conversation pair) holds `assignment_seq`. Every team transition (escalation apply, hooked assignment, intake, drift repair) increments it under the row lock and stamps the ledger row's `seq`. Effects run under a **pair effects lease**, in ascending `seq`. A **stateful** effect (tier-default SLA, the reason attribute's `attribute_changed` event) at `seq = n` is marked `superseded` if any ledger row of the pair with `seq > n` carries the same effect kind. An older pending SLA or reason effect therefore cannot overwrite a later transition. | §4.2 step 5, §4.7, §5 |
| R2-6 | **Ordinary team assignment is one locked transaction (narrow transactional integration).** T-8 and T-9 no longer bracket upstream's unconditional `UPDATE` with a pre-hook and a later post-hook. In tier mode, they hand the team write to `forkApplyTeamAssignment`. In one transaction, that function locks ticket → conversation → `fork_tier_pair_state` (fixed order; a conversation-side call that finds a ticket after locking restarts, see §4.6). It then re-checks the tier invariant (no automated lowering, and no automated move off a team that an escalation set) against the **locked** current state. It applies upstream's own patch to the written side, mirrors the team onto the other side, increments `assignment_seq`, and inserts the ledger row (`source='assignment'`, `seq`, outbox effects), all before commit. It returns the locked pre-image, so upstream's events use the true "from". With the flag off it returns `null`, and upstream runs unchanged. T-9 also moves the team's member pick into that transaction (`pickTierAgentInTx`). **Recovery no longer uses `updated_at`.** No crash window is left between a team write and its ledger or pair write. The sweep compares each tiered pair with `fork_tier_pair_state.current_team_id` (the last recorded assignment version). Any disagreement comes from an unhooked writer: the sweep raises `TIER_INVARIANT_DRIFT` and restores the recorded version with a new `seq` (it never adopts the unrecorded write). **Stated limit:** a *human* manual move stays an allowed, recorded override (OI-16). A stale human form can still move a ticket after an escalation. | §4.6, §5, §7 (T-8, T-9), §9 |
| Open items | New 🟡 defaults: OI-21 (drift repair restores the recorded team), OI-22 (stale human assigns stay overrides), OI-23 (a residual repeat of a once-effect after a stall longer than 2 × the lease). | §10 |
| Tests | **R2-5 acceptance test (reviewer's, adapted):** race two identical `escalateTicketFn` submits (same key) with the recovery job on a ticket-less conversation, on a round-robin team. Crash (a) right after the T-14 ticket commit, (b) inside the apply transaction after the cursor write, and (c) between an effect's claim and its `done`. Assert: one conversion ticket (and no orphan), one link, one applied move (one ledger row, `seq` +1), the cursor advanced exactly once and matching `chosen_agent_id`, one note, one activity row, one system message. Events are at-least-once. Then run two successive escalations (T1→T2→T3) with the first one's effects held back; the T2 SLA default and reason are marked `superseded` and never overwrite T3's. **R2-6 acceptance test (reviewer's, adapted):** pause a workflow `assign_team` (service actor, target T1) after upstream's no-op check, escalate the pair to T2, then resume the workflow. It returns the current row, and the pair stays on T2 with no ledger row for the skipped move. Repeat through `assignTicket` (REST as a service principal) and bulk. Kill the process inside and immediately after the assignment transaction. Make an unrelated edit (ticket title/priority, which advances `updated_at`) before running the sweep. The pair matches the last recorded `assignment_seq`, and no transition is invented or lost. | §8, §9 |

## 1. Changes from v1

| # | v1 issue (review §3.4 + follow-up) | v2 resolution |
| --- | --- | --- |
| 1 | **Blocker:** tier routing strategy. `RoutingResult` returns an agent only (`routing.types.ts:17-22`). `settings.conversation-routing.ts:17,22,36,58,82` hard-codes `auto_assign_active`. `assignRoutedConversation` (`conversation.service.ts:1454-1474`) only claims the agent column. | **No routing strategy change.** T1 intake is a workflow (`conversation.created` / `assistant.handed_off` → `assign_team` T1 + `apply_sla`) plus a ticket intake sweep (§4.6). Workspace auto-routing is **enforced** off while tiers are on (seam T-11). |
| 2 | Conversation and ticket have separate assignees (`schema/conversation.ts:61,66`; `schema/tickets.ts:112-114`). `assignTicket` (`ticket.service.ts:744-800`) never runs team distribution and is gated by `ticket.assign`. Conversation assignment is gated by `canActAsAgent` (`policy/conversation.ts:55-58`). Balanced distribution counts conversations only. | `escalateTicket` moves **both** sides in one locked transaction through fork primitives. The agent is picked **inside** that transaction by `pickTierAgentInTx`, which applies `distributeToTeamMember`'s rules (`team-distribution.ts:43-66`) and commits the round-robin cursor atomically. Events, realtime and notes are replayed from a durable outbox (§4.2). Ordinary team assignments run as one locked fork transaction through T-8/T-9 (§4.6). The balanced-load limitation is accepted (D-T14). |
| 3 | `applySlaToConversation` resets clocks on re-apply (`sla.service.ts:162-219`), and so does `applySlaToTicket` (`ticket-sla.service.ts:270`). | **D-T1:** escalation never calls either function while an SLA is active (§4.4). Per-tier attainment comes from the tier timeline. |
| 4 | Clearing the agent hides the ticket from a T1 agent who has only `*.view` (`policy/tickets.ts:44-62`, `policy/conversations.ts:36-50`). `assignTeam` never clears the agent (`conversation.service.ts:1573-1576`). | **D-T2/D-T6:** the service replaces or clears the agent explicitly. The escalator is auto-watched, and seam T-1 grants "escalated-by-me AND still watching" visibility, **read-only** after handoff (§4.5). |
| 5 | The `escalate` workflow/macro action was treated as cheap. It is a closed union across about 15 sites, and `MacroAction` has no ticket actions (`schema/macros.ts:38-45`). | Manual escalation ships first. Automated escalation is a later, seam-counted phase (Phase 6). |
| 6 | v1 emitted a new `escalated` event and trigger (`events/CONTRACT.md` §1). | **No new event and no new trigger.** The existing `conversation.assigned`, `ticket.assigned` and `conversation.attribute_changed` events are reused (§4.3). |
| 7 | Columns on `teams`; `origin_tier` on conversations/tickets | Sidecar `fork_team_tiers` plus the ledger `fork_support_escalations` (§5). No upstream schema edits. |
| 8 | Escalation reason stored in an ad-hoc way | A seeded conversation-attribute definition `fork_escalation_reason`, created with the pattern at `conversation-attribute.service.ts:121-148`. This is data only. |
| 9 | New `tier` view rule plus inbox filter | Views are **seeded as data**, one per tier team, using the existing `team` rule (`lib/shared/conversation/views.ts:109-121,190,287`). |
| 10 | "`createMyTicket` is in `ticket-intake.service.ts`" | It is in `requester.service.ts:305`. `createTicketCore` is at `ticket-intake.service.ts:127`. |
| 11 | "Stage changes are in-app badges only" | The bell and the resolution email already exist (`events/targets.ts:876-920`, `:1488`). The gap is email for stage crossings that are not closes (Phase 8). |
| 12 | The hub was treated as greenfield | `routes/_portal/support.index.tsx` and `components/widget/widget-tickets.tsx` already exist. The hub is fork components behind a few slots (§4.10). |
| 13 | Tier analytics in `domains/analytics` (42 commits in 90 days) | A fork reporting page (§4.7). |
| 14 | `support.escalate` (a 3-part key) | `ticket.escalate` (2-part, category `support`). |
| 15 | Upstream migration sequence; `esc_` TypeID | Fork lineage; uuid PK (conventions §3). |
| 16 | "Strong upstream-contribution candidates" | D1: fork-only. |
| 17 | Churn not considered | Churn is recorded per seam (90-day: `conversation.service.ts` 51, `ticket.service.ts` 32, `workflow-graph.ts` 25, `inbox-detail-panel.tsx` 25, `action.executor.ts` 20, `inbox-scope.ts` 16). Correctness (T-8/T-9 route the team write in the two hot assignment writers through one fork transaction) wins over avoiding hot files. Those seams are small fenced blocks (about 12–15 lines each), and they are on the upgrade watch-list (§7). |
| 18 | Channels and hub scope unanswered | Channels are dropped (D-T13). The hub is scoped by D-T11/D-T12 (§4.10–4.11). |

## 2. Requirements

| # | Requirement | Phase |
| --- | --- | --- |
| R1 | Tiers 1–3 as a typed property of teams (several teams may share a tier), with an escalation edge and an optional default SLA. Effective tier per principal (D-A8). | 1 |
| R2 | Escalate / de-escalate a **ticket** between tier teams as a durable, idempotent, concurrency-safe operation. A ticket-less conversation is converted first (D-T3). A reason is captured, and there is an append-only ledger. De-escalation by the holding tier with roll-up (D-T8 🟡). Nothing de-escalates automatically (D-T9). Escalation is not a first response (🟡). | 2 |
| R3 | SLA **carries** across escalations (D-T1). A tier's default SLA applies only where no SLA is active. | 2 |
| R4 | The previous agent is cleared (D-T2). The escalator keeps **read-only** access while watching (D-T6, X-3). | 2 |
| R5 | Everything starts at T1 via workflows and the ticket intake sweep. Auto-routing is enforced off while tiers are on (D-T5, D-T10). Every team-assignment path keeps ticket and conversation on the same team and writes the ledger. | 2–3 |
| R6 | Tier queues (seeded views) and per-tier reporting. | 4–5 |
| R7 | Automated escalation (workflow/macro action; up only, D-T9). **Deferred:** until Phase 6 ships, escalation is manual, MCP or account-action only, and automation can only move teams via `assign_team` (recorded through T-9's transaction, never downward). | 6 |
| R8 | End-user hub (D-T11 B) inside the portal, for SSO-signed-in employees (D-E1, D-E3). Requests an employee emailed in before their first SSO sign-in are claimed into their account at sign-in (D-T12, D-E4). No extra channels (D-T13). **Deferred:** email on non-close stage changes (Phase 8). Until then, requesters see stage changes only in the hub, `/support`, the widget and existing emails. | 7–8 |
| R9 | Single and pooled tenancy; passes all upstream CI guardrails; ships dark behind `fork_settings`. | all |

## 3. What already exists (reused, not rebuilt)

- **Teams:** `assignment_method` manual/round_robin/balanced (`schema/teams.ts:31-60`). Membership is `team_members`
  (`schema/teams.ts:71`). Distribution: `distributeToTeamMember(team)` (`team-distribution.ts:43-66`).
- **Conversation team assign:** `assignTeam` (`conversation.service.ts:1542-1609`), which never clears the agent. Agent
  assign: `assignConversation` (`:1477-1532`).
- **Ticket assign:** `assignTicket` (`ticket.service.ts:744-813`). It does an unconditional `UPDATE` (no lock, no CAS), then
  publishes and fires `emitTicketAssigned` and `recordTicketActivity` (fire-and-forget) only when a side moved. It also stamps
  `firstResponseAt` for team-member actors (`:774`, `ticket.lifecycle.ts:47`). Callers: `assignTicketFn`, bulk update (`:919-921`),
  REST `POST /api/v1/tickets/:id/assign`. A ticket is born with **no team** (`createTicketCore` has no team input,
  `ticket-intake.service.ts:228-240`).
- **Conversation team assign callers:** workflow `assign_team` (`action.executor.ts:479-480`, service actor), `functions/teams.ts:172`,
  inbox bulk (`functions/conversation.ts:1475`). `assignTeam` returns early when the team is unchanged (`conversation.service.ts:1553`).
- **Ticket writers are permission-gated only.** `sendTicketMessage` / `addTicketNote` (`ticket-message.service.ts:405,481`),
  `setTicketStatus` (`ticket.service.ts:415`), `setTicketPriority` (`:872`) and `assignTicket` load the row with `loadTicketOr404`
  and never apply `ticketFilter`. Row scope applies to reads only (`assertTicketVisible`, `:115`).
- **Watchers:** `ticket_subscriptions`, with reasons `'requester'|'assignee'|'replier'|'manual'`, set through
  `safeSubscribeToTicket` (`ticket-subscription.service.ts:85`). A watch triggers notifications but grants no visibility.
- **Conversion:** `createTicketCore` opens its **own** transaction (`ticket-intake.service.ts:196`) and has no `tx` input.
  `linkTicketToConversation` (`ticket-conversation-link.service.ts:98`) is a separate call. It requires `ticket.create` (`:103`),
  inserts the pair row with the 1:1 partial unique indexes as the only guard (`:121-151`), and then runs a post-link tail: the
  first-response backfill, the conversion system message and `handoffConversationSlaToTicket` (exported, `:324`).
- **Round-robin cursor:** `distributeToTeamMember` reads `team.rrCursorPrincipalId` from the `Team` object it is given (not
  locked) and persists the pick through `setRoundRobinCursor` in autocommit (`team-distribution.ts:55-56`,
  `team.service.ts:268-273`). The helpers it uses are exported: `pickRoundRobin` (`team-distribution.ts:27`),
  `listTeamMemberPrincipalIds` (`team.service.ts:196`), `listOnlineAgentIds` / `listAvailableAgentIds` (`realtime/presence.ts:229,251`),
  `pickLeastLoaded` / `countOpenConversationLoad` (`strategies/auto-assign-active.ts:15,31`).
- **Activity and attributes:** `recordTicketActivity` is fire-and-forget (`ticket-activity.service.ts:56-70`).
  `setConversationAttribute` writes a `custom_attributes || jsonb` merge on the conversation or ticket row (`set-attribute.service.ts:175-185`).
- **Pair lookup:** `getLinkedCustomerTicket` (`inbox/inbox.query.ts:647`); `resolvePairConversationId` (`pair-thread.service.ts:122`).
- **SLA:** `applySlaToConversation` (`sla.service.ts:162`), `applySlaToTicket` (`ticket-sla.service.ts:270`), and `sla_events` (`schema/sla.ts:61-92`).
- **Notes / attributes:** `addTicketNote` (`ticket-message.service.ts:481`); `setConversationAttribute` (`set-attribute.service.ts:124`).
- **Widened-actor precedent:** `ticketActionActor` (`action.executor.ts:130-136`) + `TICKET_ACTION_PERMISSIONS` (`workflow-actor-permissions.ts:44-47`).
- **Routing settings:** `ConversationRoutingConfig { enabled, strategy }` (`settings.conversation-routing.ts:15-23`);
  `updateConversationRoutingFn` (`functions/settings.ts:936`, `settings.manage`).
- **SSO sign-in (D-E3):** the company IdP is a generic OIDC provider with JIT provisioning (`build-oauth-configs.ts:195-260`;
  `autoCreateUsers`, `04-…` §3). The adapter sets `emailVerified` from the IdP's `email_verified` claim, strictly coerced
  (`build-oauth-configs.ts:290-317`, `map-profile-claims.ts:45-50`). `findProviderForDomainEmail` (`auth/provider-ids.ts:100`) returns the
  provider that owns an address's **verified** domain. The Better-Auth after-hook `hooksAfter` (`auth/hooks.ts:1556`) runs on
  every sign-in. On the OIDC callback paths (`SESSION_CREATING_CALLBACK_PATHS`, `:148`) it loads the providers and runs
  auto-provisioning (`:1618`). There is no fork extension point in it. The principal already exists by then, because
  `databaseHooks.user.create.after` creates it (`auth/index.ts:587`).
- **Portal access (D-E3):** `evaluatePortalAccess` grants everyone on a **public** portal (`domains/settings/portal-access.ts:151-152`).
  The whole `_portal` layout (`routes/_portal.tsx:121`) and the visitor server functions (`runGetMyConversations`,
  `functions/conversation.ts:584`) therefore let every signed-in employee through. The layout loader already builds the
  branding (theme CSS, custom CSS, fonts; `routes/_portal.tsx:218-259`) and renders `PortalHeader` (`:381`). The portal's sign-in
  prompt is `useAuthPopoverSafe` (used by `routes/_portal/support.index.tsx:70`). It offers only the enabled methods, which is SSO
  alone under the baseline.
- **Requester surfaces:** `getMyConversationsFn` (`functions/conversation.ts:616`) returns the caller's conversations
  (`listConversationsForVisitor`), each with `csatRating`, plus a `linkedTickets` stage map (`getRequesterTicketSummaries`,
  `:601-607`). `createMyTicket` (`requester.service.ts:305`) always creates a backing conversation, so every requester ticket has
  a `/support/$conversationId` thread. There is no standalone portal ticket page (`notification-target.ts:62-67`).
  `createMyTicketFn`, `getMyTicketFormFn` and `submitCsatFn` are already END_USER-classified (`classifications.ts:153,166,172`).
- **Portal nav:** `portalConfig.nav.items` accepts admin `link` items with an absolute http(s) URL, a label and `newTab`
  (`settings.types.ts:288-313`; rendered by `resolvePortalNavItems`, `components/public/portal-header-nav.ts:116-125`).
- **Ask AI:** `/api/widget/kb-ask` checks the `helpCenter` flag (`kb-ask.ts:143`) and needs no identity. It resolves the viewer
  from the widget session, or `ANONYMOUS_ACTOR`, and answers from `audience: 'public'` articles only (`:209-212`;
  `widget/widget-viewer.ts:16-35`).
- **Email-only requesters:** inbound mail arrives over IMAP from the internal mail server (`conversation.email-imap.ts`, which
  parses with the shared `parseRawEmail`, which reads `Authentication-Results`, `conversation.email-inbound.ts:351`). A cold email
  attaches to an existing user **only** under a DMARC pass (`conversation.email-cold-inbound.ts:87-99`). Otherwise it becomes an
  **anonymous lead principal with no user row** that carries `contactEmail` (`:131-139`; later mail reuses it via
  `type='anonymous' AND user_id IS NULL AND contact_email=…`, `:113-121`, which is what keeps a block on a cold sender). Mail with
  no `Authentication-Results` header is `unverified` (`email-auth.ts:268-274`). An unverified conversation carries
  `customAttributes.unverifiedSender` (`:229`). The first SSO sign-in creates a separate user principal. No automatic merge exists
  for this case, and the admin merge `mergeLeadIntoUser` **cannot** be used: it rejects a lead with no `userId`
  (`domains/users/user.merge.ts:61`) and tears down a user identity (`:85`). The registry itself, `repointPrincipalActivity(tx,
  from, to)` (`principals/principal-repoint.ts:552`), is exported and transaction-scoped. It transfers `blocked_at` fill-if-empty
  (`:420-428`), and F-5 runs fork steps inside it.

## 4. Design

### 4.1 Tier model and effective tier

`fork_team_tiers` is a 1:1 sidecar on `teams` (§5). A team with no row is untiered. Tiers are `1..3` in v1 (X-2), one per Tier
role template. A fourth tier would need a new template, a CHECK change and a new decision. Several teams may share a tier. Each
team has its own `escalates_to_team_id` edge, which must point to a higher tier. Cycles are rejected. Soft-deleted teams are ignored.
Exactly one T1 team is flagged `is_intake` (the intake target, §4.6).

**Current tier of a ticket** is the tier of `tickets.assignee_team_id` (D-T3). In tier mode the transactional assignment (§4.6) keeps a paired
conversation on the same team, so there is no fallback for tickets. A **ticket-less conversation** has the tier of its
`assigned_team_id`. A ticket with no team is "intake" (untiered) until the intake sweep assigns it.

**Tier memberships and effective tier (D-A8).** A principal's tier memberships are every non-deleted tiered team where they
have a `team_members` row. Their **effective tier** is the highest tier among those, or null if there are none. An agent at
effective tier N may do everything allowed at tiers ≤ N. Exported from `lib/server/fork/tiered-support/tiers.ts`:

```ts
listTierMemberships(principalId: PrincipalId): Promise<Array<{ teamId: TeamId; tier: number }>>
getEffectiveTier(principalId: PrincipalId): Promise<number | null> // = max(listTierMemberships(p).tier) ?? null
getTeamTier(teamId: TeamId): Promise<number | null>
resolveTeamForTier(minTier: 1 | 2 | 3, fromTeamId?: TeamId): Promise<TeamId | null>
// follows escalates_to edges from fromTeamId until tier >= minTier; else the lowest-tier team with tier >= minTier.
// minTier outside 1..3 → ValidationError.
```

All of these are pure reads with no caching, following the module-state rule. 40 uses `listTierMemberships` to check
team-scoped `account.execute` per team: some membership `{teamId, tier}` must have `tier ≥ min_tier` and
`canInTeam(actor, 'account.execute', teamId)`. 40 uses `resolveTeamForTier` to find the approving team (D-A11). §4.2's
`assertCanEscalate` uses `listTierMemberships` in the same way.

### 4.2 `escalateTicket` (fork domain service, `lib/server/fork/tiered-support/escalation.service.ts`)

Input: `{ subject: {ticketId} | {conversationId}, toTeamId?, targetTier?: 1|2|3, direction?: 'up'|'down', reason, note?,
expectedFromTeamId, expectedAssignmentSeq?, source: 'manual'|'workflow'|'mcp'|'account_action', idempotencyKey }` (key
required), plus an actor. `expectedAssignmentSeq` (optional) is a stricter CAS used by plan 40: it must equal the pair's
current `fork_tier_pair_state.assignment_seq`. A read-only `getEscalationByKey(subject, idempotencyKey)` returns the
operation's state and `escalationId` so callers can look up a replayed key without re-submitting.

`escalateTicket` is a **durable operation** (T2). Its operation row is the ledger row (`fork_support_escalations`, §5), and it is
written **before** anything is mutated. Every later step reads its inputs from that row, so a retry or the recovery sweep
finishes the **same** operation instead of starting a new one.

**Authorization is the caller's job (the §11 contract).** `escalateTicket` performs no permission check:
- `escalateTicketFn` (manual UI and MCP) calls `assertCanEscalate(actor, fromTeamId, toTeamId, direction)` before calling:
  - **Workspace-wide `ticket.escalate`** (Owner/Admin/**Manager**, D-T7) may escalate or de-escalate any tiered ticket.
  - **Team-scoped holders** need a membership `{teamId: T, tier}` from `listTierMemberships` with `tier ≥ tier(from-team)`
    and `canInTeam(actor, 'ticket.escalate', T)`. That team's own members count, and so do higher tiers through roll-up
    (D-A8), in **both directions**. A ticket returned to T1 cannot be pushed further down by T1 (**D-T8 🟡**).
  - `ticket.assign` is also required when the from-team is untiered, or when the target is off the edge (an override).
- The Phase 6 workflow action authorizes through the widened workflow actor (`workflow-actor-permissions.ts`).
- 40's request flow checks `account.request` (§11).

**Top tier.** Roll-up gives a T3 agent `ticket.escalate`, but a T3 team has no `escalates_to_team_id`. For a top-tier from-team,
`up` with no `toTeamId` or `targetTier` is a **no-op**, and the panel shows Escalate disabled ("Highest tier"). De-escalate
stays available (D-T8).

**Steps** (`state` column: `claimed → converting? → applied → done`, or the terminal state `rejected`). Every step runs
under the operation lease (step 1a). Each step commits its writes **and** its state transition in one transaction, fenced by
`WHERE id=$id AND lease_token=$token AND state=$expected` (R2-5):

1. **Claim (own tx, before any mutation).** `idempotencyKey` is **required**. The UI mints one per dialog submit, and 40 passes its
   deterministic key. `INSERT … ON CONFLICT (subject_key, idempotency_key) DO NOTHING RETURNING` creates the operation row with
   `state='claimed'`: subject, `expectedFromTeamId`, requested `toTeamId`/`targetTier`/direction, reason, note, source, actor and
   `request_hash` (a hash of those inputs). If the insert returns nothing, the call is a replay. It loads the existing row and
   gets `IDEMPOTENCY_KEY_REUSED` if `request_hash` differs. A `rejected` row returns the stored error again. An `applied`/`done`
   row returns its result. A partial unique index `(subject_key) WHERE state IN ('claimed','converting')` allows only one
   un-applied operation per subject, so a second escalation with a different key gets `CONFLICT` until the first applies or is
   rejected.
1a. **Lease (ownership).** Before running steps 2–4, the caller claims the row:
   `UPDATE fork_support_escalations SET lease_owner=$worker, lease_until=now()+interval '30 seconds', lease_token=lease_token+1
   WHERE id=$id AND state IN ('claimed','converting') AND (lease_owner IS NULL OR lease_until < now()) RETURNING lease_token`.
   The first request, a same-key replay and the recovery job all use this claim, so two workers never run a step of the same
   operation at once. A worker whose lease expired (for example after a long pause) fails its next fenced transition, rolls back
   and stops. A replay that cannot claim the lease polls the row for up to 10 s. If the row reaches a terminal or `applied`
   state, the replay returns that result. Otherwise it throws the retryable `ESCALATION_IN_PROGRESS` error, with `escalationId`
   in its details. The lease is renewed between steps and cleared when the op reaches `applied` or `rejected`.
2. **Convert first (D-T3), only for a conversation with no ticket.** If `getLinkedCustomerTicket` already finds a pair ticket (for
   example, an agent converted the conversation manually), the op continues on that ticket and the CAS still decides. Otherwise
   call `createTicketCore` (customer type, requester = the conversation's visitor, title from the conversation subject, no
   backing conversation) with **seam T-14**'s `opts.inTx`. Inside `createTicketCore`'s own transaction, the fork callback:
   - runs `UPDATE fork_support_escalations SET ticket_id=$new, state='converting' WHERE id=$op AND lease_token=$t AND ticket_id
     IS NULL`, which must match exactly one row;
   - locks the conversation `FOR UPDATE`;
   - inserts the customer pair row into `ticket_conversations`. The 1:1 partial unique indexes reject an already-paired
     conversation;
   - binds `fork_tier_pair_state` to the new ticket.

   Any failure rolls the whole creation back, so **at most one conversion ticket per operation ever commits, and there is no
   orphan ticket**. This uniqueness does not depend on the lease: a second transaction blocks on the op row and then matches 0
   rows. After commit, `createTicketCore` runs its normal tail (`ticket.created` after the link exists, activity, realtime). The
   upstream link tail (first-response backfill from an earlier agent reply, the "Ticket created from this conversation" system
   message, `handoffConversationSlaToTicket`) is queued as the once-effect `conversion_tail`. A crash after commit resumes at
   step 3, because the op row already holds `ticket_id`. `linkTicketToConversation` is not called. It would also require
   `ticket.create`, which Tier roles lack.
3. **Resolve the target.** This is a pure read, repeated on every attempt:
   - `toTeamId`, if given;
   - else `targetTier`, through `resolveTeamForTier`;
   - else `up`, which follows `escalates_to_team_id`;
   - else `down`, which picks the unique tier team whose edge points at the from-team (if several match, `toTeamId` is required).
4. **Apply (one tx).**
   - Lock in the fixed order: ticket row → paired conversation row → `fork_tier_pair_state` row → target `teams` row (all
     `FOR UPDATE`).
   - **CAS:** if the ticket's `assignee_team_id` ≠ `expectedFromTeamId`, or `expectedAssignmentSeq` is given and ≠ the locked
     `assignment_seq`, set `state='rejected'` with `CONFLICT`. If it already
     equals the target, set `state='done'` with no effects (a no-op).
   - **Pick the agent in this transaction (R2-5).** `pickTierAgentInTx(tx, team)` applies `distributeToTeamMember`'s rules (manual →
     none; round-robin over online and available members after the **locked** cursor; balanced → least loaded, counting
     conversations only, D-T14). It writes `teams.rr_cursor_principal_id` in this transaction. The pick and the cursor advance
     therefore commit or roll back together with the move. A retry after a crash picks again from the unchanged cursor.
     `distributeToTeamMember` itself is not called.
   - Fork primitives (`lib/server/fork/tiered-support/assignment-primitives.ts`) run `UPDATE tickets SET assignee_team_id,
     assignee_principal_id, custom_attributes = custom_attributes || {fork_escalation_reason}, updated_at` and the same on
     `conversations` (`assigned_team_id`, `assigned_agent_principal_id`), `WHERE id = … AND <team> IS NOT DISTINCT FROM <from>`.
     D-T2: the agent becomes `chosen_agent_id`, or **null** when there is none. The primitives **never** touch
     `first_response_at` (escalation is not a first response, 🟡 default), and they never call `assignTicket`/`assignTeam`.
   - Insert the `ticket.assigned` row into `ticket_activity` directly (with `metadata.forkEscalationOpId`), so it is exactly-once
     by construction.
   - `fork_tier_pair_state`: `assignment_seq += 1`, `current_team_id = to`. Stamp the op row with that `seq`, the pre-images
     (from team and agent on both sides), `to_team_id`, `chosen_agent_id`, `from_tier`/`to_tier` and `direction`. Set
     `state='applied'` and `effects_pending` = the list in step 5. The fenced transition and all of these writes commit together.

   An ordinary team assignment that races this transaction takes the same locks through T-8/T-9 (§4.6). It either runs first,
   in which case the CAS rejects the escalation, or it runs after, in which case its re-check sees the escalated state.
   Automated moves are then skipped, and human moves are recorded with the next `seq`. Last-writer-wins on the team column no
   longer exists in tier mode.
5. **Effects (outbox, after commit).** Effects run under the **pair effects lease** (`fork_tier_pair_state.effects_lease_*`,
   claimed with the same conditional `UPDATE … RETURNING` as step 1a). The runner processes the pair's ledger rows in
   ascending `seq`. Each finished effect is removed from `effects_pending` by a conditional update.
   - **Once-effects** first claim `INSERT INTO fork_tier_effects (ledger_id, effect, state) VALUES (…,'started') ON CONFLICT DO
     NOTHING RETURNING`. Only the runner that got the row performs the effect, then sets `done`. A `started` row older than
     2 × the lease is taken over only after the new owner checks the effect's marker.
   - **Stateful effects** at `seq = n` are marked `superseded` (and not run) if any ledger row of the same pair with `seq > n`
     carries the same effect kind. An older SLA default or reason event can therefore never overwrite a later transition.

   | Effect | Kind | Guarantee |
   | --- | --- | --- |
   | `publishTicketUpdated` / `publishConversationUpdate` (current row) | plain | naturally idempotent |
   | `emitTicketAssigned` / `emitConversationAssigned` with the stored pre-images (`ticket.webhooks.ts:154`, `conversation.webhooks.ts:182`) | plain | **at-least-once** (stated): a crash between emit and mark repeats it |
   | Conversation system messages via upstream `emitTeamAssignmentSystemMessage` / `emitAssignmentSystemMessage` (exported by T-9) | once | effect claim; marker = op id in message metadata |
   | `conversion_tail` (convert-first only) | once | effect claim; its steps are each idempotent (backfill only if null, the SLA handoff no-ops once applied, system-message marker) |
   | SLA (§4.4): apply the tier default only where no SLA is active | stateful | superseded check + "no active SLA" check |
   | `conversation.attribute_changed` for `fork_escalation_reason` (the value itself was written in step 4) | stateful | superseded check; the event is at-least-once |
   | Internal note `Escalated T1 → T2 · ESC-<short op id> (reason): note` via `addTicketNote(escActor, …)` | once | effect claim; takeover marker = `ESC-<short op id>` |
   | Watch (D-T2): `safeSubscribeToTicket(actor, ticket, 'manual')` | plain | `onConflictDoNothing` (`ticket-subscription.service.ts:77`) |

   `escActor` is a copy of the human actor whose `permissions` add `ESCALATION_AUTHORITY = {ticket.note, conversation.reply}`.
   The principal is unchanged, so every event is attributed to the human. When `effects_pending` is empty, set `state='done'`.
   **Stated limit:** a once-effect can repeat only if a runner stalls longer than 2 × the lease in the middle of its upstream
   call. The fence cannot reach inside `addTicketNote` or `emitSystemMessage`.
6. **Return** `{ escalationId, fromTeamId, toTeamId, direction, state }` once the op is `applied` or `done`. A caller that
   receives `applied` (some effects still pending) can treat the escalation as complete. The effects finish on retry or in the
   sweep. `rejected` → the stored error. In progress under another worker's lease → `ESCALATION_IN_PROGRESS` (retryable,
   carries `escalationId`).

**Recovery.** An F-8 job, `fork-tier-escalation-recovery`, runs every minute. It claims the lease (step 1a) on rows in
`claimed`/`converting` whose lease is free or expired and that are older than two minutes, then runs steps 2–4 with the
stored inputs (the CAS still applies). It also claims the pair effects lease for pairs with ledger rows that have
`effects_pending`. Nothing is re-derived from live state except the CAS and the target resolution in step 3.

**No automatic de-escalation (D-T9).** No workflow, timer or status change moves a ticket down. Phase 6 automation is **up-only**.

### 4.3 Escalation reason

`ensureForkEscalationReasonAttribute()` inserts `key='fork_escalation_reason'` (select, `sourceHint='agent'`, options
`needs_expertise`, `access_required`, `suspected_bug`, `customer_request`, `sla_risk`, `account_action`, `other`). It is
idempotent, following `conversation-attribute.service.ts:121-148`. The `account_action` option is used when `source='account_action'`.
Admins can edit the options on the existing Conversation data page. The ledger stores the option id plus a label snapshot.

### 4.4 SLA (D-T1)

- Escalation never calls `applySlaToConversation` or `applySlaToTicket` on a side whose SLA is active.
- If the target tier has a `default_sla_policy_id` and a side has no active SLA, that side gets the policy. Each side is judged
  independently.
- The T1 default is applied at intake by the workflow's own `apply_sla` action, or by the intake sweep for tickets.
- The UI shows the carried SLA's policy name and deadline next to the tier badge.

### 4.5 Visibility for the escalator (D-T2, D-T6 — seam T-1 approved)

- `ticketFilter` (`policy/tickets.ts:44-62`) handles ticket lists and the single-ticket read. For a `ticket.view` holder it allows
  only tickets assigned to them or to their team. `canViewConversation` (`policy/conversation.ts:25-29`) already allows any
  `conversation.view` holder to deep-link.
- **Seam T-1:** one term, `OR ${forkEscalatedByMeFilter(principalId)}`, in branch (3) of `ticketFilter`. It is a pure SQL predicate
  that matches when `fork_support_escalations.by_principal_id = me` **and** my `ticket_subscriptions` row still exists. Unwatching
  therefore revokes the access, and other watchers gain nothing. It also covers an account-action requester (D-A11), because 40
  escalates with the requester as the actor.
- A fork page, **"Escalated by me"** (`listMyEscalationsFn`), supports discovery. No conversation-list seam is added.
- **Read-only after handoff (X-3).** T-1 grants visibility only. The escalator would otherwise keep `ticket.reply`,
  `ticket.note`, `ticket.set_status` and `ticket.assign`. Upstream ticket writers check the permission but not row scope (§3),
  so the fork adds a write guard, `forkAssertTicketWritable(actor, ticket, op)`
  (`lib/server/fork/tiered-support/write-guard.ts`), called from seams T-8 (`setTicketStatus`, `setTicketPriority`,
  `assignTicket`, `softDeleteTicket`) and T-10 (`insertTicketMessage` when `senderType='agent'`, which covers reply and note). It
  throws `ForbiddenError('TIER_READ_ONLY')` when **all** of these hold:
  - tiered support is enabled;
  - the actor is a human teammate (not a service principal);
  - the actor lacks `ticket.view_all`;
  - the actor is not the assignee and is not on the assigned team;
  - a ledger row by the actor for this ticket exists in state `done`.

  In short, the actor's only access is the escalator-watch term, and the handoff has finished. While the actor's own operation
  is `applied` (effects still running), the escalation's own note and watch pass. Everyone else is unaffected, including an
  escalator who is still a member of the holding team.
- **What this is not (stated limit).** Team queues are an **operational routing convention**, not strict isolation (🟡
  default). Upstream lets any `ticket.reply` holder write to any ticket id, and `canViewConversation` already lets any
  `conversation.view` holder deep-link any conversation. The guard closes the escalator case only. Writes on the paired
  **conversation** (a reply from the conversation view, conversation notes) stay upstream behaviour: the UI shows the ticket as
  read-only, but the conversation path is not blocked.

### 4.6 T1 intake and the assignment invariant (D-T5, D-T10, T3)

**Invariant (tier mode on).** A paired ticket and conversation are always on the same team. Every team change is in the
ledger with a per-pair `assignment_seq`. No automated path lowers a tier. Every writer that can change a team goes through the
same locks (ticket → conversation → pair state) and the same fork primitives:

| Path | How it is covered |
| --- | --- |
| `escalateTicket` (UI, MCP, 40, Phase 6) | §4.2 (fork primitives under the same locks and `assignment_seq`) |
| `assignTicket`: UI `assignTicketFn`, bulk (`ticket.service.ts:919-921`), REST `/api/v1/tickets/:id/assign` | **T-8**: team write through `forkApplyTeamAssignment` (one locked transaction) |
| `assignTeam`: workflow `assign_team` (`action.executor.ts:479-480`), `functions/teams.ts:172`, inbox bulk (`functions/conversation.ts:1475`) | **T-9**: team write and member pick through `forkApplyTeamAssignment` |
| Ticket creation (`createTicketCore` sets no team) | intake sweep (below) |
| Agent-only assignment (`assignConversation`) | does not change the tier. Not hooked. |

- **Transactional assignment (R2-6).** In tier mode, T-8 and T-9 hand upstream's team write to one fork function,
  `forkApplyTeamAssignment({ kind: 'ticket'|'conversation', id, toTeamId, buildPatch, actor })`
  (`lib/server/fork/tiered-support/assignment-tx.ts`). `buildPatch(lockedRow, pickedAgentId)` is a closure defined in the seam
  around upstream's own patch expression. For the ticket, that is the assignee/team patch with `firstResponseStamp` re-evaluated
  on the locked row. For the conversation, it is the team, the distributed agent and the snooze wake (`shouldWakeSnoozedOnTriage`).
  Upstream's validation (`getTeam`, the assignee role check) still runs before the call. In **one transaction**, the function:
  1. **Locks** ticket → paired conversation → `fork_tier_pair_state` (`FOR UPDATE`, fixed order, shared with §4.2).
     - The ticket path finds the pair through `ticket_conversations`.
     - The conversation path first reads the link without a lock, then locks the ticket (if any) and the conversation, and
       re-reads the link. If a ticket appeared in between (a conversion committed), it restarts the transaction, at most 3 times.
       This keeps the lock order without deadlocks.
  2. **Re-checks the invariant against the locked row**, not against a value read before the lock. For a **service
     principal** (a workflow or automation), it returns `{ outcome: 'skipped', current }` with **no write** when the move would
     lower the current tier (D-T9), or when the current team was set by the pair's latest escalation (the pair state's
     `last_source` is an escalation). Examples: a delayed `conversation.created` intake run after an escalation, or a paused
     `assign_team` that resumes after the pair moved to T2. Human `ticket.assign` / `canActAsAgent` holders are **not** blocked.
     A manual move is an allowed, recorded override (routing convention, OI-16 🟡). The X-3 write guard for `assignTicket` runs
     here too, against the locked row.
  3. **Picks the member in the same transaction** (conversation path, or a ticket path whose patch sets a team on a
     round-robin/balanced team). It uses `pickTierAgentInTx` (§4.2 step 4) with the target `teams` row locked, so the cursor
     advance commits with the assignment.
  4. **Writes both sides and the version.** It applies `buildPatch(locked, pick)` to the written side. It mirrors the team onto
     the other side with the §4.2 fork primitive, conditional on the locked current value. The mirrored agent is untouched, and
     `first_response_at` is never stamped by the mirror. It increments `assignment_seq` and sets `current_team_id` and
     `last_source='assignment'`. It inserts the ledger row (`source='assignment'`, `state='applied'`, `seq`, direction from
     the tiers, `lateral`/`intake` where untiered, pre-images). The row's `effects_pending` lists the **mirrored** side's
     realtime publish, assigned event and (for a mirrored conversation) team system message.
  5. Commits, and returns `{ outcome: 'applied', before: lockedPreImage, updated }`.

  Upstream then runs its normal post-update tail for the written side (publish, watcher opt-in, `emit…Assigned`, activity,
  system messages) with `before` in place of its earlier unlocked `existing`, so the event's "from" is the true pre-image. A
  `'skipped'` outcome returns the current row the same way the no-op branch does. With tier mode off, or for an agent-only
  patch on a ticket, the function returns `null` after one flag read, and upstream's own `UPDATE` runs unchanged.

  A conversation team change **before** a ticket exists writes a ledger row with `ticket_id` null and `conversation_id` set,
  on a pair-state row keyed by the conversation. Conversion (§4.2 step 2) binds that row to the new ticket. The timeline reads
  ledger rows by `ticket_id` **or** the pair's `conversation_id`, so pre-conversion tier history is kept without back-filling.
- **No crash window, and no `updated_at` inference.** The team write, the mirror, the version bump and the ledger row commit
  together, so a crash leaves either all of them or none. Only outbox effects can be pending, and the effects runner (§4.2
  step 5) finishes them in `seq` order. The intake sweep also runs a **drift check**: for each tiered pair, both sides must
  equal `fork_tier_pair_state.current_team_id` (the last recorded assignment version). General `updated_at` is never used,
  because unrelated edits advance it. A mismatch can come only from an **unhooked** writer (a new upstream path, a manual SQL
  fix). The sweep logs `TIER_INVARIANT_DRIFT` with the offending side, restores the recorded team with the fork primitive and a
  new `seq` (ledger `source='assignment'`, `reason_label='drift_repair'`), and never adopts the unrecorded value. Restoring is
  the safe choice under D-T9, because an unrecorded write may be an automated de-escalation. The grep guard (§7) is meant to
  keep this path empty.
- **Intake to T1 (everything starts at T1).**
  - `setTieredSupportEnabled(true)` requires one `is_intake` T1 team and **enables** the seeded workflows as part of the same
    admin action. They are seeded disabled so the admin can review them first:
    - `conversation.created` → `assign_team: <intake team>` + `apply_sla: <T1 default>`;
    - `assistant.handed_off` → the same.

    The workflows carry no branches (D-T10). Their `assign_team` goes through T-9, so the same transaction mirrors the team onto
    the pair ticket.
  - **Intake sweep** `fork-tier-intake` (F-8, every minute). It targets **customer** tickets that are not deleted, not closed, have
    `assignee_team_id IS NULL` and were created after `tiered_support.enabled_at`. That covers unpaired tickets and tickets created
    manually, over REST or over MCP. The sweep assigns them to the intake team through the same locked transaction as
    `forkApplyTeamAssignment`. It re-checks `assignee_team_id IS NULL` on the locked row, so a team set in the meantime wins,
    increments `assignment_seq` and writes a ledger row (`source='intake'`). The T1 default SLA is then applied where none is
    active, as a stateful effect. **Back-office and tracker tickets** stay untiered
    unless someone assigns them to a tier team, and that assignment then goes through T-8/T-9 like any other.
- **Auto-routing enforced off (D-T5).** `setTieredSupportEnabled(true)` refuses while `getConversationRouting().enabled` is true.
  The Tiers page offers "Turn off auto-routing". **Seam T-11** in `updateConversationRouting`
  (`settings.conversation-routing.ts:75`) refuses `enabled: true` while tiered support is on (`ValidationError('TIERED_SUPPORT_ON')`).
  Both writers also **verify after writing**: each writes its flag, then reads the other, and reverts its own write and refuses if
  both are on. Under read-committed, at least one of two racing writers sees the other, so the two can never both end up on.

### 4.7 Queues and reporting

- **Queues:** one shared `conversation_views` row per tier team, `{rules:[{field:'team',value:teamId}]}`, named "T2 · <team>".
- **Tier timeline:** computed from `fork_support_escalations` rows in state `applied`/`done`, ordered by the pair's `seq`
  (not by timestamps). In tier mode every team change is there (escalation, transactional assignment, intake, drift repair). History from before tiered support was enabled falls back to
  `ticket_activity` `ticket.assigned`, then the current team. The origin tier is always T1 for new work (D-T10). Legacy work may
  start untiered.
- **Metrics** (`routes/admin/fork-tiers.tsx`, `analytics.view`):
  - time in tier;
  - escalation rate and de-escalation rate;
  - per-tier SLA attainment: each `sla_events` row is attributed to the tier the subject was in at `at`;
  - CSAT by final and origin tier;
  - count of escalations with `source='account_action'`.

  No `domains/analytics` edits.

### 4.8 Agent UI and settings

- **Seam T-2:** a `<ForkTierPanel item={…} />` line in `inbox-detail-panel.tsx` after the Watchers row (`:672-676`). The panel
  shows the tier badge, the carried-SLA chip, Escalate ▸ / De-escalate ▸ (De-escalate is hidden unless `assertCanEscalate` would
  pass for `down`), and the escalation history. When the write guard would refuse the viewer, the panel shows a "Read-only:
  escalated to T2" banner. The mount is the shared fork detail-panel slot that A-2 also uses (one component, one line).
- **Settings via F-4:** `fork-settings-modules.ts` adds the **Tiers** page (`routes/admin/settings.fork-tiers.tsx`, `team.manage`)
  to the existing Support module. It covers per-team tier, edge, default SLA, seeded views/workflows, the routing check, and links
  to the report and to "Escalated by me". There is no own seam.

### 4.9 Feature gating

`fork_settings` key `tiered_support.enabled` (default false) for Phases 1–6. `tiered_support.hub_enabled` (default false) for
Phase 7. No Labs line is needed. T-1 matches nothing while no escalations exist. With the flag off, the T-8/T-9/T-10/T-11 fork calls
return immediately after one flag read (`forkApplyTeamAssignment` returns `null`, so upstream's own `UPDATE` runs), and upstream
behaviour is unchanged. T-14's `inTx` is passed only by the fork's own conversion.

### 4.10 End-user hub (D-T11 ✅ option B)

**Prototype:** https://claude.ai/artifact/XAn1u4GewieesuMGHsua43 (a planning reference, not a runtime dependency)

**Shape.** A new hub landing page inside the portal, plus a widget Home section. Both link into the existing upstream pages,
which stay unchanged. The landing runs one chain, top to bottom:

| # | Section | Content | Backed by (no upstream edit) |
| --- | --- | --- | --- |
| 0 | Announcements strip | 60's banner | Inherited from the `_portal` layout, where 60's seam N-1 mounts `<ForkAnnouncementsBanner/>`. The hub does not mount it a second time. Until N-1 ships there is no strip. |
| 1 | Find an answer | KB search, Ask AI, help-center collections | Upstream `components/help-center/help-center-search.tsx` and `ask-ai.tsx` imported as-is. Collection cards link to `/hc/$locale/collections/$idSlug`. Shown to **every** viewer, signed in or not: the portal is public inside the intranet (D-E3), and Ask AI (`/api/widget/kb-ask`) needs no identity (§3). |
| 2 | Still need help | Start a chat · Submit a request | "Start a chat" links to `/support`. "Submit a request" is a hub form that calls upstream `getMyTicketFormFn` / `createMyTicketFn` (`functions/tickets.ts:850,1100`). A signed-out viewer gets the portal sign-in prompt (SSO) first. |
| 3 | Track | My requests, including chats, with stage chips and "View all" | Upstream `getMyConversationsFn` (`functions/conversation.ts:616`): conversations plus the `linkedTickets` stage map, rendered with `StageChip`. Rows open `/support/$conversationId`, and "View all" opens `/support`. Every requester ticket has a backing conversation (§3), so this covers tickets too. |
| 4 | Rate | CSAT for the most recently resolved request | The first closed row from section 3 with `csatRating` null, submitted with upstream `submitCsatFn` (`functions/conversation.ts:808`). |

The hub adds **no** server read or write of its own apart from the claim trigger (§4.11). Every portal and visitor check
(enabled flags, ownership, `isBlocked`) is upstream's, because the hub calls upstream's functions.

**Route.** `routes/_portal/hub.tsx` (URL `/hub`), a child of the `_portal` layout. New route files never conflict, because
`routeTree.gen.ts` is gitignored. The hub used to sit outside `_portal` to avoid the private-portal gate. Portals are now public
(D-E3), so the gate grants everyone (`portal-access.ts:151-152`), and living inside the layout removes the fork layout, its
copy of the portal loader and the separate banner mount.

**Branding (D-X1, conventions §11).** The hub inherits the portal layout's branding, so it cannot drift: theme CSS, custom CSS,
`themeMode`, logo, favicon, fonts and header all come from `routes/_portal.tsx:218-259,372-381`. All hub and widget-section
components use only theme tokens (`bg-background`, `bg-card`, `text-foreground`, `bg-primary`, `border-border`,
`rounded-[var(--radius)]`, …) and upstream `components/ui/*` primitives. The prototype's colours are illustrative. Validation:
change an app's primary colour, font and custom CSS once in admin branding and confirm that `/hub`, the widget Home section and
`/support` all change together, in light and dark mode.

**Signed-out state.** A viewer who has passed the edge SSO but has no Quackback session sees sections 0 and 1. Sections 2–4 show a
"Sign in to see your requests" card that opens the portal's standard sign-in prompt (`useAuthPopoverSafe`). Under the baseline
that prompt offers only the company SSO (D-E3). The hub has no sign-in UI of its own.

**Entry points.**

- **Portal nav (config, no seam).** The hub settings offer "Add Help hub to portal nav". This reads `portalConfig.nav`, appends
  a `link` item (`id: 'fork-hub'`, `url: <portal base URL>/hub`, `newTab: false`, label "Help hub") and saves it through
  `updatePortalConfig` (`settings.service.ts:629`). The admin can reorder, relabel or hide it in the upstream nav editor.
  Turning the hub off offers to remove the item. Link labels are single-language plain text (`settings.types.ts:294-297`, OI-20 🟡).
- The widget Home (`widget-overview.tsx`) gets a section after the recent-tickets card (T-5). It shows "Find an answer" (opens
  the widget Help tab), "Still need help" (opens Messages / new ticket), "Your requests" (opens the Tickets tab) and "Open help
  hub" (`/hub` in a new tab). The section is lean, with no Tiptap, to respect the widget bundle budget. Widget visitors are
  identified employees (`hmacRequired`, `04-…` §3), so there is no anonymous-visitor branch.
- Phase 8 stage emails (deferred) will link to the request's `/support/$conversationId` thread on the intranet portal URL.

**Rejected alternative (A):** replace `/support`, `/hc` and the widget tabs with one hub. That meant about 10 seams in hot
portal and widget files, versus 3 hub seams (T-4, T-5, T-13) for B.

### 4.11 Requester identity and the email-only claim (D-T12, D-E1, D-E3, D-E4)

**Goal:** an employee who emailed support before they ever signed in to Quackback sees those requests as their own, in `/hub`,
`/support` and the widget, as soon as they sign in with SSO.

1. **Sign-in.** SSO only (D-E3), through the portal's existing prompt. The first sign-in creates the user and its principal by
   JIT provisioning (`autoCreateUsers`, `role: 'user'`). There is no magic link, email code or fork sign-up path.
2. **Account creation.** JIT provisioning creates every employee's account, so the closed-sign-up exemption for email-only
   requesters (old seam T-3) is **not needed** and is removed.
3. **Claim leads (T1).** `mergeLeadIntoUser` is **not** used. It rejects leads without a `userId` (`user.merge.ts:61`), and
   cold-email leads never have one. `claimRequesterLeads(userId, trigger)` (`lib/server/fork/hub/lead-claim.service.ts`) runs:
   - **on SSO sign-in**, from `forkAfterSignIn(ctx, providers, registeredOidcIds)`. Seam **T-13** calls it in `hooksAfter`
     (`auth/hooks.ts:1556`) right after `handleAutoProvisionAfter` (`:1618`), only on `SESSION_CREATING_CALLBACK_PATHS`. It is
     wrapped in try/catch and logs: a failed claim never fails a sign-in;
   - **on each authenticated hub load**, through `claimMyRequesterLeadsFn`. Mail that fails DMARC keeps creating leads after the
     first sign-in (`conversation.email-cold-inbound.ts:87-99`), and SSO sessions are long-lived, so the hub picks up new leads
     between sign-ins.

   The rules:
   - **Preconditions.** The principal is `type='user'`, `role='user'` (never a teammate), and not anonymous. The claim address is
     the user's own `user.email`, normalized the same way as `normalizeSenderAddress`. It is never taken from input. The address
     must be **IdP-verified**, which means one of:
     - `user.emailVerified = true` (the IdP asserted `email_verified`); or
     - the user signed in through, or has an `account` row for, the provider that `findProviderForDomainEmail(user.email)` returns
       for the address's **verified** domain (`provider-ids.ts:100`). That IdP is authoritative for the company domain even if it
       does not release `email_verified` (OI-19 🟡).

     A placeholder address (`allowMissingEmail`) is never verified (`build-oauth-configs.ts:290-293`) and is never on a verified
     domain, so it never claims.
   - **Select and lock.** In one transaction: `SELECT … FROM principal WHERE type='anonymous' AND user_id IS NULL AND
     contact_email = $email ORDER BY id FOR UPDATE`. Leads that carry a `userId` (widget visitors with a pre-chat email, which is an
     unverified claim) are **never** included, matching the security clause at `conversation.email-cold-inbound.ts:104-121`.
   - **Re-point.** For each lead, call upstream `repointPrincipalActivity(tx, lead, me, { displayNames })`
     (`principal-repoint.ts:552`). This is the same registry `mergeLeadIntoUser` uses, and it runs the fork steps through F-5.
     Unique-constraint collisions follow the registry's rule (the identified row wins, `collisionRepoint`). The upstream helper and
     its guard are unchanged.
   - **Teardown (principal-only).** For an **unblocked** lead: `DELETE FROM principal WHERE id=$lead AND type='anonymous' AND
     user_id IS NULL`. It must delete exactly one row, or the transaction rolls back. There is no user or session to delete.
     A **blocked** lead (`blocked_at IS NOT NULL`) is **kept** as an activity-free block anchor. The registry has already copied the
     block onto the user (`blocked_at` fill-if-empty, `:420-428`). Keeping the lead means later unverified mail from the address
     still reuses a blocked lead (`:113-121`) instead of minting a fresh, unblocked one. A later claim re-points only new activity.
   - **Provenance.** `customAttributes.unverifiedSender` lives on the conversation row, so the "unverified sender" badge stays
     after re-point, exactly as upstream computed it (OI-14 🟡: unverified leads are claimed by default).
   - **Concurrency and idempotency.** A sign-in and a hub load (or two tabs) claiming at once serialize on the row locks. The
     second finds nothing, or only anchors with no activity. Re-running is a no-op. A cold email that arrives mid-claim either
     lands before the lock (and is claimed) or reuses or creates a lead afterwards (and is claimed on the next sign-in or hub load).
   - **Downstream.** 40's cold-email requesters become targets once claimed (their ticket now has a user principal).
4. **Scope.** Once claimed, the requests belong to the user's principal. `/support`, the widget and the hub all read them through
   upstream's own ownership-scoped functions (§4.10). The fork adds no requester read path and no second authorization rule. A
   claimed blocked lead makes the user blocked, so upstream's `isBlocked` checks let them **read** their requests but not reply,
   file or rate (OI-18 🟡).
5. **Authz matrix.** `claimMyRequesterLeadsFn` uses bare `requireAuth()` and rejects teammates and anonymous principals. It needs
   an `END_USER` classification (precedent: `classifications.ts:166,172`), which goes in the fork list behind shared seam
   **F-10**. This is not an own seam.
6. **Widget.** Widget sessions are identified employees (`hmacRequired`). Claimed requests show in the widget Tickets and
   Messages tabs through upstream's functions.
7. **Knowledge base and Ask AI.** `/hc` and Ask AI are open to every portal viewer (D-E3). The edge SSO keeps out anyone who is
   not an employee (D-E1). No fork gate is needed (old seam T-12 removed).

### 4.12 Tier agent assignment (for 10's `assignTierAgentFn` and 20's `sync-members`)

A domain service in `lib/server/fork/tiered-support/tier-agents.service.ts`. Callers authorize, as with `escalateTicket`.

```ts
assignTierAgent(principalId: PrincipalId, teamId: TeamId, actor: Actor): Promise<void>
removeTierAgent(principalId: PrincipalId, teamId: TeamId, actor: Actor): Promise<void>
```

- **Assign.** The target must be a tiered team (tier 1–3), whose tier N selects the "Tier N Agent" template role. The service then:
  1. adds the membership **atomically** (X-1): `INSERT INTO team_members (team_id, principal_id) VALUES (…) ON CONFLICT
     (principal_id, team_id) DO NOTHING` (unique index `team_members_principal_team_uq`), after checking in the same transaction
     that the team is not deleted and the principal is `type='user'` with a teammate role (the same rule as `setTeamMembers`,
     `team.service.ts:205-227`). It never calls the replace-set `setTeamMembers`, so it cannot overwrite a concurrent upstream edit;
  2. assigns the Tier N role **workspace-wide** (dashboard keys);
  3. grants the same role **team-scoped** on `teamId` (scopable keys: `ticket.escalate`, `account.request`, `account.execute`).

  Steps 2 and 3 use 10's writers (`grantTeamRoleFn` domain core, `assertGrantableRole`) and audit through `user.role.changed`.
  The operation is idempotent.
- **Remove.** Undo in reverse order: revoke the team-scoped grant, then `DELETE FROM team_members WHERE team_id=$t AND
  principal_id=$p` (a single row). The workspace-wide Tier N role is removed **only if** the principal is no longer on any tier-N
  team. Effective tier is recomputed implicitly, because it is derived from membership (§4.1).
- **Reconciliation.** Upstream's team page still saves through the replace-set writer, so a stale save can drop or re-add a member
  that this service changed (an upstream lost-update the fork cannot prevent without a seam). The Tiers page and the
  `sync-members` path run `reconcileTierGrants(teamId)`. It revokes team-scoped Tier grants for principals who are no longer
  members and reports members who have no grant. Membership remains the source of truth.
- **Callers:**
  - 10's `assignTierAgentFn` / `removeTierAgentFn` (`member.manage`), the admin UI;
  - fork MCP tools `fork_assign_tier_agent` / `fork_remove_tier_agent` in `mcp/tools/fork-tiered-support.ts` (registered via F-3,
    `member.manage`). The tower's `sync-members` calls these tools with the admin's own token, so the change is attributed to
    the human (D-C2).

## 5. Data model (fork lineage `packages/db/drizzle-fork/`)

Schema: `packages/db/src/fork/schema/tiered-support.ts`, exported from the fork barrel.

**`fork_team_tiers`** (1:1 sidecar)

| Column | Type | Notes |
| --- | --- | --- |
| `team_id` | `typeIdColumn('team')` **PK** | FK `teams.id` ON DELETE CASCADE |
| `tier` | `smallint` not null | CHECK `tier BETWEEN 1 AND 3` (X-2: one per Tier template) |
| `escalates_to_team_id` | `typeIdColumnNullable('team')` | FK SET NULL; CHECK `<> team_id` |
| `default_sla_policy_id` | `typeIdColumnNullable('sla_policy')` | FK SET NULL |
| `is_intake` | `boolean` not null default false | CHECK `NOT is_intake OR tier = 1`; partial UNIQUE `((true)) WHERE is_intake` (one intake team) |
| `updated_at`, `updated_by_principal_id` | timestamptz, principal FK SET NULL | |

Index: `(tier)`.

**`fork_support_escalations`** (append-only ledger **and** durable operation row, T2/T3)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK `defaultRandom()` | the `escalationId`; `ESC-<first 8 hex>` is the human ref |
| `subject_key` | `text` not null | ticket id, or conversation id for a convert-first subject; the idempotency scope |
| `ticket_id` | `typeIdColumnNullable('ticket')` | FK CASCADE; null only for pre-conversion conversation-team rows or a `converting` op |
| `conversation_id` | `typeIdColumnNullable('conversation')` | FK SET NULL; CHECK `ticket_id IS NOT NULL OR conversation_id IS NOT NULL` |
| `state` | `text` CHECK in (`claimed`,`converting`,`applied`,`done`,`rejected`) | assignment/intake rows are born `applied` (or `done` with no effects) |
| `expected_from_team_id` | team FK SET NULL | the CAS input |
| `from_team_id` / `to_team_id` | team FKs, SET NULL | `to_team_id` set by the apply transaction (step 4) |
| `from_agent_principal_id` / `chosen_agent_id` | principal FKs SET NULL | pre-image; the pick committed with the cursor advance in step 4 |
| `pre_image` | `jsonb` | both sides' team and agent before apply (for events) |
| `from_tier` / `to_tier` | `smallint` null | snapshots |
| `direction` | `text` CHECK in (`up`,`down`,`lateral`,`intake`) | |
| `reason` / `reason_label` | `text` null / `text` | required for `manual`/`mcp`/`workflow`/`account_action` (CHECK) |
| `note` | `text` null | ≤ 2,000 chars |
| `by_principal_id` | principal FK SET NULL | null = system |
| `source` | `text` CHECK in (`manual`,`workflow`,`mcp`,`account_action`,`assignment`,`intake`) | `workflow` from Phase 6; `account_action` from 40; `assignment` = T-8/T-9 transactional assignment and drift repair; `intake` = sweep |
| `idempotency_key` | `text` null | required for escalations (CHECK by source); UNIQUE `(subject_key, idempotency_key)` |
| `request_hash` | `text` null | hash of the escalation inputs; a same-key replay with a different hash → `IDEMPOTENCY_KEY_REUSED` |
| `pair_id` | uuid null, FK `fork_tier_pair_state.id` | the pair this transition belongs to; null until `applied` |
| `seq` | `bigint` null | the pair's `assignment_seq` at this transition; set when `applied`. UNIQUE `(pair_id, seq)` |
| `lease_owner` / `lease_until` / `lease_token` | `uuid` null / `timestamptz` null / `bigint` not null default 0 | operation lease and fencing token (§4.2 step 1a) |
| `effects_pending` | `text[]` not null default `{}` | outbox (§4.2 step 5) |
| `error_code` | `text` null | for `rejected` (e.g. `CONFLICT`) |
| `created_at` / `updated_at` | timestamptz default now() | |

Indexes: partial UNIQUE `(subject_key) WHERE state IN ('claimed','converting')` (one un-applied op per subject);
`(ticket_id, created_at)`, `(conversation_id, created_at)`, `(by_principal_id, created_at)`, `(to_team_id, created_at)`,
`(created_at)`, partial `(updated_at) WHERE state IN ('claimed','converting') OR cardinality(effects_pending) > 0` (recovery).
Readers (timeline, T-1, write guard, reports) consider only `state IN ('applied','done')`, ordered by `(pair_id, seq)`.

**`fork_tier_pair_state`** (one row per ticket/conversation pair: the assignment version, R2-5/R2-6)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `ticket_id` | `typeIdColumnNullable('ticket')` UNIQUE | FK CASCADE; set at conversion for a conversation-first pair |
| `conversation_id` | `typeIdColumnNullable('conversation')` UNIQUE | FK SET NULL; CHECK at least one of the two is set |
| `assignment_seq` | `bigint` not null default 0 | incremented by every team transition, under this row's lock |
| `current_team_id` | team FK SET NULL | the last **recorded** team; the drift check compares both sides with it |
| `last_source` | `text` | source of the latest transition; the §4.6 re-check reads it ("set by an escalation") |
| `effects_lease_owner` / `effects_lease_until` | `uuid` / `timestamptz` null | pair effects lease (§4.2 step 5) |
| `updated_at` | timestamptz | |

Rows are created lazily by the first transition (`INSERT … ON CONFLICT DO NOTHING`, then `SELECT … FOR UPDATE`). Enabling
tiered support does not back-fill them. The first transition of an existing pair starts at `seq = 1`.

**`fork_tier_effects`** (atomic dedup for once-effects, R2-5)

| Column | Type | Notes |
| --- | --- | --- |
| `ledger_id` | uuid FK `fork_support_escalations.id` CASCADE | PK part 1 |
| `effect` | `text` | PK part 2 (`note`, `system_message`, `conversion_tail`, …) |
| `state` | `text` CHECK in (`started`,`done`,`superseded`) | |
| `started_at` / `done_at` | timestamptz | a `started` row is taken over only after 2 × the lease, with a marker check |

- **Migration:** `drizzle-fork/000N_tiered_support.sql`, additive only, with no notify-claim columns.
- **Principal re-point (conventions §8, F-5):** entries in `fork/principals/fork-repoint.ts`:
  - `fork_support_escalations.by_principal_id`, `.from_agent_principal_id`, `.chosen_agent_id` → **exempt**. These are staff
    references, and customer principals never appear in them.
  - `fork_team_tiers.updated_by_principal_id` → **exempt**. Also staff.
  - `fork_support_escalations.lease_owner` and `fork_tier_pair_state.effects_lease_owner` are worker ids, not principals, so
    nothing needs re-pointing.

  The hub adds no fork tables. Customer data moves through the upstream registry, which the claim service (§4.11) calls directly.
- `fork_settings` keys: `tiered_support.enabled` (+ `tiered_support.enabled_at`, written by the enable action and read by the
  intake sweep), `tiered_support.hub_enabled`.

## 6. Permissions

| Key | Category | Owner/Admin | Manager | Contributor | Tier roles | Enforced at |
| --- | --- | --- | --- | --- | --- | --- |
| `ticket.escalate` (new, F-7 block) | `support` | ✓ (computed) | **✓ workspace-wide (D-T7)** — not in the `WORKSPACE_ADMIN_PERMISSIONS` exclusion | ✗ | Tier 1/2/3 Agent: **team-scoped** to their tier team (D-T4). T3 needs it too, for de-escalation (D-T8). | `escalateTicketFn` → `assertCanEscalate` (`canInTeam` + roll-up) |
| `team.manage` (existing) | | ✓ | ✗ | ✗ | ✗ | Tiers settings functions |
| `ticket.view` / `ticket.assign` / `analytics.view` (existing) | | | | | | fn gate / override target / report |
| — (bare `requireAuth()`, END_USER) | | | | | | `claimMyRequesterLeadsFn`: requester-only, claims the caller's own address (§4.11). Hub reads and writes use upstream's END_USER visitor functions. |

- **Gate shape (OI-2 resolved by 10 §4.4).** Team-scoped rows are invisible to upstream resolution, so `requireAuth({ permission:
  'ticket.escalate' })` would reject a tier agent. `escalateTicketFn` therefore gates on `requireAuth({ permission: ticket.view })`,
  and `assertCanEscalate` performs the real check with `canInTeam` (workspace-wide OR team-scoped). The matrix records the
  `ticket.view` gate.
- **Tier role bundles (final for escalation; 10 seeds them).** Each Tier N Agent is a workspace-level custom role
  (`conversation.view/reply/note/set_status`, `ticket.view/reply/note/set_status`; T2+ adds `ticket.assign`, `conversation.assign`;
  T3 adds `*.view_all`) **plus** a team-scoped grant of `ticket.escalate` on the agent's tier team. The team-scoped grant is what
  makes D-T8 work.
- **Write guard (X-3).** Holding `ticket.reply`/`ticket.note`/`ticket.set_status`/`ticket.assign` is not enough on a ticket the
  actor can see **only** through T-1. After handoff, `forkAssertTicketWritable` refuses those writes (§4.5). This does not
  change the matrix: it is a row-level check behind the existing permission gates.
- End users never see tier, reason, or ledger data. Portal, hub and widget show only the public `stage`.

## 7. Seams

IDs follow `SEAMS.md` (X-6). T-7… is reserved there for the deferred later-phase seams, so the new seams start at T-8. The
staff review asked for the seams that correctness needs rather than a small count. Tiered support now has **7 core seams
(Phases 1–5: T-1, T-2, T-8…T-11, T-14)** and **3 hub seams (Phase 7: T-4, T-5, T-13)**. Before the staff review the counts were 2 and 4;
after it, 6 and 5. The intranet revision (D-E1…D-E4) removed T-3, T-6 and T-12 and added T-13. The second pass (R2-5, R2-6) added
T-14 and made T-8/T-9 larger: they now route the team write into a fork transaction instead of calling two hooks around an
upstream `UPDATE`. The reviewer asked for exactly this narrow transactional integration, rather than a two-call design kept
only to minimize changed lines.

**Core (Phases 1–5).**

| # | Upstream file (90-d commits) | Change (one-liner) | Why | Phase | Re-apply on conflict |
| --- | --- | --- | --- | --- | --- |
| T-1 | `apps/web/src/lib/server/policy/tickets.ts` (1) | `OR ${forkEscalatedByMeFilter(principalId)}` in `ticketFilter` branch (3), plus an import | D-T6 (approved): visibility is a pure SQL predicate with no extension point | 2 | Re-add the OR term in branch (3). Test: `fork/tiered-support/__tests__/visibility.test.ts` |
| T-2 | `apps/web/src/components/admin/inbox/inbox-detail-panel.tsx` (25) | Shared fork detail-panel slot (`<ForkTierPanel/>` + 40's A-2 in one component), plus an import | There is no slot in the detail panel | 2 | Place it after the `TicketWatchControl` row. The component self-hides. |
| T-8 | `apps/web/src/lib/server/domains/tickets/ticket.service.ts` (32) | In `assignTicket` (`:744`): `existing` becomes `let`. After the patch is built (`:774`), a fenced block calls `forkApplyTeamAssignment({kind:'ticket', id, toTeamId: input.assigneeTeamId, buildPatch, actor})`, where `buildPatch` wraps upstream's patch and re-runs `firstResponseStamp` on the locked row. The result: `'skipped'` → `return ticketRowToDTO(current)`; `'applied'` → `updated = r.updated; existing = r.before`; `null` → upstream's own `UPDATE` (`:777`). The write guard runs inside the fork transaction. One `await forkAssertTicketWritable(actor, existing, op)` after `loadTicketOr404` in `setTicketStatus`, `setTicketPriority`, `softDeleteTicket`. About 12 changed lines. | R2-6/T3: the invariant check, the team write, the pair mirror, `assignment_seq` and the ledger row commit in **one** locked transaction on every ticket-assignment path (UI, bulk, REST); X-3 write guard | 2 | Re-wrap the `update(tickets)` in `assignTicket` with the fenced block (the tail below it must use the returned `before`), and re-add the guard after each `loadTicketOr404`. Tests: `fork/tiered-support/__tests__/assignment-tx.test.ts` (includes the R2-6 pause/resume test) |
| T-9 | `apps/web/src/lib/server/domains/conversation/conversation.service.ts` (51) | In `assignTeam` (`:1542`): `existing` becomes `let`. After the no-op check (`:1553`), a fenced block calls `forkApplyTeamAssignment({kind:'conversation', id, toTeamId: teamId, buildPatch, actor})`. Its `buildPatch(locked, pick)` wraps upstream's `set({...})` expression (team, distributed agent, `shouldWakeSnoozedOnTriage` wake). A non-null result replaces `getTeam` + `distributeToTeamMember` + the `UPDATE` (`:1558-1580`): `'skipped'` → `return current`; `'applied'` → `updated`, `existing = before`, `team` and `distributedAgentId` come from the result, and the tail continues. `export` on `emitAssignmentSystemMessage` / `emitTeamAssignmentSystemMessage` (`:1345,1373`). About 15 changed lines. | R2-6/T3: workflow `assign_team`, the teams fn and inbox bulk move the conversation. The member pick (cursor), the invariant re-check, both sides and the ledger commit together. The escalation outbox reuses the system messages. | 2 | Re-wrap the distribution + `update(conversations)` section with the fenced block, and re-add the two `export` keywords. Same test file |
| T-10 | `apps/web/src/lib/server/domains/tickets/ticket-message.service.ts` (—) | `if (opts.senderType === 'agent') await forkAssertTicketWritable(opts.actor, existing, 'message')` after `loadTicketOr404` in `insertTicketMessage` (`:263`) | X-3: reply and note are permission-only upstream | 2 | Re-add after the ticket load, before the Phase 1a redirect. Test: `write-guard.test.ts` |
| T-14 | `apps/web/src/lib/server/domains/tickets/ticket-intake.service.ts` (—) | `createTicketCore(input, actor, opts?: { inTx?: (tx, ticket) => Promise<void> })`. One fenced line right after the ticket insert inside `db.transaction` (`:196`, after `:228-241`): `if (opts?.inTx) await opts.inTx(tx, ticket)`. Existing callers pass nothing and are unchanged. | R2-5: a convert-first escalation must record `ticket_id` on its operation row and insert the pair link **in the ticket's own creation transaction**, so at most one conversion ticket commits per operation and none is orphaned. `createTicketCore` has no `tx` input. | 2 | Re-add the optional parameter and the call after the ticket insert, before the watcher rows. Test: `fork/tiered-support/__tests__/escalation-convert.test.ts` (the R2-5 race/crash test; a throwing `inTx` leaves no ticket) |
| T-11 | `apps/web/src/lib/server/domains/settings/settings.conversation-routing.ts` (—) | In `updateConversationRouting` (`:75`): `if (input.enabled) await forkAssertRoutingMayEnable()` before the write, plus `await forkVerifyRoutingAfterWrite()` after it | T3/D-T5: routing must be **enforced** off while tiers are on; all writers go through this domain function | 3 | Re-add around the settings write. Test: `routing-guard.test.ts` |

**Shared, not counted:** `ticket.escalate` in the F-7 block; the Tiers page through F-4; MCP tool (6c) through F-3; re-point
exemptions through F-5; migrations through F-1/F-2; the recovery and intake jobs through F-8; the END_USER classification for
`claimMyRequesterLeadsFn` through F-10. This plan's fork code makes no outbound HTTP call, so it does not call F-12 itself (conventions §11a).

**Upgrade watch-list (review practice).** T-8 and T-9 make every upstream assignment writer a fork contract. On each upstream
sync, grep for new writers of `tickets.assignee_team_id` / `conversations.assigned_team_id` and new callers of
`assignTicket`/`assignTeam`. Also re-check the fork primitives against the columns they update, `pickTierAgentInTx` against
`distributeToTeamMember` (parity test), the fork's pair-link insert against `linkTicketToConversation`'s insert and tail, and
the in-transaction reason write against `setConversationAttribute`. A new writer that skips `forkApplyTeamAssignment`
breaks the invariant, and `assignment-tx.test.ts` includes a grep-based guard that fails when one appears.

**Phase 7 hub (D-T11 B): 3 seams.**

| # | Upstream file (90-d commits) | Change (one-liner) | Why | Phase | Re-apply |
| --- | --- | --- | --- | --- | --- |
| T-4 | `apps/web/src/locales/*.json` (9 files, count as one) | Append `portal.forkHub.*` keys | Portal i18n coverage test | 7b | Re-append; take upstream's version first |
| T-5 | `apps/web/src/components/widget/widget-overview.tsx` (14) | `<ForkHubHomeSection …/>` after `<WidgetRecentTicketsCard/>` (`:368`) | B: widget Home section | 7b | Place it after the recent-tickets card. Watch the widget bundle budget. |
| T-13 | `apps/web/src/lib/server/auth/hooks.ts` (27) | `await forkAfterSignIn(ctx, providers, registeredOidcIds)` in `hooksAfter` right after `handleAutoProvisionAfter` (`:1618`), plus an import. The fork function returns at once off the OIDC callback paths and never throws. | D-E4/T1: employees who emailed before their first SSO sign-in get their requests on sign-in. Upstream has no post-sign-in extension point. | 7a | Re-add after the auto-provision call. Test: `fork/hub/__tests__/lead-claim.sso.test.ts` (the claim runs after an OIDC callback and not after other paths) |

**Removed by the intranet revision (not to be implemented):**

| # | Was | Why removed |
| --- | --- | --- |
| T-3 | `signup-policy.ts`: exempt known email-only requesters from closed sign-up | SSO JIT provisioning creates every employee's account. No email sign-in path is left (D-E3). |
| T-6 | `portal-header-nav.ts`: built-in "Help hub" item | Upstream `portalConfig.nav` link items cover it as configuration (§4.10, OI-20). |
| T-12 | `kb-ask.ts`: private-portal gate on Ask AI | Portals are public inside the intranet (D-E3). The edge SSO is the perimeter (D-E1). |

**Later phases (deferred; they do not deliver automated escalation or stage email until they ship):**

| Phase | Seams (SEAMS.md `T-7…`) |
| --- | --- |
| 6 `escalate` workflow action (up-only, D-T9) | About 15 sites, found by grepping `convert_to_ticket`: `action.executor.ts` (union `:266` + switch), `workflow.schemas.ts:166`, `workflow-actor-permissions.ts`, `workflow-graph.ts` (`:729,1043,1426,2426,2468,2892`), `workflow-builder/entities.tsx:45,101`, `canvas.tsx:115`, `flow-layout.ts:282`, `step-visuals.tsx:57`, `step-content.ts:105,165`, `inspector/action-editor.tsx:42,340`. Each is a one-case delegation. |
| 6b macro `escalate` | `schema/macros.ts:38-45` (an upstream schema file, so a conventions exception needs sign-off), `macro.actions.ts:41-53`, `macros-manager.tsx` |
| 6c MCP tool | None own (F-3) |
| 8 stage email | One target-registration line in `events/targets.ts` (38) |

Generated files are regenerated, never merged: `permissions.ts`, `MATRIX.md`, `policy/dep-graph/GRAPH.md`.

## 8. Phases and validation gates

| Phase | Deliverable | Gate |
| --- | --- | --- |
| 0 prereqs | Foundations (F-1…F-10). 10-rbac Phase 1a + Phase 2 (`canInTeam`). `ticket.escalate` in the F-7 block (Manager ✓). | `canInTeam` is available; a Manager holds `ticket.escalate` after `seedSystemData`. |
| 1 Tier model | `fork_team_tiers` (tiers 1–3, one intake team) + migration; Tiers page (F-4); edge/cycle validation; `listTierMemberships` / `getEffectiveTier` / `resolveTeamForTier`; `assignTierAgent` / `removeTierAgent` (atomic membership) + MCP tools; `reconcileTierGrants` | Configure T1→T2→T3; tier 4 is rejected. An agent on T1 and T3 teams has effective tier 3. Assign then remove leaves no grants, memberships or stray workspace roles, and the MCP path is audited as the human. A concurrent upstream team save does not lose a tier membership written by the service (and reconciliation repairs grants when it drops one). Drift and journal tests are green. |
| 2 Escalation + invariant | Ledger/operation table; `escalateTicket` (claim → lease → convert (T-14) → apply with in-transaction pick → outbox) / `escalateTicketFn` / `assertCanEscalate`; `fork_tier_pair_state` + `fork_tier_effects`; recovery job (F-8); reason attribute; `ForkTierPanel` (T-2); watcher + T-1; write guard (T-8, T-10); transactional assignment (T-8, T-9); "Escalated by me" | Paired T1→T2: both sides move in one transaction; agent picked, cursor advanced and applied (or cleared) in that transaction; `firstResponseAt` unchanged; each effect applied once (events at-least-once); SLA unchanged. The escalator can open the ticket until they unwatch and **cannot** reply, note, change status or assign after handoff. Convert-first works. CONFLICT and idempotency hold, **including kill/retry at every step and two competing escalations**. **The R2-5 and R2-6 acceptance tests pass** (second-pass table). An ordinary assignment keeps the pair on one team and writes a ledger row with the next `seq` in the same transaction. A delayed intake workflow does not pull an escalated ticket back to T1. **De-escalation:** a T2 or T3 agent may move a T2 ticket down; a T1 agent may not; a Manager may. `targetTier` resolves to the edge chain. |
| 3 T1 intake | Enable action (intake team required; seeded workflows enabled; routing refused); intake sweep (F-8); routing guard (T-11) | A new chat or a handoff → T1 team on conversation **and** ticket + T1 SLA. Tickets created in the portal, manually or over REST/MCP get the T1 intake team within one sweep. Back-office tickets stay untiered. Turning auto-routing on is refused while tiers are on, including when both are enabled at the same moment. No path lands a new item on T2/T3. |
| 4 Queues | Seeded per-tier views | T2 agents see exactly T2 items |
| 5 Reporting | Timeline + report from the ledger | Reconciles with a fixture that includes ordinary assignments and conversation-only moves before conversion. A carried SLA breach is attributed to the tier at breach time. |
| 6 Automation (**deferred**; until it ships, no automated escalation exists) | Up-only `escalate` action (+ macro, + MCP via F-3) → `escalateTicket` with `source='workflow'` and a key derived from the workflow run and step | `sla.approaching_breach` → escalate is audited and the SLA carries. No action can move down. Seam count re-verified. |
| 7a Requester access | Lead claim service; SSO sign-in trigger (T-13); `claimMyRequesterLeadsFn` (F-10); IdP-verification rule (OI-19) | An employee who emailed support before their first SSO sign-in signs in through the company IdP (JIT) and immediately sees those requests in `/support` and the widget. Unverified ones (including mail with no `Authentication-Results`) keep the badge. They can reply. A mail that arrives after sign-in and fails DMARC is claimed on the next hub load. A blocked lead's user can read but not send, and later unverified mail from the address still lands on the blocked anchor. A user whose address is neither IdP-asserted verified nor on the IdP's verified domain claims nothing. A teammate claims nothing. A failing claim does not fail the sign-in. |
| 7b Hub landing | `routes/_portal/hub.tsx` chain (announcements → find an answer → still need help → track → rate) per the prototype; widget Home section (T-5); "Add Help hub to portal nav" action; T-4 locales | Walkthrough signed out (sections 0–1 plus the SSO sign-in card), signed in (all sections; rows open `/support/$conversationId`), and from the widget. The hub shows the portal header, the N-1 banner and the app's branding with no hub-specific loader. The nav action adds a working link and the upstream nav editor can reorder or hide it. Widget bundle budget and i18n coverage pass. |
| 8 Stage email (**deferred**; until it ships, non-close stage changes send no email) | Requester email on non-close public stage crossings, sent through the configured SMTP transport (internal relay or SES SMTP VPC endpoint), with a link to the request's `/support/$conversationId` thread on the intranet portal URL | An email for each crossing; none for the same stage or a null stage. No link or image in the email points outside the intranet. |

## 9. Testing strategy

- **Service (DB):** paired, ticket-only and convert-first cases; round_robin, balanced and manual teams; agent replaced or
  cleared; SLA byte-identical before and after; ledger, attribute, note and watcher written; `firstResponseAt` not stamped by
  escalation; `targetTier` resolution (and 4 rejected); `source='account_action'` recorded.
- **Escalation durability (mandatory, T2, R2-5).**
  - **R2-5 acceptance test (reviewer's, adapted).** Race two identical `escalateTicketFn` submits (same key) with the recovery
    job, on a ticket-less conversation and a round-robin T2 team. Crash (a) right after the T-14 ticket commit, (b) inside the
    apply transaction after the cursor write, and (c) between an effect's claim and its `done`. Assert: one conversion ticket
    and no orphan; one pair link; one applied move (one ledger row, `seq` +1); the cursor advanced exactly once and equal to
    `chosen_agent_id`; one note, one activity row, one system message; events at-least-once.
  - **Kill/retry at each step.** Inject a crash after claim, inside and after the T-14 conversion transaction, inside and after
    the apply transaction, and between every outbox effect. A retry with the same key, **and** separately the recovery job,
    converges to the same final state with exactly one ledger row, one ticket, one note, one activity row, one watcher row and
    one cursor advance.
  - **Lease fencing.** Worker A claims, then is paused past `lease_until`. Worker B claims and applies. When A resumes, its fenced
    transition matches 0 rows and rolls back (no second ticket, no second move). A throwing `inTx` leaves no ticket row.
  - **Same key, different inputs** → `IDEMPOTENCY_KEY_REUSED`. A replay during another worker's lease → `ESCALATION_IN_PROGRESS`
    carrying the same `escalationId`, and a later replay returns the final result.
  - **Effect ordering.** T1→T2 with its effects held, then T2→T3. The T2 SLA default and reason event are `superseded`, and the
    final SLA and reason are T3's. Effects of one pair never run concurrently (pair effects lease).
  - **Pick parity.** `pickTierAgentInTx` matches `distributeToTeamMember` on the same roster, presence and cursor, for
    round-robin, balanced and manual teams.
  - **Replay contract (40).** The same `idempotencyKey` returns the same `escalationId` in every state. A `rejected` operation
    returns the same `CONFLICT`.
  - **Two competing escalations.** Different keys and the same `expectedFromTeamId`, run in parallel: exactly one applies and the
    other gets `CONFLICT`. Same key in parallel: one operation, both callers get its id.
  - **Escalation vs ordinary writer.** Escalation racing `assignTicketFn`, workflow `assign_team` and REST assign: the final state
    has the pair on one team. The ledger holds each committed change with consecutive `seq` values, and events carry the
    locked pre-image as "from".
- **R2-6 acceptance test (mandatory, reviewer's, adapted).** Pause a workflow `assign_team` (service actor, target T1) after
  upstream's no-op check and before `forkApplyTeamAssignment` takes its locks. Escalate the pair to T2, then resume the
  workflow. It returns the current row, and the pair stays on T2 with no ledger row for the skipped move. Repeat with the pause
  **inside** the fork transaction while it waits on the ticket lock held by the escalation. Repeat through `assignTicket` (REST
  as a service principal) and ticket bulk. Kill the process inside the assignment transaction (nothing is committed) and right
  after its commit (both sides, `seq` and the ledger row are present; only effects are pending). Make an unrelated edit that
  advances `updated_at` (ticket priority, conversation subject) before the sweep. The sweep changes nothing, and the pair
  matches the last recorded `assignment_seq`. A deliberately unhooked SQL team write is reported as `TIER_INVARIANT_DRIFT` and
  restored to the recorded team with a new `seq`.
- **Assignment invariant (mandatory, T3).** After each ordinary path (UI assign, bulk, REST, `functions/teams.ts`, inbox bulk,
  workflow `assign_team`), the ticket and conversation teams match and a ledger row exists. A **delayed** `conversation.created`
  intake run executed after an escalation is skipped (the ticket stays on T2). A human manual move down is allowed and recorded.
  Pre-conversion conversation moves appear in the timeline. Intake sweep: unpaired, manual and REST/MCP tickets → intake team;
  back-office untouched; closed and deleted skipped. Routing guard: enable refused; the verify-after-write race test (both flags
  flipped concurrently) never leaves both on. A grep guard fails on any new upstream writer of the team columns that does not go through `forkApplyTeamAssignment`.
- **Write guard (X-3).** After handoff the escalator gets `TIER_READ_ONLY` on reply, note, status, priority, assign and delete. An
  escalator still on the holding team, the assignee, `view_all` holders and service actors are unaffected. The escalation's own
  note and watch succeed while its effects are pending.
- **Membership (X-1).** `assignTierAgent` racing an upstream `setTeamMembers` save: the tier membership survives unless the upstream
  save's own set omits it, and reconciliation then revokes the orphan grant. Assign and remove are idempotent.
- **Authorization matrix:**
  - Manager ✓ in both directions.
  - Team-scoped holder on the from-team ✓, and on a higher tier ✓ (roll-up). On a lower tier ✗, including down (D-T8).
  - Override without `ticket.assign` ✗.
  - Workspace-wide holder without team membership ✓.
- **Effective tier:** no teams → null; soft-deleted team ignored; multiple teams → max.
- **Policy:** T-1 predicate (escalator + watching ✓; unwatched ✗; other watcher ✗; `view_all` path unchanged; `claimed`/`rejected`
  operation rows grant nothing). Upstream `policy/__tests__` re-run.
- **Hub/auth:**
  - **Lead claim (mandatory, T1), through both triggers (the SSO callback via T-13, and the hub load):**
    - a standalone lead (no user row) is re-pointed and deleted;
    - an unverified lead (weak DMARC, or no `Authentication-Results` header) keeps `unverifiedSender`;
    - a blocked lead → the user is blocked and the anchor is kept, and a new unverified mail reuses the blocked anchor;
    - a lead with a `userId` (widget pre-chat) is never claimed;
    - IdP verification: `emailVerified=true` → claim; `emailVerified=false` but the sign-in provider owns the verified
      domain → claim (OI-19); `emailVerified=false` and no owning provider → no claim; a placeholder address → no claim;
    - a teammate session → no claim;
    - T-13 runs only on the OIDC callback paths, and a throwing claim still completes the sign-in;
    - subscription/vote collisions → the user's row wins;
    - a sign-in claim and a hub-load claim at the same time → one moves the rows, the other is a no-op;
    - idempotent re-run;
    - fork tables re-pointed via F-5.
  - A JIT first sign-in (no user row before the callback) claims in the same request.
  - The hub calls only upstream visitor functions plus `claimMyRequesterLeadsFn` (a static import check), so upstream's
    ownership 404s and `isBlocked` checks apply unchanged.
- **Guardrails:** module-state scan, authz matrix and classifications reconciliation, dep-graph, fork drift/journal tests,
  single + pooled tenancy, widget bundle budget, portal i18n coverage.
- **GUI walkthrough:** configure tiers → a new chat lands in T1 → escalate → T2 queue → the escalator still sees the ticket
  read-only → T2 de-escalates → report. Separately: an employee emails support → signs in with SSO for the first time →
  `/hub` shows the emailed request → replies from `/support`.

## 10. Open items

Each 🟡 row has an adopted default that the design implements now. The owner can overturn it.

| ID | Question (default) | Ref |
| --- | --- | --- |
| OI-16 🟡 | Are tiers an operational routing convention (team queues, not isolation; escalators read-only after handoff) rather than a strict read/write restriction on every path? **Default: routing convention + read-only after handoff.** | §4.5, X-3 |
| D-T8 🟡 | May higher-tier agents outside the team that holds the ticket (roll-up) and Managers de-escalate, as well as the holding team itself? **Default: yes.** | §4.2, 01 |
| OI-17 🟡 | Should escalating a ticket count as its first response? **Default: no** (escalation never stamps `firstResponseAt`). | §4.2 step 4, T3 |
| OI-14 🟡 | When an employee signs in, should earlier **unverified** messages from their address be claimed into their account? On the internal mail server this includes every message that has no `Authentication-Results` header, not only weak-DMARC mail. **Default: yes, keeping the "unverified sender" badge exactly as upstream computes it.** Deployment note (config, not code): have the internal MTA stamp `Authentication-Results` with a DMARC result, so that mail from employees who already have an account attaches directly and carries no badge. | §3, §4.11 step 3 |
| ~~OI-15~~ ✅ | ~~Hide "Find an answer" for hub users without portal access?~~ **Closed as moot (D-E3, D-E4):** every signed-in employee has portal access on a public portal. The section is shown to all, and T-12 is removed. | §4.10 |
| OI-18 🟡 | How does a blocked lead stay blocked once its owner signs in and claims it? **Default: the block moves to the user (the user can read their requests but cannot reply, file or rate), and the lead stays as a block anchor for future unverified mail.** | §4.11 step 3 |
| OI-19 🟡 | The company IdP may not release `email_verified`. May the claim trust an address when the sign-in provider owns that address's **verified** domain (`findProviderForDomainEmail`)? **Default: yes.** The IdP is authoritative for company addresses (D-E1). Without this, no claim would ever run against such an IdP. | §4.11 step 3 |
| OI-20 🟡 | Is a `portalConfig.nav` link item enough for "Help hub"? Its label is single-language and its URL is absolute per app. **Default: yes (no seam).** Restore a built-in nav item seam only if portals need a localized label. | §4.10 |
| OI-21 🟡 | When the sweep finds a tiered pair whose team differs from the last recorded assignment version (an unhooked writer), should it restore the recorded team or adopt the unrecorded write? **Default: restore and alert (`TIER_INVARIANT_DRIFT`),** because an unrecorded write may be an automated de-escalation (D-T9). | §4.6, R2-6 |
| OI-22 🟡 | A human's assignment made from a stale view (the pair was escalated after the form loaded) is applied as a recorded manual override. Should human UI assigns carry an expected-from team and be refused on mismatch? **Default: no.** Human moves are overrides (OI-16). Adding the check needs `expectedTeamId` on upstream's assign input (a larger T-8/T-9). | §4.6, R2-6 |
| OI-23 🟡 | Once-effects (the escalation note, system messages) can repeat only if a runner stalls longer than 2 × the lease in the middle of an upstream call. Events and webhooks stay at-least-once. **Default: accept, with a 30 s lease and per-effect timeouts well below it.** | §4.2 step 5, R2-5 |

## 11. Relationship to other v2 plans

- **10-rbac:** provides `canInTeam`, team-scoped grants, `TEAM_SCOPABLE_PERMISSIONS` and the Tier role templates (workspace-wide
  dashboard keys + team-scoped `ticket.escalate` / `account.*`) for tiers 1–3. It also provides `assignTierAgentFn`, which wraps
  §4.12.
- **40-support-account-actions — contract:**
  - `escalateTicket(input, actor)` is a domain function with **no** permission check of its own. Callers authorize:
    `escalateTicketFn` → `assertCanEscalate`; 40's request flow → `account.request` (via `canInTeam` on the from-team).
  - Input includes `source: 'manual' | 'workflow' | 'mcp' | 'account_action'`, `reason` (40 passes `account_action`, with the
    request id in `note`), **`targetTier` ∈ 1..3**, `expectedFromTeamId`, and a **required, caller-supplied `idempotencyKey`**.
    The operation row is keyed by `(subject_key, idempotency_key)`. A replay with the same subject and key always returns the
    **same** `escalationId` and **resumes** any unfinished step (conversion, apply, outbox effects). It never starts a second
    operation. A replay of a `rejected` operation returns the same error. Only one worker runs a step at a time (operation
    lease, §4.2 step 1a). A same-key replay made while another worker holds the lease gets the retryable
    `ESCALATION_IN_PROGRESS` error, carrying the same `escalationId`. 40 treats it like its other retryable errors (stay
    `pending`, retry). A same-key replay with different inputs gets `IDEMPOTENCY_KEY_REUSED`. D-A11: the ticket moves along the edge chain to the
    first team at or above `targetTier`.
  - Returns `{ escalationId, fromTeamId, toTeamId, direction, state }` only when `state` is `applied` or `done`. `applied` means
    the tier change is committed and only effects remain. Effects are ordered per pair (`seq`), so a later escalation's SLA
    and reason are never overwritten by an earlier one.
  - D-T2 applies: the requester is cleared and made a watcher, so T-1 gives them **read-only** access while watching.
  - Also exported: `listTierMemberships(principalId)` → `[{teamId, tier}]`, plus `getEffectiveTier(principalId)` built on it,
    `getTeamTier(teamId)` and `resolveTeamForTier(minTier, fromTeamId?)`. For `account.execute`, some membership must satisfy
    `tier ≥ min_tier` **and** `canInTeam(actor, 'account.execute', teamId)`.
  - Cold-email requesters become user principals only after the claim, which runs on SSO sign-in and on hub load (§4.11 step 3).
- **20-control-tower:** `sync-members` assigns Tier bundles through `assignTierAgent` / `removeTierAgent` (§4.12), via the fork
  MCP tools `fork_assign_tier_agent` / `fork_remove_tier_agent` (F-3, `member.manage`), acting as the human admin (D-C2). The
  tools take a tier **team** id, not a template key.
- **60-announcements:** T-4 (locales) edits the same 9 locale files as 60's locale seam. The key blocks are separate and namespaced.
  The hub's announcements strip is 60's N-1 mount in `_portal.tsx`, inherited because the hub is now inside `_portal`.
- **20-control-tower:** provisioning applies the `04-…` §3 sign-in baseline (public portal, anonymous off, SSO-only, JIT). The
  claim relies on it. The "Help hub" nav link is portal configuration, so provisioning may set it when it enables the hub.
- **04-intranet-deployment:** the hub adds no outbound call and no inbound webhook. Email is upstream SMTP out and IMAP in.
