=====================================================================
Task 1 — Both feeds list the published posts and Publish renews them
Completed: 2026-11-28      Commit: f8f350f

Summary: The RSS route and the sitemap read the published-posts snapshot; refreshPublishedPosts also renews /rss.xml and /sitemap.xml (layout-type path calls); RSS escapes "]]>" inside CDATA.
Decisions: private cdata() helper in rss.ts; the sitemap's blog entry uses the newest post's date string; post entries monthly.
Deviations: None.
Files changed: src/app/rss.xml/route.ts, src/app/sitemap.ts, src/lib/blog/rss.ts, src/lib/server/publicPosts.ts (modified); e2e/owner-publishes-posts-to-feeds.spec.ts (created)
E2E tests written: E2E-01..E2E-15      Passed before the change: E2E-08, E2E-15 (guards)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
