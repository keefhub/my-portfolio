=====================================================================
Task 1 — Visitors read the published posts and Publish renews them
Completed: 2026-11-28      Commit: a3ff587

Summary: Server-only published-posts read through one unstable_cache snapshot keyed and tagged by a 16-hex hash of the database setting; both blog pages read it (revalidate = false, generateStaticParams [] with fallback, notFound for absent posts); Publish expires the tag and renews the /blog layout after the owner check; a root not-found page.
Decisions: not-found.tsx is a <main id="main-content"> with inline token styles; loadPublishedPosts and refreshPublishedPosts share a private cacheKey().
Deviations: Locked E2E-09 matched the region's own "All Posts" h2; a fresh test-author dispatch narrowed it to h2:not(#all-posts-heading), expected order unchanged.
Files changed: src/lib/publicPosts.ts, src/lib/server/publicPosts.ts, src/app/not-found.tsx (created); src/app/blog/page.tsx, src/app/blog/[slug]/page.tsx, src/app/api/admin/publish/route.ts (modified); e2e/owner-publishes-blog-posts.spec.ts (created)
E2E tests written: E2E-01..E2E-15      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (spec Risk: high, implementer-deviation)
Review: risk reviewer PASS (review 1)
Findings: nit | note | logged | E2E-09 narrowing justified
=====================================================================
