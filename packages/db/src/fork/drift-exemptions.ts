/**
 * Upstream's drift check diffs the live schema against upstream's `src/schema`
 * only, so it sees every fork table as undeclared and wants to drop it. Those
 * statements are exempt there (seam F-2); the fork lineage has its own
 * journal-integrity test, and fork tables are declared in `src/fork/schema`.
 *
 * The pattern matches only a quoted `fork_` identifier, so it cannot hide drift
 * in an upstream table.
 */
export const FORK_DRIFT_EXEMPTIONS: { reason: string; pattern: RegExp; optional?: boolean }[] = [
  {
    reason: 'fork lineage table (packages/db/drizzle-fork), not declared in upstream src/schema',
    pattern: /"fork_[a-z0-9_]+"/,
    optional: true,
  },
]
