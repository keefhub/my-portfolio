=====================================================================
Task 1 — Add the certifications modules and the pure rows
Completed: 2026-11-26      Commit: 972c4c8

Summary: src/lib/admin/certifications.ts and src/lib/firebase/certifications.ts; pure rows E2E-01 to 03 pass.
Decisions: checkCertification reports iconRequired when the trimmed icon is empty, otherwise iconInvalid; both modules follow the projects pattern.
Deviations: None.
Files changed: src/lib/admin/certifications.ts, src/lib/firebase/certifications.ts, e2e/manage-certifications.spec.ts (created)
E2E tests written: E2E-01 to E2E-03      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None. Test correction: four loop expressions `results[i].ok === false && results[i].errors` failed typecheck (no narrowing through a variable index); a fresh test author narrowed them through a local function with the same asserted values.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Task 2 — Add `addLabel`, build the Certifications screen, show it for the "Certifications" menu item and move four placeholder tests
Completed: 2026-11-26      Commit: f244fb2

Summary: CertificationsEditor on ListEditor ("Add certification"), badge picked from uploaded images or typed as a repo path via photoSelection. 17/17 certifications rows; experience 31, projects 18, sign-in 19, profile 32 pass.
Decisions: addLabel changes only the control that opens the add form; image list loads once on mount, state set after the await under a mounted flag; renderFields is a closure so it sees the images; select and path derive from photoSelection(value.icon, images).
Deviations: None.
Files changed: src/app/components/admin/ListEditor.tsx, AdminPanel.tsx, Reference.md (modified), src/app/components/admin/CertificationsEditor.tsx (created), e2e/manage-certifications.spec.ts, e2e/admin-sign-in.spec.ts, e2e/manage-profile.spec.ts, e2e/manage-experience.spec.ts, e2e/manage-projects.spec.ts (modified)
E2E tests written: E2E-04 to E2E-17      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; large-diff)
Review: risk reviewer PASS (review 1)
Findings: spec-defect | note | logged | E2E-14 says "four buttons of the first row" (the first row has no Move up, so three) and "position 2" (bottomPosition gives 3 after a delete without renumbering); the test asserts the three buttons and a position after the previous last with order [L1, E, N], matching D-08's new-at-end intent; not weakened
=====================================================================
=====================================================================
Completion — manage-certifications
Completed: 2026-11-26

Built: certification rules and store binding (Task 1); optional ListEditor addLabel and the Certifications screen with a badge from uploaded images or a repo path, four placeholder tests moved to "Tech stack" (Task 2).
Deviations from the spec: None. One locked-test typing correction (narrowing through a local), not weakened.
[auto] decisions: 12 lines tagged [auto] in spec.md. No auto-revisions.
Feature review: PASS (Task 1, low tier, probed with edge inputs)
Findings: spec-defect | note | logged | E2E-14 wording says "four buttons" and "position 2"; the test asserts three buttons and new-at-end order (correct behaviour). Fix the spec wording at the next revision.
Final verification: npm run build ok; npx playwright test e2e/manage-certifications.spec.ts 17 passed, 0 failed.
Manual checks pending: None.
Follow-ups: OQ-3 a typed web address is accepted in the badge path field (deliberately lenient, D-11).
=====================================================================
