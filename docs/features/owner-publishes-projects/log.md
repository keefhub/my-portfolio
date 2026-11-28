=====================================================================
Task 1 — The landing page shows the saved projects
Completed: 2026-11-28      Commit: adda6c3   (this commit removes the hard-coded projects; the owner re-enters them from its parent, D-13)

Summary: Server-only projects read with the build guard, tolerant view rules with the http(s)-only link rule, the page renders section#projects only when there are projects and passes showProjects to the header; the hard-coded projects are gone.
Decisions: loadPublishedProjects copies the experience read; showProjects added beside showAbout and showExperience; the projects read is the last sequential await.
Deviations: back-face bullet is an empty aria-hidden span drawing "•" via before:content-['•'] (same token and layout) so the li text is only the paragraph (locked tests E2E-10/E2E-11).
Files changed: src/lib/publicProjects.ts (created), src/lib/server/publicProjects.ts (created), src/app/page.tsx, src/app/components/project.tsx, src/app/components/header.tsx (modified), e2e/owner-publishes-projects.spec.ts (created)
E2E tests written: E2E-01..E2E-13, E2E-15      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (large-diff, implementer-deviation)
Review: risk reviewer PASS (review 1)
Findings: nit | note | logged | link check accepts a bare "https://" (dead link); javascript:/data:/relative values give no link as required
Findings: nit | note | logged | CSS bullet deviation acceptable
=====================================================================
=====================================================================
Task 2 — The earlier checks follow the change
Completed: 2026-11-28      Commit: 9053f46

Summary: Earlier specs no longer expect the Projects section, its heading or project.tsx on a nothing-saved page; the four owner-publishes-* spec files were added to ALLOWED_PUBLIC_PATHS in retire-firebase E2E-64 and hosting E2E-ACC-20 (they mention "retire-firebase.spec.ts"); E2E-16 guards the removals.
Decisions: profile spec loop ids now ["certifications"].
Deviations: The first implementer run hit the Stop-if (E2E-64 and E2E-ACC-20 failing on the goal's own new spec files, a regression from slices 21-23 not caught because each slice runs only its own spec); auto-revision D-21 settled it. The locked E2E-16 test was kept across the revision because the revision did not change it.
Files changed: e2e/retire-firebase.spec.ts, e2e/hosting-and-backend-migration-acceptance.spec.ts, e2e/owner-publishes-profile.spec.ts, e2e/owner-publishes-experience.spec.ts, e2e/owner-publishes-projects.spec.ts (modified)
E2E tests written: E2E-16      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: Step 2 blocked on E2E-64/E2E-ACC-20 leftovers; D-21 (spec 0.1.2).
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Task 3 — The standing documents describe the projects as read from the database
Completed: 2026-11-28      Commit: 80b8f1d

Summary: CLAUDE.md (the / row, invariant 1, admin-modules import rule) and Reference.md (tree line, data list, "Adding a New Project") describe the public projects read and the panel-then-Publish path.
Decisions: publicProjects.ts listed after publicTechStack.ts.
Deviations: None.
Files changed: CLAUDE.md, Reference.md (modified); e2e/owner-publishes-projects.spec.ts (modified)
E2E tests written: E2E-17      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Completion
Completed: 2026-11-28

Built: server-only projects read with the build guard, tolerant view rules with the http(s)-only link rule, the Projects section and menu link hidden when empty, earlier checks and documents brought in line, and the goal's new spec files allowed by the two firebase-search guard tests.
Removed content (D-13): the hard-coded projects were removed in adda6c3; the owner re-enters them from its parent (adda6c3^:src/app/components/project.tsx).
Deviations from the spec: CSS-drawn back-face bullet; completion fix of locked E2E-08 (it matched the editor's own alert as well as the Publish failure; now filters by the failure text, assertions unchanged).
[auto] decisions in the spec: 18 lines (D-04..D-21).
Feature review: PASS
Findings: edge-case | note | logged | link rule accepts a bare "https://" (dead link)
Final verification: npm run build ok; e2e/owner-publishes-projects.spec.ts 16 passed, 0 failed (after one completion fix).
Manual checks pending: None.
Follow-ups: OQ-2, the hero's "View My Work" button points at a hidden section when there are no projects.
=====================================================================
