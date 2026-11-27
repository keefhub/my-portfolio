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
