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

=====================================================================
Task 2 — The Certifications screen with its badge picker, retire the earlier Firebase certifications code, amend the earlier specs and the docs
Completed: 2026-11-27      Commit: 0b2eff3

Summary: The panel's Certifications item now shows the editor on the owner-only store: the owner adds, edits, reorders and, after confirming, deletes certifications, and the changes persist. The badge is an uploaded image or a typed path; a typed or saved address still saves when the image list fails, and the list load does not depend on the images. Each row shows its badge image (by file name when the image list is loaded, otherwise the saved text) and its credential link. The Firebase certifications store and its old spec are deleted. The sign-in spec's menu loop and the projects spec's file list are updated, and CLAUDE.md gets the Routes row (this spec's D-20: Task 2 adds it) and the Leftover rules sentence.
Decisions: rowDetails is a local function inside the component because it needs the loaded image list. The store is a module-level const. The CLAUDE.md Routes row was added directly after the projects row; exactly one such row exists.
Deviations: None.
Files changed: src/app/components/admin/CertificationsEditor.tsx (modified), src/app/components/admin/AdminPanel.tsx (modified), CLAUDE.md (modified), src/lib/firebase/certifications.ts (deleted), e2e/manage-certifications.spec.ts (deleted), e2e/owner-manages-certifications.spec.ts (modified), e2e/owner-google-sign-in.spec.ts (modified: the menu-loop filter), e2e/owner-manages-projects.spec.ts (modified: one line of the file list)
E2E tests written: E2E-13 to E2E-32, E2E-34, E2E-35 (E2E-33 is a compiler check)      Passed before the change: E2E-34 (it reads the earlier specs; the two amendments by the test author are its subject)
Manual checks pending: E2E-36 (the owner's SIT check).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high only because of the test-passed-before-change escalation (the Step itself is Risk: low)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
