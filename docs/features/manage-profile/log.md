=====================================================================
Task 1 — Add the pure profile module and the profile read and write module, and move the two earlier "email" searches
Completed: 2026-11-26      Commit: 9dca3e2

Summary: src/lib/admin/profile.ts (checkProfile, profileFromData) and src/lib/firebase/profile.ts (loadProfile, saveProfile). The two earlier "email" searches skip exactly the three profile files (the Email field makes the word unavoidable); E2E-28 in Task 2 replaces the guard for them.
Decisions: saveProfile races setDoc against a SAVE_TIMEOUT_MS rejection and clears the timer in finally (OQ-2: no row can test the timeout); profileFromData keeps non-null object items in socialLinks as worded.
Deviations: None.
Files changed: src/lib/admin/profile.ts (created), src/lib/firebase/profile.ts (created), e2e/manage-profile.spec.ts (created), e2e/admin-sign-in.spec.ts, e2e/admin-owner-only-access.spec.ts (modified, exclusions)
E2E tests written: E2E-01 to E2E-07      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: high (large-diff, 177 non-test lines)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
