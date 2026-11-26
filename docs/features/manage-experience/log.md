=====================================================================
Task 1 — Add the shared list modules, the experience modules and the pure rows
Completed: 2026-11-26      Commit: 13e3a58

Summary: src/lib/admin/list.ts and src/lib/firebase/list.ts (reusable for projects, certifications, tech stack), plus src/lib/admin/experience.ts and src/lib/firebase/experience.ts. Pure rows E2E-01 to 06 pass.
Decisions: one private withTimeout helper races each write against LIST_TIMEOUT_MS and clears the timer in finally (OQ-2, no row can check it); add makes the id with doc(collection(...)) then setDoc; load reads position from raw data with a finite-number test; checkExperience never mutates input.
Deviations: None.
Files changed: src/lib/admin/list.ts, src/lib/admin/experience.ts, src/lib/firebase/list.ts, src/lib/firebase/experience.ts (created), e2e/manage-experience.spec.ts (created)
E2E tests written: E2E-01 to E2E-06      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: high (large-diff, 239 non-test lines)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Task 2 — Build the shared list editor and the Experience screen, show it for the "Experience" menu item, and move the two earlier placeholder tests
Completed: 2026-11-26      Commit: e290d33

Summary: ListEditor<T> (reusable), formParts.tsx and ExperienceEditor; AdminPanel shows it for "Experience". 31/31 experience rows; sign-in 19, owner-only 22, image library 54, profile 32, smoke 3 all pass.
Decisions: each field is a div with <label htmlFor>, the control and FieldError (keeps a textarea's value out of its accessible name); index keys for detail lines; draft is T | null with a separate FormState {add} | {edit, id}.
Deviations: None.
Files changed: src/app/components/admin/formParts.tsx, ListEditor.tsx, ExperienceEditor.tsx (created), src/app/components/admin/AdminPanel.tsx, Reference.md (modified), e2e/manage-experience.spec.ts, e2e/admin-sign-in.spec.ts, e2e/manage-profile.spec.ts (modified)
E2E tests written: E2E-07 to E2E-31      Passed before the change: E2E-24 (not-allowed account sees no editor)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None. Test correction: locked E2E-11 pinned updatedAt to the seed value through ...S while the row asserts > BIG; a fresh test author added updatedAt: s.updatedAt after the spread (risk reviewer confirmed not weakened).
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; large-diff; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Completion — manage-experience
Completed: 2026-11-26

Built: shared pure list rules and a generic list store with batched reorder and 10 s write limits, plus the experience modules (Task 1); the reusable ListEditor, shared form pieces and the Experience screen for the "Experience" menu item, with the earlier placeholder tests moved to "Projects" (Task 2).
Deviations from the spec: None. Locked E2E-11 corrected by a fresh test author (updatedAt pinned to the seed value), not weakened.
[auto] decisions: 21 lines tagged [auto] in spec.md. No auto-revisions.
Feature review: PASS
Findings: edge-case | note | logged | list load() has no timeout (writes do); a hung read leaves "Loading entries…" until the SDK rejects. Optional follow-up: wrap getDocsFromServer in withTimeout.
Final verification: npm run build ok; npx playwright test e2e/manage-experience.spec.ts 31 passed, 0 failed.
Manual checks pending: None.
Follow-ups: the load() timeout above; OQ-5 run admin specs with --workers=1 when several files run together.
=====================================================================
