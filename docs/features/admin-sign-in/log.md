=====================================================================
Task 1 — Add the Firebase packages and start the Auth emulator with Playwright
Completed: 2026-11-26      Commit: b8fa4a5

Summary: Added firebase and firebase-tools, an emulators block in firebase.json, and a second Playwright webServer that starts the Auth emulator. The site smoke spec still passes.
Decisions: .gitignore lines appended under a comment header; firebase.json hosting block byte-identical; repo-profile sentence appended to the end of the Behavioral gate paragraph.
Deviations: None.
Files changed: package.json (modified), package-lock.json (modified), firebase.json (modified), playwright.config.ts (modified), .gitignore (modified), .claude/repo-profile.md (modified), CLAUDE.md (modified, header line)
E2E tests written: None.      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG MetadataLookupWarning from the emulator probing the GCP metadata server, harmless offline; DOCS CLAUDE.md is the orchestrator's header update)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Task 2 — Firebase client modules, owner decision and section list
Completed: 2026-11-26      Commit: 1174313

Summary: Added src/lib/firebase (config, client, auth) and src/lib/admin (owner decision, sections). Pure functions isEmulatorHost and accessFor are tested directly.
Decisions: emulator connected on first getFirebaseAuth() only (memoized); window guard checked before the cache; getOwnerUid() falls back to OWNER_UID if localStorage throws.
Deviations: None.
Files changed: src/lib/firebase/config.ts, src/lib/firebase/client.ts, src/lib/firebase/auth.ts, src/lib/admin/owner.ts, src/lib/admin/sections.ts (created); e2e/admin-sign-in.spec.ts (created); CLAUDE.md (modified, admin-modules convention)
E2E tests written: E2E-18, E2E-19      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS CLAUDE.md is the orchestrator's doc update clearing DOC-CLAUDE)
Tier: high (Step Risk: high)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Task 3 — The panel page and its screens
Completed: 2026-11-26      Commit: a12c0eb

Summary: Added the static panel route and AdminPanel with loading, signed-out, not-allowed and owner screens. All 19 rows of e2e/admin-sign-in.spec.ts pass.
Decisions: UI state in separate useState values; a ref tracks the last PanelState.kind so the failure message and selection clear on kind change (D-26); inline style objects with var(--token); menu selection stored by id.
Deviations: None in the app code. E2E-17's launchOptions are file-wide because Playwright forbids them inside a describe group (harmless).
Files changed: src/app/bright-warm-greenhouse/page.tsx (created), src/app/components/admin/AdminPanel.tsx (created), e2e/admin-sign-in.spec.ts (modified), CLAUDE.md (modified, route row), Reference.md (modified, route row and component tree)
E2E tests written: E2E-01 to E2E-17      Passed before the change: E2E-15, E2E-16 (static checks written after the code), E2E-05 (rewritten after the code)
Manual checks pending: None.

Attempts: 1
Auto-revisions: (1) E2E-05 reloaded before the popup sign-in finished; it now waits for the not-allowed text first (D-28). (2) Procedure P clicked the emulator widget before its handlers attached (the widget waits on unpkg.com, refused by the sandbox proxy); P now waits for the popup's load event (D-29). Both race fixes in the test harness; no assertion weakened.
Environment: apis.google.com added to the cloud environment's allowed hosts (owner-approved) so the popup flow can run in the sandbox.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS CLAUDE.md and Reference.md are the orchestrator's doc updates)
Tier: high (Step Risk: high; large-diff; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: nit | note | logged | E2E-17 test.use launchOptions is file-wide (Playwright limitation); no fix needed
Note: an earlier wip(admin-sign-in) commit (93ec78b) on the feature branch holds a pre-gate copy of these files; this commit supersedes it.
=====================================================================
