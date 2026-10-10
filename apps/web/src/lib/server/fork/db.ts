/**
 * The fork's tables, for fork server code. Upstream code reaches the database
 * only through `@/lib/server/db`; fork tables are not in that module (adding
 * them would be an edit to an upstream file every time the fork adds a table),
 * so this is the one place that imports them, and fork code imports from here.
 */
// oxlint-disable-next-line no-restricted-imports -- the fork's single bridge to its own tables
export * from '@quackback/db/fork'
