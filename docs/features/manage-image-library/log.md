=====================================================================
Task 1 — Write the storage and image-list rules, start the Storage emulator, extend the rules deploy and prove the refusals
Completed: 2026-11-26      Commit: cc67f10

Summary: Storage rules and the owner-only images collection rule, proven against the Auth, Firestore and Storage emulators (15 rows). deploy:rules now deploys firestore:rules,storage; the workflow itself is unchanged.
Decisions: storage.rules ends with a default-deny comment; create rule split over several lines; no "email" or process.env.
Deviations: None.
Files changed: storage.rules (created), firestore.rules, firebase.json, playwright.config.ts, package.json, .claude/repo-profile.md, CLAUDE.md (modified), e2e/manage-image-library.spec.ts (created), e2e/admin-owner-only-access.spec.ts (modified, three repointed rows)
E2E tests written: E2E-01 to E2E-15      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS CLAUDE.md is the orchestrator's update)
Tier: high (Step Risk: high)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Task 2 — Add the pure image rules and the Firestore and Storage client modules
Completed: 2026-11-26      Commit: 7fea1c1

Summary: Pure image rules in src/lib/admin/images.ts and client modules in src/lib/firebase (shared app, Firestore and Storage getters, uploadImage/deleteImage/listImages). Rows E2E-16 to 18 test the pure rules directly.
Decisions: shared private sharedApp() helper for all getters; ImageGoneError message is the alreadyDeleted text; getDownloadURL and setDoc inside the cleanup try; document id is the key, not a field.
Deviations: None.
Files changed: src/lib/admin/images.ts (created), src/lib/firebase/images.ts (created), src/lib/firebase/config.ts (modified), src/lib/firebase/client.ts (modified), e2e/manage-image-library.spec.ts (modified)
E2E tests written: E2E-16, E2E-17, E2E-18      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: high (large-diff, 199 non-test lines)
Review: risk reviewer PASS (review 1)
Findings: edge-case | note | logged | formatBytes(1048575) shows "1024 KB" instead of "1 MB" (cosmetic, follows the Step's rule)
Findings: nit | note | logged | E2E-16..18 use dynamic import inside each test (harmless, commented)
=====================================================================
