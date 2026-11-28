=====================================================================
Task 1 — Add the kept read and move the five landing loaders onto it
Completed: 2026-11-28      Commit: f5f2163

Summary: src/lib/server/keptRead.ts wraps a read in unstable_cache keyed and tagged by a hash of the database setting; the five landing loaders read through it. Between this task and Task 2, Publish does not refresh the landing reads (expected, stated in the Step).
Decisions: build-without-setting case returns the fallback through a stub; the empty setting hashes as "".
Deviations: None.
Files changed: src/lib/server/keptRead.ts (created); src/lib/server/publicProfile.ts, publicExperience.ts, publicTechStack.ts, publicProjects.ts, publicCertifications.ts (modified)
E2E tests written: None.      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Task 2 — Publish marks the reads stale; the posts read through the kept read; the earlier checks follow
Completed: 2026-11-28      Commit: bd5d525

Summary: Publish calls refreshPublishedSite(), which marks this environment's tag and the empty-setting tag stale with revalidateTag(tag, "max"); revalidatePath and expire:0 are gone; the posts read goes through keptRead; earlier source checks (profile E2E-09, blog-posts E2E-14, feeds E2E-14, hosting E2E-ACC-34) follow.
Decisions: publicPosts.ts calls keptRead( without a generic argument (the feeds check reads the literal).
Deviations: Two locked-test fixes by fresh test-author dispatches, assertions kept: E2E-01 reads section#tech with textContent() (CSS-uppercased heading); blank() also renews /rss.xml and /sitemap.xml so a later spec run with a fresh setting tag is not left with an unmarkable feed copy (test-run artefact; a real deployment keeps one tag per environment).
Files changed: src/lib/server/publicPosts.ts, src/app/api/admin/publish/route.ts (modified); e2e/site-survives-database-outage.spec.ts (created); e2e/owner-publishes-profile.spec.ts, e2e/owner-publishes-blog-posts.spec.ts, e2e/owner-publishes-posts-to-feeds.spec.ts, e2e/hosting-and-backend-migration-acceptance.spec.ts (modified)
E2E tests written: E2E-01..E2E-06, E2E-08..E2E-10      Passed before the change: E2E-05, E2E-06, E2E-10 (guards)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (spec Risk: high, implementer-deviation, test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Task 3 — A way back to the blog, and the standing documents
Completed: 2026-11-28      Commit: 578d8a6

Summary: not-found.tsx gains "Back to the blog"; CLAUDE.md (invariant 1, routes row) and Reference.md describe the kept read, the previous copy served on a failed renewal, and Publish's stale-while-revalidate marking.
Decisions: None.
Deviations: None.
Files changed: src/app/not-found.tsx, CLAUDE.md, Reference.md (modified); e2e/site-survives-database-outage.spec.ts (modified)
E2E tests written: E2E-07, E2E-11      Passed before the change: None.
Manual checks pending: E2E-12 (a real paused SIT project), E2E-13 (Vercel's own keeping, never-opened post address during an outage)

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Regression fix — earlier specs run against this slice's Publish
Completed: 2026-11-28

Summary: running every earlier slice spec, each in its own invocation after one build, found one code defect and several
test defects caused by task 2's stale-while-revalidate Publish and by slice owner-publishes-profile's Publish button.
Code: src/lib/server/keptRead.ts — every kept read also carries the shared tag `site`, and Publish marks it stale, so a copy
kept under a different SUPABASE_DB_URL (same build output reused) is renewed too; the per-setting key stays in the cache key.
Tests (locked-test defects, assertions' meaning kept): owner-publishes-profile E2E-14 (accepts HIT or STALE; compares after the
page settles); owner-publishes-tech-stack E2E-05/06 and owner-publishes-projects E2E-04/05 (settle `/` after Publish; seed the
other sections so "the rest of the page works" is still observable); owner-publishes-blog-posts (blank() and each Publish wait
for each post address to settle; E2E-12 accepts HIT or STALE); owner-publishes-posts-to-feeds E2E-03/04 (wait for the sitemap
too); owner-google-sign-in and hosting-and-backend-migration-acceptance (the Admin region text includes Publish; E2E-ACC-22
excludes the framework-set NEXT_PHASE from owner settings).
Result: fresh build, then each of the 11 specs alone: all pass; owner-google-sign-in E2E-09 is intermittently flaky
(stand-in call count lags the second click), unrelated to these files, recorded as known flake.
Findings file: .run-logs/site-survives-database-outage/regress-findings.md (F1–F5)
=====================================================================
Completion
Completed: 2026-11-28
Completion run: build ok; e2e/site-survives-database-outage.spec.ts 11 passed, 0 failed (.run-logs/site-survives-database-outage/completion.txt)
Feature review: PASS. Notes: (1) keptRead also tags the shared `site` tag beyond D-03's "site-" + key (regression fix, harmless widening);
(2) the test-only blank() renews /rss.xml and /sitemap.xml beyond the spec's BLANK definition (test-run artefact).
Manual checks pending: E2E-12 (a real paused SIT project), E2E-13 (Vercel's own keeping; a never-opened post address during an outage)
Known flake: owner-google-sign-in E2E-09 (intermittent, unrelated to this slice)
=====================================================================
