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
=====================================================================
Task 2 — Deploy the rules from the live job and record the new facts
Completed: 2026-11-26      Commit: 53aef62

Summary: The live deploy job now deploys firestore.rules after the hosting deploy, using the existing service-account secret written to $RUNNER_TEMP. deploy-staging is untouched (rules are project-wide). E2E-21 checks the workflow and scripts as text.
Decisions: None.
Deviations: None.
Files changed: package.json (modified), .github/workflows/pipeline.yml (modified), .claude/repo-profile.md (modified), e2e/admin-owner-only-access.spec.ts (modified, E2E-21)
E2E tests written: E2E-21      Passed before the change: None.
Manual checks pending: None. Human-only: the live rules deploy and the Rules Admin role (intent §7, OQ-1).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: high (Step Risk: high)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Task 3 — Show the saving-off notice and finish the owner ID handoff
Completed: 2026-11-26      Commit: e0f4c98

Summary: Added SavingOffNotice to the allowed screen while accessFor is "unfilled", telling the owner how to switch saving on (OWNER_UID, firestore.rules, merge to master). E2E-19 already proves both owner-ID copies agree.
Decisions: notice and user ID line share a fragment in the "unfilled" branch, notice first; step 2 text built from OWNER_UID_PLACEHOLDER; SavingOffNotice has no hooks and is imported by the client panel.
Deviations: None.
Files changed: src/app/components/admin/SavingOffNotice.tsx (created), src/app/components/admin/AdminPanel.tsx (modified), src/lib/admin/owner.ts (modified, comment), e2e/admin-owner-only-access.spec.ts (modified), Reference.md (modified)
E2E tests written: E2E-14 to E2E-18, E2E-20      Passed before the change: E2E-16, E2E-17, E2E-20 (negative rows)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
