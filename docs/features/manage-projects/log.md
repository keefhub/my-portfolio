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
=====================================================================
Task 2 — Extend the shared list editor, build the Projects screen, show it for the "Projects" menu item and move three placeholder tests
Completed: 2026-11-26      Commit: bbbfed3

Summary: ProjectsEditor on the shared ListEditor (with emptyText, listLabel, newPosition props whose defaults keep Experience unchanged). 18/18 projects rows; experience 31, sign-in 19, profile 32 pass.
Decisions: ListEditor falls back to LIST_MESSAGES.empty, `${heading} entries` and topPosition when a prop is absent; paragraph rows use a textarea with flex 1 1 12rem and minWidth 0; Short description shows no error line.
Deviations: None.
Files changed: src/app/components/admin/ListEditor.tsx, AdminPanel.tsx, Reference.md (modified), src/app/components/admin/ProjectsEditor.tsx (created), e2e/manage-projects.spec.ts, e2e/admin-sign-in.spec.ts, e2e/manage-profile.spec.ts, e2e/manage-experience.spec.ts (modified)
E2E tests written: E2E-06 to E2E-18      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None. Test corrections by fresh test authors: (1) three toHaveValues on multi-element locators replaced by toHaveCount plus per-element toHaveValue (Playwright's toHaveValues only works on a single select); (2) E2E-17's banned patterns built by concatenation so the gate's SILENCED check does not flag the pattern list itself. Risk reviewer confirmed neither weakened its row.
Mechanical gate: PASS after one test fix (first FAIL: SILENCED false positive on E2E-17's pattern list; warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; large-diff)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
