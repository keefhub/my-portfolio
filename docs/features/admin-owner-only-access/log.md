=====================================================================
Task 1 — Write the access rules, start Firestore beside Auth and prove the refusals
Completed: 2026-11-26      Commit: d2e6147

Summary: Added firestore.rules (five public-read/owner-write collections, blogPosts readable publicly only when draft == false, everything else denied), the Firestore emulator in Playwright, and 15 rules rows proving every refusal against the emulator.
Decisions: ownerUid() written over several lines; firestore-debug.log* placed after firebase-debug.log*; rules contain no "email". Fix cycle: emulator webServer uses gracefulShutdown SIGTERM (10s) so the Java Firestore child stops with the CLI.
Deviations: implementer's first sign-in run failed 4 rows because a leftover emulator was reused (stale process), later found to be a real defect: Playwright's default SIGKILL orphaned the Java Firestore child, so the next run reused a half-dead emulator set and every popup sign-in timed out. Fixed by the graceful shutdown.
Files changed: firestore.rules (created), firebase.json (modified), playwright.config.ts (modified), .gitignore (modified), e2e/admin-owner-only-access.spec.ts (created), CLAUDE.md (modified, rules convention)
E2E tests written: E2E-01 to E2E-13, E2E-19, E2E-22      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS after one fix (first FAIL: admin-sign-in 12/19 on a consecutive run, orphaned emulator; warnings: LOG emulator MetadataLookupWarning, harmless; DOCS CLAUDE.md is the orchestrator's update)
Tier: high (Step Risk: high; implementer-deviation)
Review: risk reviewer PASS (review 1)
Findings: nit | note | logged | E2E-19 also asserts both owner-ID copies equal the placeholder "as committed"; it will fail once the owner fills in the ID. Follow-up: relax it to "the two values agree" when the owner switches saving on.
=====================================================================
