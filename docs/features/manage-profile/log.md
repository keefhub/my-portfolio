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
=====================================================================
Task 2 — Build the Profile screen, show it for the "Profile" menu item, and move the earlier placeholder test
Completed: 2026-11-26      Commit: ae18a1a

Summary: ProfileEditor loads profile/main and the uploaded images, saves through saveProfile, shows fixed messages for every failure, and refuses to show a form when the profile cannot be read. 32/32 profile rows pass; sign-in 19/19.
Decisions: the "Uploaded image" select has a separate <label htmlFor> so options stay out of its accessible name; index keys for rows; both loads run through Promise.allSettled and set state only after the await.
Deviations: None.
Files changed: src/app/components/admin/ProfileEditor.tsx (created), src/app/components/admin/AdminPanel.tsx (modified), Reference.md (modified), e2e/manage-profile.spec.ts, e2e/admin-sign-in.spec.ts (modified)
E2E tests written: E2E-08 to E2E-32      Passed before the change: E2E-24 (a non-allowed account sees no Profile button)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None. Test correction: locked E2E-09 and E2E-21 pinned updatedAt to the seed value 1 through ...FULL while every save writes Date.now() (and the rows assert > 1e12); a fresh test author set updatedAt: got.updatedAt in the matched object; every other field and the greater-than check unchanged (risk reviewer confirmed not weakened).
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; large-diff; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: edge-case | note | logged | link errors are keyed by row index until the next Save (D-16); removing a row after a failed Save can leave an error on the wrong row
=====================================================================
=====================================================================
Completion — manage-profile
Completed: 2026-11-26

Built: pure profile rules and the profile read/write module, with the earlier "email" searches skipping exactly the three profile files (Task 1); the Profile screen for the "Profile" menu item, the form pattern later editors reuse (Task 2).
Deviations from the spec: None. Locked E2E-09 and E2E-21 corrected by a fresh test author (updatedAt pinned to the seed value), not weakened.
[auto] decisions: 20 lines tagged [auto] in spec.md. No auto-revisions.
Feature review: PASS
Findings: edge-case | note | logged | link errors keyed by row index until the next Save (D-16); clear errors in the remove handlers if this is ever changed
Final verification: npm run build ok; npx playwright test e2e/manage-profile.spec.ts 32 passed, 0 failed.
Manual checks pending: None.
Follow-ups: OQ-2 (a save that never settles shows as failed after 10 s, but the SDK may still deliver it later if the connection returns before a reload).
=====================================================================
