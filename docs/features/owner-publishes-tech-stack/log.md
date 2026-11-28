=====================================================================
Task 1 — The landing page shows the saved tech stack
Completed: 2026-11-28      Commit: b61ba7b   (this commit removes the hard-coded tech stack categories; the owner re-enters them from its parent, D-13)

Summary: Server-only tech stack read with the build guard, client-safe tolerant view rules, the page renders section#experience only when entries or categories exist and passes showExperience to the header; the hard-coded categories are gone.
Decisions: local text/isPlainObject helpers; max-w-full beside break-words on the h3 and item name, min-w-0 on card and tile (D-15); index keys.
Deviations: None.
Files changed: src/lib/publicTechStack.ts (created), src/lib/server/publicTechStack.ts (created), src/app/page.tsx, src/app/components/techstack.tsx, src/app/components/header.tsx (modified), e2e/owner-publishes-tech-stack.spec.ts (created)
E2E tests written: E2E-01..E2E-11, E2E-15      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (large-diff)
Review: risk reviewer PASS (review 1)
Findings: edge-case | note | logged | ICON_PATH accepts "/\evil.example/x.png" (backslash may resolve protocol-relative); the panel refuses it; tighten to /^\/(?![\/\\])\S+$/ if revisited
=====================================================================
