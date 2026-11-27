=====================================================================
Task 1 — The tech category shape check and icon rule, the tech_categories table name and the owner-only tech stack route
Completed: 2026-11-27      Commit: 993c008

Summary: Added techShape (refuses wrongly typed bodies at category and item level; one bad item refuses the whole category, nothing stored), one icon rule for the browser and the server (a repo path, or an http(s) address of the form host/storage/v1/object/public/images/name; an arbitrary external address stays refused), widened the closed set of list tables by exactly one name (tech_categories), and added the owner-only route at /api/admin/tech-stack/ (GET, POST, PUT?id=, PATCH, DELETE?id=), a faithful copy of the certifications route (the diff shows only the imports, the service definition and the names differ). The owner check runs before any body read and the entry-id pattern before any database call. The old Firebase-era tech stack spec is deleted (it called the old two-argument check). The projects and certifications specs' pins of the exact table set now list four names.
Decisions: techShape treats absent and undefined the same (both become empty). The route is the certifications route with the names swapped (helpers copied, not imported). The uploaded-icon regex is a module constant ICON_UPLOADED next to ICON_PATH. The editor's check prop is now checkTechCategory directly.
Deviations: None in the production code. The first implementer run reported BLOCKED only because of one type error in the locked test file (line 545 assigned a property the test's own cast type did not declare); the test author corrected that single line (a cast), the orchestrator checked the diff was exactly that line, and the implementer's work was kept.
Files changed: src/lib/admin/techstack.ts (modified), src/lib/server/listSql.ts (modified, two lines), src/app/api/admin/tech-stack/route.ts (created), src/app/components/admin/TechStackEditor.tsx (modified, the check prop), e2e/manage-tech-stack.spec.ts (deleted), e2e/owner-manages-tech-stack.spec.ts (created), e2e/owner-manages-projects.spec.ts (modified: two table-set lines), e2e/owner-manages-certifications.spec.ts (modified: four table-set lines)
E2E tests written: E2E-01 to E2E-12      Passed before the change: E2E-01, E2E-12 (the two guard rows the spec names)
Manual checks pending: E2E-36 (the owner's SIT check of the real database, the pooler and row level security).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: DOC-CLAUDE for the new route, answered: this spec's D-20 has Task 2 add the CLAUDE.md Routes row, so the orchestrator did not edit CLAUDE.md here)
Tier: high (spec Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: security | note | logged | the uploaded-icon rule accepts a storage-shaped address on any host (https://evil.example/storage/v1/object/public/images/x.png), exactly as the spec's D-5 describes; it still refuses https://example.com/react.png and only the owner can send one; worth a line in the pull request in case a later goal renders these icons on a public page
=====================================================================
