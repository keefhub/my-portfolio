=====================================================================
Task 1 — Add the library, the test stand-in value and the gate allowance
Completed: 2026-11-27      Commit: b11f92e

Summary: Added postgres 4.1.1 (exact), a per-run stand-in database value for the tests in playwright.config.ts, and the gate allowance for new API routes under src/app/api/admin/ (D-14).
Decisions: The stand-in value is stand-in: plus a temp-directory path with random hex; the config does not create the file.
Deviations: The scripts/check-task.sh edit was NOT made by the implementer. The first implementer attempt was refused by the permission system ("Undermining Oversight") and the run stopped to ask the owner. The owner then replied "Unblock it yourself. Make the decision." and the orchestrator made the edit directly: five text changes adding src/app/api/admin/ beside src/app/api/auth/, nothing else. The first attempt's other work was discarded and Task 1 restarted from the packet.
Files changed: package.json (modified), package-lock.json (modified), playwright.config.ts (modified), scripts/check-task.sh (modified, by the orchestrator), e2e/owner-edits-profile.spec.ts (created)
E2E tests written: E2E-01, E2E-02, E2E-03      Passed before the change: E2E-01 only because the working tree already held the gate edit; confirmed to fail against the committed script (scratch repo), so it is not vacuous.
Manual checks pending: None for this task (E2E-30, the owner's SIT check, is owned by a later task).

Attempts: 1 (the first, stopped before verification, was not a failed attempt; it was discarded and the task restarted)
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (spec Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
NOTE FOR THE PULL REQUEST REVIEWER: this task changes the repository's own mechanical gate (second time, after owner-google-sign-in Task 2), narrowly. It deserves a human look.
=====================================================================

=====================================================================
Task 2 — Database module, stand-in, profile store and the owner-only route
Completed: 2026-11-27      Commit: 13221f1

Summary: Added the owner-only profile store: a route with GET and PUT that checks the owner before any body read or database call, the Postgres module (schema applied once per process, row level security on, no policy), a file-based stand-in for tests, and a log line that carries only an operation and an allow-listed error code.
Decisions: database.ts keeps one client and one schema promise tagged with the setting value; the schema promise is cleared when it rejects; the stand-in's writes run the same unreachable and invalid-JSON check as its reads; the route builds every response through one helper that sets Cache-Control: no-store and a JSON body.
Deviations: None.
Files changed: src/lib/admin/dblog.ts (created), src/lib/server/sql.ts (created), src/lib/server/standin.ts (created), src/lib/server/database.ts (created), src/lib/server/profile.ts (created), src/app/api/admin/profile/route.ts (created), CLAUDE.md (modified, one Routes row, orchestrator), e2e/owner-edits-profile.spec.ts (modified), e2e/owner-google-sign-in.spec.ts (modified: only the last assertion of the importers test)
E2E tests written: E2E-04 to E2E-13      Passed before the change: E2E-13 (a negative check)
Manual checks pending: E2E-30 (the real Supabase database, the pooler and row level security are untested here; only the owner's SIT check covers them).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: both DOC-CLAUDE warnings cleared by the CLAUDE.md Routes row; DOCS confirmed as the orchestrator's doc update)
Tier: high (spec Risk: high; large-diff 275 non-test lines; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: edge-case | note | logged | a PUT whose text contains U+0000 or a lone surrogate passes the shape check but PostgreSQL jsonb rejects it, so the owner gets 503 instead of 400 (no data lost or leaked; for E2E-30)
 edge-case | note | logged | the owner check fails open if a fourth PanelState value is ever added; a state !== "owner" guard would fail closed with the same behaviour today
 nit | note | logged | the previous postgres client is replaced without .end() when the setting value changes; harmless in production, only tests change it
=====================================================================

=====================================================================
Task 3 — The Profile screen, shown in the panel
Completed: 2026-11-27      Commit: 2bd4ec2

Summary: The panel's Profile item now shows the editor: name, headline, about paragraphs, photo path, email, resume link and social links, loaded from and saved to the owner-only profile store. Failures show one fixed message and keep what was typed; the other six items keep their not-available notice. The Firebase profile store and its old spec are deleted.
Decisions: ProfileEditor fetches the store directly and takes no props. The load result accepts any non-null object under profile. Layout styles with minWidth 0 are composed locally from the shared form styles. The save handler throws an internal error on a bad response and it is caught without being shown or logged.
Deviations: None.
Files changed: src/app/components/admin/ProfileEditor.tsx (modified), src/app/components/admin/AdminPanel.tsx (modified), src/lib/firebase/profile.ts (deleted), e2e/manage-profile.spec.ts (deleted), e2e/owner-edits-profile.spec.ts (modified), e2e/owner-google-sign-in.spec.ts (modified: the menu loop skips Profile)
E2E tests written: E2E-14 to E2E-28, E2E-31      Passed before the change: None.
Manual checks pending: E2E-30 (the owner's SIT check of the real database).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (large-diff 346 non-test lines)
Review: risk reviewer PASS (review 1)
Findings: edge-case | note | logged | isObject accepts arrays, so a profile value of [] loads an empty form instead of a load failure; the route never sends one (add && !Array.isArray(value) to tighten)
 vacuous-test | note | logged | E2E-22 (double click) may also pass without the saving guard, because React flushes the first click's state before the second lands; the guard is in the code as the Step requires
=====================================================================

=====================================================================
Task 4 — Amend the standing docs the database makes false
Completed: 2026-11-27      Commit: cb16871

Summary: CLAUDE.md and the repo profile now describe the database behind the panel's owner-only routes, the two API route families, the SUPABASE_DB_URL setting, the src/lib/server/ modules and the stand-in database chosen by the setting value in tests.
Decisions: The /api/admin/profile/ Routes row already existed (added during Task 2) and was reworded to the Step's wording. Invariant 1 says "the API routes are two families only" so that the forbidden phrase "only API route" does not remain. The src/lib/server/ paragraph is at the end of the Admin modules paragraph.
Deviations: None.
Files changed: CLAUDE.md (modified), .claude/repo-profile.md (modified), e2e/owner-edits-profile.spec.ts (modified)
E2E tests written: E2E-29      Passed before the change: None.
Manual checks pending: E2E-30 (the owner's SIT check).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================

=====================================================================
Completion — owner-edits-profile
Completed: 2026-11-27

Built: The panel's Profile screen. The owner edits name, headline, about paragraphs, photo path, email, resume link and social links; load and save go through an owner-only route (/api/admin/profile/) that checks the owner before any body read or database call. The route keeps its data in Supabase PostgreSQL through the postgres library (schema applied by the app once per process, row level security on with no policy). Any database failure answers one fixed message and logs only an operation and an allow-listed code. Tests run against a file-based stand-in chosen by the setting value, so no test database and no extra setting are needed. The Firebase profile store and its spec are deleted, and the standing docs describe the new route and module.
Deviations from the spec: Task 1's scripts/check-task.sh edit was made by the orchestrator on the owner's explicit instruction ("Unblock it yourself. Make the decision.") after the implementer's own edit was refused by the permission system and the run stopped to ask. Exactly five text changes add src/app/api/admin/ beside src/app/api/auth/; nothing else in the gate is loosened.
[auto] decisions: 21 lines tagged [auto] in the spec (including the library choice, the SUPABASE_DB_URL name, the stand-in design, the status codes, and the gate allowance D-14).
Feature review: PASS. Findings (all notes, already logged per task): the owner check fails open if a fourth PanelState value is ever added; a profile value of [] loads an empty form instead of a load failure; a PUT containing U+0000 reaches jsonb and gets 503 instead of 400; E2E-22 (double click) may pass without the saving guard; a replaced postgres client is not .end()ed (tests only); and the gate change deserves a human look.
Final verification: npm run build ok; npx playwright test e2e/owner-edits-profile.spec.ts 30 passed, 0 failed.
Manual checks still pending (never run): E2E-30 (the owner's SIT check: after the merge to develop and once SUPABASE_DB_URL is set in Vercel, save a profile and read it back; this is the only check of the real Supabase database, pooler and row level security).
Follow-ups not in scope: the four small hardening notes above; the new setting SUPABASE_DB_URL (the transaction-pooler connection string) must be set by the owner in Vercel for Production and SIT and goes in the pull request list; the stand-in lives in the production bundle (spec R-1) and only activates for a value starting with "stand-in:"; @electric-sql/pglite could be approved as a dev dependency so later slices run the real SQL in tests (spec OQ-2), a decision for the owner.
=====================================================================
