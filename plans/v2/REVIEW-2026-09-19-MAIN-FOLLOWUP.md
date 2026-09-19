# Main follow-up review — 2026-09-19

## Reviewed versions

Fetched `origin/main` at `b9f6aee1c` (PR #11) and merged it into the existing working branch, producing `81b7f6ea7`. The merge preserved local edits. No application code changed.

There are two distinct review baselines:

- **Published main:** `b9f6aee1c`. Compared with the prior review's `2e87cb292` baseline, changes are limited to decisions, upgrade conventions, AI deployment instructions, and the review document. The feature-plan implementations of most second-pass fixes have **not** reached this main commit.
- **Newer local drafts:** revisions to 10, 20, 30, 40, and 60 were being edited during this review. I also reviewed a snapshot taken at **16:50:55 UTC**, stored at `/tmp/quackback-main-review-3` with a SHA-256 manifest. Findings below identify when they concern these drafts rather than published main. File links open the working copy, which may have subsequent edits.

## Conclusion

The capabilities remain feasible and compatible with maintaining an upstream-tracking fork. **Published main is not ready for implementation as a complete specification.** The local drafts make substantial progress, but still contain correctness gaps in revocation, conversion, and SLA handling.

The new behavioral-contract tests and populated-fleet upgrade rehearsal in [02 §7a](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/02-fork-conventions.md) are appropriate. Some correct fixes require more integration than the original small-seam estimates: session denial, transactional team assignment, and transactional ticket conversion. Record those dependencies honestly and test their semantics on every upstream upgrade.

## Status of the previous review

For **published main**:

- **R2-9, AI configuration:** resolved. 04 now correctly documents feature overrides inheriting `AI_CHAT_MODEL`, explicit disable sentinels, and the Ask AI override.
- **R2-3, role ownership:** the owner decision is resolved by D-C15: the tower owns the entire role set. The conflicting feature-plan bodies still need the local revisions merged.
- **R2-4, revocation:** D-C16 resolves the choice of directory-driven revocation and tenant-level denial. The enforcement design still needs the local revisions and the corrections below.
- **R2-1/R2-2/R2-5/R2-6/R2-7/R2-8:** the published feature-plan bodies retain the migration/cohort, suspended-resume, escalation recovery, assignment concurrency, mail-adapter, and SSE findings from the [second-pass review](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/REVIEW-2026-09-19-SECOND-PASS.md).

For the **local draft snapshot**:

- 10/20 now agree on a single managed-role writer and removal of local grants. This substantially resolves R2-3.
- 20's full-bundle precondition, fork-only path, maintenance scope, and active-fleet rollout gate address the original R2-1/R2-2 failure scenarios at design level. Serving different upstream versions in active cohorts is explicitly unsupported; confirm that suspension of held-back tenants is acceptable.
- 20's raw-message router, trusted envelope headers, delivery spool and retry rules address the original R2-7 interface mismatch.
- 30's transactional conversion hook, operation leases, transactional agent pick, pair sequence and transactional assignment replace the unsafe designs from R2-5/R2-6. The direction is sound, but the gaps below remain.
- 40 now specifies routing claims and closure behavior and adds principal-denial checks. These improve the prior lifecycle ambiguity, subject to its exact contract with 30.
- 60 adds a subscribe-first design and monotonic revision ordering, addressing the substance of R2-8. Its snapshot was mid-edit, so reconcile the detailed protocol and tests before considering the document finalized.
- 50 remains substantially sound at design level; its framework, scales and Reach choices still require the existing product decisions. No new blocker found here.

## Remaining findings in the local drafts

### R3-1 — P1: deletion plus a sign-in check does not implement immediate session denial

[10 §4.9](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/10-rbac-persona-extensions.md) explicitly adds no denial check to existing-session authentication. It deletes sessions, checks denial before creating a new session, and relies on a five-minute sweep to delete sessions that race the denial. It also acknowledges that demotion can fail for the last admin.

A sign-in can pass the before-hook, pause, and insert its session after `denyPrincipal` deletes existing sessions. Until the sweep runs, that session remains usable. Demotion to `user` does not prevent authenticated portal/widget actions; if demotion fails or has not completed, even team authority may remain. Thus “denied on every auth path immediately after commit” is not established. The existing session-create hook runs before insertion: [auth/index.ts:631](/Users/adamstavely/Documents/GitHub/quackback/apps/web/src/lib/server/auth/index.ts:631).

**Change:** enforce denial at a shared point in existing-session resolution that covers dashboard, portal, widget bearer, uploads, and other direct session consumers, or prove serialization between session insertion and denial that closes this race. Retain row deletion as cleanup. Plan 20 must use the same seam location: its draft still mentions an OIDC after-hook, while plan 10 correctly requires the universal session-create hook.

**Test:** pause session creation after the denial check, commit denial, resume insertion, then immediately make a portal write and a dashboard request before the sweep. Both must be refused. Include the last-admin failure case.

### R3-2 — P1: a successful tenant sync is not proof of fresh directory entitlement

[20 §4.5.4](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/20-control-tower.md) renews `entitlement_expires_at` on every successful `sync-members` and claims lease expiry bounds access even when directory sync is down. But tenant reconciliation can successfully reapply cached tower membership while the directory is unavailable. Repeated reconciliation can keep extending that stale entitlement indefinitely.

There is also a bound mismatch: plan 20 claims the lease duration itself, while plan 10 allows lease duration plus the five-minute sweep for cookie sessions. A sweep schedule is not a hard maximum if the worker is unavailable.

**Change:** renew from a recorded, successful directory observation/version, never merely from successful tenant writes. Cap tenant expiry using the source observation's timestamp. Enforce expiration on every authenticated request if a hard bound is required, and state one consistent bound across 10/20.

**Test:** stop directory refresh while ordinary `sync-members` continues successfully. Access must expire at the agreed time, including with the cleanup worker stopped.

### R3-3 — P1: convert-first escalation compares the wrong initial team

[30 §4.2 steps 2–4](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/30-tiered-support.md) creates a ticket, links the conversation and records the operation, then rejects unless the ticket's `assignee_team_id` equals `expectedFromTeamId`. Ticket creation does not initialize a team: [ticket-intake.service.ts:228](/Users/adamstavely/Documents/GitHub/quackback/apps/web/src/lib/server/domains/tickets/ticket-intake.service.ts:228). The proposed conversion callback does not initialize it either.

For a ticket-less T1 conversation, the expected source is T1 but the newly created ticket's source is NULL. Escalation therefore rejects after conversion, and the pair is temporarily inconsistent. An intake sweep eventually assigning T1 is not an atomic solution and will not reliably handle a conversation already assigned elsewhere.

**Change:** lock and validate the source conversation during conversion; initialize the new ticket and pair state from that locked source in the same transaction, or define an equally atomic conversion-specific CAS. Define how a concurrently established pair is retried. Preserve the correct prior agent/team in the ledger.

**Test:** escalate a ticket-less T1 conversation to T2 with the intake sweep disabled. Conversion and escalation must complete with a correct source, one ticket, and consistent paired assignment. Repeat with a concurrent conversation-team change.

### R3-4 — P1: the conversion SLA helper is neither retry-idempotent nor failure-reporting

[30 §4.2](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/30-tiered-support.md) treats `conversion_tail` as a recoverable once-effect and says the SLA handoff no-ops once applied. Actual [handoffConversationSlaToTicket](/Users/adamstavely/Documents/GitHub/quackback/apps/web/src/lib/server/domains/tickets/ticket-conversation-link.service.ts:324) calls `applySlaToTicket` whenever a conversation policy exists and catches/logs all errors. [applySlaToTicket](/Users/adamstavely/Documents/GitHub/quackback/apps/web/src/lib/server/domains/sla/ticket-sla.service.ts:270) unconditionally rewrites the ticket SLA with a fresh application time and deadline and inserts an event.

A retry after a crash can reset the clock. A failure can appear successful to the outbox and be marked done permanently. The effect's marker does not make a multi-step tail atomic.

**Change:** use a failure-reporting, transactionally idempotent handoff primitive with a durable completion record and the agreed source deadline semantics. Keep it ordered against later SLA changes. Do not reuse the best-effort helper as if it provided those guarantees.

**Test:** crash immediately after applying the SLA but before marking the effect complete; retry must preserve the original deadline and create no duplicate application event. Inject a database failure and verify the effect remains retryable.

### R3-5 — P1: skipping a stale intake assignment does not skip its SLA action

[30 §4.6](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/30-tiered-support.md) seeds workflows with `assign_team(T1)` followed by `apply_sla(T1 default)`. The new transactional assignment correctly skips an automated move that would undo escalation. However, the workflow executor treats the returned assignment as completed and its separate SLA action still runs: [action.executor.ts:479](/Users/adamstavely/Documents/GitHub/quackback/apps/web/src/lib/server/domains/workflows/action.executor.ts:479), [line 519](/Users/adamstavely/Documents/GitHub/quackback/apps/web/src/lib/server/domains/workflows/action.executor.ts:519).

A delayed intake or assistant-handoff workflow can therefore leave the ticket at T2 but replace/reset the conversation's carried SLA with the T1 default. This violates D-T1 even after the team race is fixed.

**Change:** make intake's “assign if eligible, apply default only if no active SLA” one guarded operation, or supply an equivalent transactionally checked SLA action. Do not assume skipping `assign_team` aborts the workflow. Apply the same protection to the ticket intake sweep.

**Test:** hold the intake workflow until after escalation, then resume all its actions. Both the team and existing SLA policy/deadline must remain unchanged.

### R3-6 — P2: the account-action transition-version contract is still optional and inconsistent

[40 §4.7](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/40-support-account-actions.md) passes `expectedTransitionSeq` and describes a sequence advance as a conflict, but permits falling back to `expectedFromTeamId` until plan 30 names the input. [30 §4.2](/Users/adamstavely/Documents/GitHub/quackback/plans/v2/30-tiered-support.md) still declares only `expectedFromTeamId` and checks only team equality.

These differ when the ticket moves T1 → T2 → T1 while routing is pending: team equality passes although the routing decision is stale. Introducing a sequence in storage alone does not enforce the caller's expected version.

**Change:** make `expectedTransitionSeq` an explicit shared contract checked under the pair lock, or explicitly accept team-only semantics and change 40's behavior/tests accordingly. Remove the temporary fallback before implementation and synchronize the seam inventory and phase prerequisites with the new denial/conversion/assignment integrations.

## Outstanding decisions and validation

The role-ownership and directory-driven-revocation choices are now answered; do not ask them again. Still confirm the optional entitlement lease and exact outage behavior, whether local administrator changes may remain effective until reconciliation, suspension of tenants held back from a fleet upgrade, network-only access to exempt banner paths, the IdP/mail-server capabilities, and the existing scoring choices.

This was a static review against the checked-out implementation. No runtime tests were run or claimed to pass for the proposed features. The report records concrete acceptance tests for implementation; neither the published plans nor the newer local drafts should be treated as verified software.
