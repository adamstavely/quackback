# Releasing the fork

The Docker publishing workflow builds the upstream Dockerfile as an intermediate
image, then publishes the final `apps/web/Dockerfile.fork` layer. Only the final
digest is added to release tags. The workflow checks the final image for the fork
journal and every SQL file before exporting its digest to the manifest job.

For local builds, follow the two build commands in `apps/web/Dockerfile.fork`.
Do not deploy the intermediate base image: it intentionally lacks fork SQL.

## Pooled fleet rollout

1. Run the existing upstream fleet migration rollout for the approved cohort.
2. Using the **same final image**, run `fleet-migrator fork --cohort <cohort>`
   (or `fork --workspace <workspace-key>`). In the image this is
   `bun /app/fleet-migrator.mjs fork --cohort <cohort>`, with the normal migrator
   role and control-database configuration.
3. Require exit code zero before admitting traffic to that release.

The explicit fork pass includes active, enrolled tenants already current
upstream. The upstream queue intentionally never claims those tenants. It refuses
a tenant missing any upstream migration bundled in this image, rather than
advancing a withheld upstream migration. Blocked tenants are skipped; explicitly
selecting a blocked, suspended, missing, or unenrolled tenant fails. The pass runs
sequentially to bound database wake-ups. It uses the existing direct-connection
migration runner and its advisory lock, and reconciles system permissions.

Serving-pool acquisition independently checks the fork lineage and the receipt
for this build's permission catalogue. Missing requirements trigger catch-up and
are rechecked before serving. Fork ledger holes or changed migration hashes fail
closed rather than silently skipping SQL. Suspended tenants are not activated by
this command; their first serving acquisition must pass the same gate after the
existing resume process makes them eligible. This does not implement the separate
control-tower provisioning/resume workflow that remains planned.

A catalogue receipt is written only after seeding succeeds. Receipts are immutable
per catalogue version, so checking an older replica's receipt does not itself
reseed an old permission catalogue over a newer rollout. Keep expand/contract
migration discipline; a receipt does not make destructive changes compatible.

## Validation before release

- Build the final fork image and check its packaged migration files.
- Boot it against an empty disposable database.
- Test an upstream-current tenant missing fork tables and one missing catalogue
  reconciliation. Both must recover before serving.
- Repeat against populated fork settings and verify a second run is a no-op.
- Run the banner lifecycle, audience/priority selection, and revision-order tests.
- Rehearse the actual upstream upgrade and suspended-tenant resume against populated
  staging data. Unit tests and a clean merge do not replace that rehearsal.
