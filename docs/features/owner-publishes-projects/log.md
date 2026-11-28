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
