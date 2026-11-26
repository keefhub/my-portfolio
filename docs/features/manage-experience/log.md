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
