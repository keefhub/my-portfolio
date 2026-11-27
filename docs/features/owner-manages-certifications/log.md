=====================================================================
Task 1 — The certification shape check, the certifications table name and the owner-only certifications route
Completed: 2026-11-27      Commit: 481a653

Summary: Added certificationShape (refuses wrongly typed bodies, treats absent fields as empty; the badge and link rules of checkCertification are unchanged), widened the closed set of list tables by exactly one name (certifications), and added the owner-only route at /api/admin/certifications/ (GET, POST, PUT?id=, PATCH, DELETE?id=), a faithful copy of the projects route (the diff shows only the import names and the service definition differ). The owner check runs before any body read and the entry-id pattern before any database call. The projects spec's pin of the exact table set now lists three names.
Decisions: certificationShape reads each of name, icon and url through one small local helper (absent gives an empty string, a non-string gives null) and returns a new three-key object. The route was made by copying the projects route's text and renaming the symbols. listSql.ts changed only the two named lines.
Deviations: None.
Files changed: src/lib/admin/certifications.ts (modified), src/lib/server/listSql.ts (modified, two lines), src/app/api/admin/certifications/route.ts (created), e2e/owner-manages-certifications.spec.ts (created), e2e/owner-manages-projects.spec.ts (modified: the two table-set expectations)
E2E tests written: E2E-01 to E2E-12      Passed before the change: E2E-01, E2E-12 (the two guard rows the spec names)
Manual checks pending: E2E-36 (the owner's SIT check of the real database, the pooler and row level security).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: DOC-CLAUDE for the new route, answered: this spec's D-20 has Task 2 add the CLAUDE.md Routes row, so the orchestrator did not edit CLAUDE.md here)
Tier: high (spec Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
