# Fork Plans — v2

v2 supersedes the original plans in `plans/v1/`. It fixes the issues found in the v1 review, records the
owner's decisions, and puts every feature under one set of fork conventions so that upstream Quackback
releases keep merging cleanly.

## Read in this order

| #   | Document                                                             | What it is                                                                   |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 00  | [`00-v1-review.md`](00-v1-review.md)                                 | Review of the six v1 plans against the code: cross-cutting and per-plan issues. |
| 01  | [`01-decisions.md`](01-decisions.md)                                 | Owner answers (✅), proposed defaults awaiting confirmation (🟡), pending (⏳). |
| 02  | [`02-fork-conventions.md`](02-fork-conventions.md)                   | **Binding** rules for all fork code: layout, migrations, seams, merge steps. |
| 03  | [`03-staff-review.md`](03-staff-review.md) · [original](REVIEW-2026-09-19.md) | Staff engineer review of v2 (summary + full original) and how each finding was resolved. |
| 04  | [`04-intranet-deployment.md`](04-intranet-deployment.md)             | Intranet, no-internet deployment: required fork changes, config baseline, features to disable. |
| —   | [`SEAMS.md`](SEAMS.md)                                               | Registry of every planned edit to upstream-owned files (merge checklist).     |
| 10  | [`10-rbac-persona-extensions.md`](10-rbac-persona-extensions.md)     | Custom roles on REST/MCP, fork permission keys, team-scoped RBAC, personas.  |
| 20  | [`20-control-tower.md`](20-control-tower.md)                         | Multi-app fleet: provisioner + separate control-tower app acting via MCP.   |
| 30  | [`30-tiered-support.md`](30-tiered-support.md)                       | Tier 1/2/3 on teams, ticket escalation, per-tier SLA and reporting, support hub. |
| 40  | [`40-support-account-actions.md`](40-support-account-actions.md)     | Tier-gated actions on accounts in connected customer apps, with request→approve. |
| 50  | [`50-prioritization-scoring.md`](50-prioritization-scoring.md)       | RICE (BRICE pending) scoring on posts, with Reach derived from votes.        |
| 60  | [`60-announcements-banner.md`](60-announcements-banner.md)           | Announcements banner (portal + embed), folding in live status incidents.     |

## Implementation roadmap

See [05-implementation-plan.md](05-implementation-plan.md) for the dependency-ordered work packages, PR boundaries,
release gates, external prerequisites and first implementation slice, based on `fa68658da` (including the third-review fixes).
The provisioner migration/maintenance core is built with Foundations; fleet membership and the tower UI follow their RBAC and feature dependencies.

## Delivery order

The owner-selected product phases are:

1. Deploy separate app instances (isolated hostnames/databases on the planned shared runtime).
2. Add the per-app portal page using existing support surfaces.
3. Add the portal and embedded announcement banner.
4. Create the control tower, including access management and fleet announcements.
5. Layer in tiered support, account actions, automation, email and reporting; retain prioritization and portfolio in this phase.

See [05-implementation-plan.md](05-implementation-plan.md) for the supporting work, acceptance gates and estimates inside each phase. Foundations and production verification start in Phase 1; authorization ships before the capabilities that depend on it. The early portal does not depend on tiered support, and the initial tower does not expose tier-specific functionality until Phase 5.

## Status

All documents are **plans only**. Nothing is implemented. In `01-decisions.md`, ✅ items are decided, 🟡 items are
**adopted defaults** the plans are built on (the owner may still override them), and ⏳ items block the phases that
depend on them.

**Scope honesty.** Several capabilities arrive in later phases: workflow/macro escalation, non-close stage emails,
Quinn account actions and the tower portfolio view. An early release with manual escalation or a local-only banner
does **not** deliver the full requested capability set, and release notes must say so.

**Upgrade promise.** The fork is a *maintained, tested fork that can take upstream releases*, not a conflict-free
one. Every upgrade follows `02-fork-conventions.md` §7, including semantic review, negative authorization tests and
a populated-database upgrade rehearsal.
