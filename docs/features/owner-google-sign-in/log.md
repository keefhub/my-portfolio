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
