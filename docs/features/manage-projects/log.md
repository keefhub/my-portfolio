=====================================================================
Task 1 — Add `bottomPosition`, the projects modules and the pure rows
Completed: 2026-11-26      Commit: 6a3dd37

Summary: bottomPosition in src/lib/admin/list.ts, src/lib/admin/projects.ts and src/lib/firebase/projects.ts. Pure rows E2E-01 to 05 pass.
Decisions: bottomPosition mirrors topPosition (max below UNPOSITIONED plus 1, else 0); both projects modules copy the experience pattern.
Deviations: None.
Files changed: src/lib/admin/list.ts (modified), src/lib/admin/projects.ts, src/lib/firebase/projects.ts (created), e2e/manage-projects.spec.ts (created)
E2E tests written: E2E-01 to E2E-05      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
