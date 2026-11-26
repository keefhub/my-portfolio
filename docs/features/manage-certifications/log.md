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
