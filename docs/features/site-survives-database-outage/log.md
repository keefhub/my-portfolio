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
