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

=====================================================================
Task 2 — Image SQL, the stand-in's image list, the database functions and the storage module
Completed: 2026-11-27      Commit: 2d4a857

Summary: Added the image table SQL (own file, row level security on with no policy), the database functions to list, add, find and delete entries, the storage module (bucket check, signed upload address, stored-file size and type check, removal) and file-based stand-ins for both, chosen by the setting values. Every failure is one fixed error with one allow-listed log line. The profile stand-in write now keeps the images.
Decisions: publicImageUrl and every real-mode operation require both a usable SUPABASE_URL and a non-blank SUPABASE_SERVICE_ROLE_KEY (stricter than needed for the address alone). An internal HttpFailure carries only the status; the failed response body is cancelled and never read. The bucket-ready promise is held per base-and-key pair and cleared on rejection. statStoredImage treats only a 200 as stored; a non-integer content-length gives size null. The stand-in treats an absent directory as reachable.
Deviations: None.
Files changed: src/lib/server/imageSql.ts (created), src/lib/server/standin.ts (modified), src/lib/server/database.ts (modified), src/lib/server/storageStandin.ts (created), src/lib/server/storage.ts (created), e2e/owner-uploads-images.spec.ts (modified)
E2E tests written: E2E-04, E2E-05      Passed before the change: None.
Manual checks pending: E2E-36 (the owner's SIT check: the real Storage calls and the pooler role are untested here).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (spec Risk: high; large-diff 356 non-test lines)
Review: risk reviewer PASS (review 1)
Findings: nit | note | logged | success-path storage responses are not drained or cancelled, so undici may hold connections until garbage collection on a long-lived server
 edge | note | logged | the storage functions put id into a URL or file path without checking it; Task 3 (the routes) MUST apply IMAGE_ID_PATTERN before every call, including DELETE ?id= and the register body, or the stand-in could read ../x and the real URL could take an arbitrary path (D-9, D-14)
=====================================================================

=====================================================================
Task 3 — The image store and the owner-only routes
Completed: 2026-11-27      Commit: b4a6e18

Summary: Added the image store and the owner-only routes: GET lists, POST registers an upload, DELETE removes (at /api/admin/images/), and POST /api/admin/images/upload/ issues a one-file upload address. The owner check runs before any body read and the image-id pattern runs before every storage or database call. Registering checks the stored file's real size and type and removes a file outside the rules; delete removes the file before the entry.
Decisions: Each route file copies the profile route's reply() and refusal() helpers instead of importing them. registerUpload applies the id pattern before checkImageInput and before any storage or database call; deleteUploadedImage applies it to ?id= first. A missing ?id= is passed on as undefined and comes back invalid. imageStore.ts imports its helpers by the @/lib/server/ alias, as profile.ts does.
Deviations: None.
Files changed: src/lib/server/imageStore.ts (created), src/app/api/admin/images/route.ts (created), src/app/api/admin/images/upload/route.ts (created), CLAUDE.md (modified, two Routes rows, orchestrator), e2e/owner-uploads-images.spec.ts (modified)
E2E tests written: E2E-06 to E2E-16      Passed before the change: E2E-14, E2E-16 (guard checks)
Manual checks pending: E2E-36 (the owner's SIT check of the real Storage service).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: both DOC-CLAUDE warnings cleared by the CLAUDE.md Routes rows; DOCS confirmed as the orchestrator's doc update)
Tier: high (spec Risk: high; large-diff 190 non-test lines; test-passed-before-change)
Review: risk reviewer PASS (review 1; checked the id pattern before every storage and database call, the owner check before any body read, and percent-encoded traversal)
Findings: None.
=====================================================================
