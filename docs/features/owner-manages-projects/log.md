=====================================================================
Task 1 — The project shape check, the projects table name and the owner-only projects route
Completed: 2026-11-27      Commit: a9455f1

Summary: Added projectShape (refuses wrongly typed bodies, treats absent fields as empty), widened the closed set of list tables by exactly one name (projects), and added the owner-only route at /api/admin/projects/ (GET, POST, PUT?id=, PATCH, DELETE?id=), a faithful copy of the experience route (the diff against it shows only the names and the service definition differ). The owner check runs before any body read and the entry-id pattern before any database call.
Decisions: projectShape is modelled on experienceShape (a text helper for the four string fields and a strings helper for the two arrays; arrays copied, extra keys dropped). The route file is a copy of the experience route with names swapped, helpers copied rather than imported. The ListTable and LIST_TABLES lines were changed exactly as the Step wrote them; nothing else in listSql.ts changed.
Deviations: None.
Files changed: src/lib/admin/projects.ts (modified), src/lib/server/listSql.ts (modified, two lines), src/app/api/admin/projects/route.ts (created), CLAUDE.md (modified, one Routes row, orchestrator), e2e/owner-manages-projects.spec.ts (created)
E2E tests written: E2E-01 to E2E-12      Passed before the change: E2E-01, E2E-12 (the two guard rows the spec names)
Manual checks pending: E2E-32 (the owner's SIT check of the real database, the pooler and row level security).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: DOC-CLAUDE cleared by the CLAUDE.md Routes row; DOCS confirmed as the orchestrator's doc update)
Tier: high (spec Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================

=====================================================================
Task 2 — The Projects screen, retire the earlier Firebase projects code, amend the earlier spec and the docs
Completed: 2026-11-27      Commit: 5148803

Summary: The panel's Projects item now shows the editor on the owner-only store: the owner adds, edits, reorders and, after confirming, deletes projects, and the changes persist. The Firebase projects store and its old spec are deleted, the sign-in spec's menu loop also skips Projects, and the CLAUDE.md Leftover rules sentence is updated. The Routes row for /api/admin/projects/ already existed (added in Task 1), exactly once.
Decisions: ProjectsEditor's store is a module-level const named as in ExperienceEditor. The two files were removed with git rm, which stages the deletions.
Deviations: None.
Files changed: src/app/components/admin/ProjectsEditor.tsx (modified), src/app/components/admin/AdminPanel.tsx (modified), CLAUDE.md (modified), src/lib/firebase/projects.ts (deleted), e2e/manage-projects.spec.ts (deleted), e2e/owner-manages-projects.spec.ts (modified), e2e/owner-google-sign-in.spec.ts (modified: one line, the menu-loop filter)
E2E tests written: E2E-13 to E2E-28, E2E-30, E2E-31 (E2E-29 is a compiler check)      Passed before the change: E2E-30 (it passes because the test author made the sign-in amendment, which is that row's subject)
Manual checks pending: E2E-32 (the owner's SIT check).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high only because of the test-passed-before-change escalation (the Step itself is Risk: low)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
