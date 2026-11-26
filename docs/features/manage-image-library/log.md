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
=====================================================================
Task 3 — Build the Images screen, add it to the menu, update the notice and move the earlier menu expectations
Completed: 2026-11-26      Commit: 000e78b

Summary: ImageLibrary on the owner (and unfilled-owner) screen with validation messages, upload and delete flows, failure handling and a 375px layout; "Images" added to the menu; earlier specs updated for seven menu items. 54/54 rows pass, plus 19 sign-in and 22 owner-only.
Decisions: mount effect uses an inline async initialLoad with an active flag (avoids react-hooks/set-state-in-effect); separate load() for reloads; ref guards double activation; empty <p> keeps the message line. Thumbnail uses next/image (unoptimized, loading="eager") instead of the Step's eslint-disabled raw <img>, because the gate forbids added eslint-disable lines.
Deviations: next/image instead of a raw <img> (see Decisions); no preload link is emitted (no priority/preload).
Files changed: src/app/components/admin/ImageLibrary.tsx (created), src/app/components/admin/AdminPanel.tsx, src/lib/admin/sections.ts, src/app/components/admin/SavingOffNotice.tsx, src/lib/admin/owner.ts (comment), Reference.md (modified); e2e/manage-image-library.spec.ts, e2e/admin-sign-in.spec.ts, e2e/admin-owner-only-access.spec.ts (modified)
E2E tests written: E2E-19 to E2E-54      Passed before the change: E2E-37, E2E-53
Manual checks pending: None.

Attempts: 1
Auto-revisions: None. Test correction: locked E2E-36 asserted item positions opposite to D-12/E2E-47 (newest first); a fresh test author rewrote that check to match each item by name, with every other assertion of the row unchanged (risk reviewer confirmed it is not weakened).
Mechanical gate: PASS after one fix (first FAIL: SILENCED eslint-disable for no-img-element; warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; large-diff; test-passed-before-change; implementer-deviation)
Review: risk reviewer FAIL (next/image made previews lazy, against D-28) → fixed with loading="eager" → fresh risk reviewer PASS (review 2)
Findings: conformance | blocking | fixed | preview images lazy under next/image; now loading="eager"
=====================================================================
