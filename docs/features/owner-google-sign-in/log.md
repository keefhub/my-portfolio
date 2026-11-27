=====================================================================
Task 1 — Lift the static export, pin the dependency, serve tests with next start
Completed: 2026-11-27      Commit: 4c2c366

Summary: The static export is lifted for the panel (public routes stay prerendered), next-auth is pinned at 5.0.0-beta.32, http-server is removed, and Playwright now runs against next start with per-run random settings and no emulator. Blog posts answer unknown slugs with the 404 page.
Decisions: next-auth installed with --save-exact; the four settings are assigned from template literals so no literal value or email is in the file.
Deviations: None.
Files changed: next.config.ts (modified), vercel.json (modified), package.json (modified), package-lock.json (modified), playwright.config.ts (modified), src/app/blog/[slug]/page.tsx (modified), e2e/owner-google-sign-in.spec.ts (created)
E2E tests written: E2E-20, E2E-21, E2E-22, E2E-26, E2E-27      Passed before the change: E2E-20, E2E-22 (regression guards)
Manual checks pending: None.

Attempts: 1
Auto-revisions: Blocked on E2E-22 (browser title on the built-in 404 page is the layout's); settled as D24 [auto], keep the built-in 404 page and assert its headings. Spec commit: docs(owner-google-sign-in): revise the spec after a blocked task.
Mechanical gate: PASS (warnings: none; the first run failed only on the empty untracked log.md, which was removed and recreated with this entry)
Tier: high (spec Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: test-coverage | note | logged | E2E-22 checks the /blog/no-such-post/ 404 only by status and headings, so it would pass without dynamicParams = false; matches the spec row exactly
=====================================================================

=====================================================================
Task 2 — Let the mechanical gate accept this feature's server pieces
Completed: 2026-11-27      Commit: 160cc1f

Summary: scripts/check-task.sh now accepts the use-server directive only in the panel's actions file and new files only under src/app/api/auth/, and no longer forbids the next-auth import. Middleware and proxy files, other api routes and every other forbidden import still fail.
Decisions: The use-server exemption compares the exact path; the api/auth case sits before the general api and middleware case.
Deviations: The test author's first version of E2E-35 had two type errors (an env typed as ProcessEnv). The test author corrected only that one type annotation, I re-staged the file after checking the diff was that single line, and E2E-35 was confirmed to fail against the old script and pass against the new one.
Files changed: scripts/check-task.sh (modified), e2e/owner-google-sign-in.spec.ts (modified)
E2E tests written: E2E-35      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (spec Risk: high)
Review: risk reviewer PASS (review 1)
Findings: None.
NOTE FOR THE PULL REQUEST REVIEWER: this task loosens the repository's own mechanical gate, narrowly, under the intent's section 4 approvals (D22, human: intent section 4). It deserves a human look.
=====================================================================

=====================================================================
Task 3 — Owner decision, Auth.js configuration and handler
Completed: 2026-11-27      Commit: 70fd8cb

Summary: Added the owner decision (access.ts), the Auth.js configuration with a Google provider and a JWT session (auth.ts) and the handler route under /api/auth/. Only a verified Google email equal to the owner setting is let in; errors are logged by type only.
Decisions: No next-auth/jwt module augmentation (that module path does not resolve; the token type is an open record). The session callback writes through a Session cast. The logger parameter is named "problem". getPanelState catches any throw and returns signed-out.
Deviations: The spec's example next-auth/jwt augmentation is omitted; the spec allows any form that typechecks. session.user.emailVerified is still declared through the next-auth Session augmentation.
Files changed: src/lib/admin/access.ts (created), src/lib/auth.ts (created), src/app/api/auth/[...nextauth]/route.ts (created), CLAUDE.md (modified, one Routes row), e2e/owner-google-sign-in.spec.ts (modified)
E2E tests written: E2E-10, E2E-14, E2E-15, E2E-16      Passed before the change: None.
Manual checks pending: E2E-32 (the real Google token exchange, run by the owner on SIT) and E2E-33, owned by later steps.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: DOC-CLAUDE cleared by the CLAUDE.md Routes row; DOCS confirmed as the orchestrator's doc update)
Tier: high (spec Risk: high; implementer-deviation)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================

=====================================================================
Task 4 — Dynamic panel page, sign-in and sign-out actions, the three screens
Completed: 2026-11-27      Commit: d43d662

Summary: The panel page is dynamic and renders one of three screens (sign-in, not allowed, the owner's seven-item menu) from the server-side state. Sign-in and sign-out are server actions. The Firebase sign-in, the owner-ID code, the saving-off notice and the two earlier admin specs that tested them are deleted.
Decisions: One SubmitButton (useFormStatus, disabled while pending) is shared by the sign-in and both sign-out forms. No ref guard against double submit: E2E-11 passes without it, and a ref written during render fails the react-hooks/refs lint rule.
Deviations: None.
Files changed: src/app/bright-warm-greenhouse/actions.ts (created), src/app/bright-warm-greenhouse/page.tsx (modified), src/app/components/admin/AdminPanel.tsx (modified), src/lib/admin/owner.ts (deleted), src/app/components/admin/SavingOffNotice.tsx (deleted), src/lib/firebase/auth.ts (deleted), e2e/admin-sign-in.spec.ts (deleted), e2e/admin-owner-only-access.spec.ts (deleted), e2e/owner-google-sign-in.spec.ts (modified)
E2E tests written: E2E-01 to 09, 11 to 13, 17, 18, 19, 23, 24, 25, 28, 29, 30, 34      Passed before the change: E2E-03, 12, 18, 19, 23, 24, 25 (regression and negative guards)
Manual checks pending: E2E-32 and E2E-33 (the owner's real Google sign-in and edit check on SIT), owned by later steps and the owner.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (spec Risk: high; large-diff 350 non-test lines; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: test-coverage | note | logged | the escalation for test-passed-before-change was expected; seven rows are regression guards
NOTE: the other earlier admin specs (manage-*, preview-blog-post, manage-image-library, admin-content-panel-acceptance) are now red by design (D13); later slices replace them and retire-firebase deletes what is left.
=====================================================================

=====================================================================
Task 5 — Amend the standing docs the lift makes false
Completed: 2026-11-27      Commit: 08c6965

Summary: CLAUDE.md, OVERVIEW section 2 and the repo profile no longer say the site is a pure static export; they describe Vercel, the dynamic panel and Auth.js handler, next start for the behavioural gate, and the reworded secret rule (no secret values in the repo, pages or logs).
Decisions: "Admin modules are client-only" became "Admin modules", with the leftover Firebase rules moved to a "Leftover rules" paragraph until retire-firebase. "built out/" became "built site (next start)". Invariant 2's "out/404.html" became "the framework's 404 page" (D24).
Deviations: None.
Files changed: CLAUDE.md (modified), docs/features/OVERVIEW.md (modified), .claude/repo-profile.md (modified)
E2E tests written: E2E-31      Passed before the change: None.
Manual checks pending: E2E-32 (the owner's real Google sign-in on SIT) and E2E-33.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
