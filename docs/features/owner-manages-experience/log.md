=====================================================================
Task 1 — The shared list store type, the experience shape check and the browser's list store
Completed: 2026-11-27      Commit: 6c66c17

Summary: Moved the ListStore type and the list id pattern into the shared list module, added experienceShape (refuses wrongly typed bodies, treats absent fields as empty) and listClient, the browser's calls to the owner-only list routes with one fixed error text and no request when a reorder has no changes. The Firebase list store now imports its type from the shared module.
Decisions: listClient uses one private send() that adds cache no-store, a 15 s timeout, the JSON content-type and the ok check, so every failure is the fixed "The request failed." error. experienceShape copies details so the result is a fresh object. src/lib/firebase/list.ts imports ListStore as a type and re-exports it with export type next to the import.
Deviations: None.
Files changed: src/lib/admin/list.ts (modified), src/lib/admin/experience.ts (modified), src/lib/admin/listClient.ts (created), src/lib/firebase/list.ts (modified), e2e/owner-manages-experience.spec.ts (created)
E2E tests written: E2E-01, E2E-02, E2E-03      Passed before the change: E2E-01 (a guard row the spec says already holds)
Manual checks pending: None for this task (E2E-31, the owner's SIT check, is owned by a later task).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (spec Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
