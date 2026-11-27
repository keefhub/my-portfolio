=====================================================================
Task 1 — Shared image rules, the browser's client, the log line and the test run's storage value
Completed: 2026-11-27      Commit: 8ff5438

Summary: Added the shared image rules (imageExtension with its own switch, an id pattern, checkImageInput as the server's twin of the browser's file check), the storage log line (operation and an allow-listed code only), the browser's client for the owner-only image routes (fixed error text, no credentials on the file upload) and a per-run stand-in storage value for the tests.
Decisions: storageLogLine reads status first, then code, then cause.code. imagesClient has one shared fetch helper that applies no-store and the timeout and maps any network error to the fixed error. Existing exports, including ImageRecord, storagePathFor and the private EXTENSIONS table, are untouched.
Deviations: None.
Files changed: src/lib/admin/images.ts (modified), src/lib/admin/storagelog.ts (created), src/lib/admin/imagesClient.ts (created), playwright.config.ts (modified), e2e/owner-uploads-images.spec.ts (created)
E2E tests written: E2E-01, E2E-02, E2E-03      Passed before the change: None.
Manual checks pending: None for this task (E2E-36, the owner's SIT check, is owned by a later task).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (large-diff 166 non-test lines)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
