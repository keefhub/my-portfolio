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
=====================================================================
Task 2 — The list and the post page show the cover and wrap long text
Completed: 2026-11-28      Commit: 97aa5db

Summary: BlogCard and BlogArticle show the cover through next/image when one is saved, and wrap long text (min-w-0 [overflow-wrap:anywhere]).
Decisions: image h-auto w-full; card link min-w-0; cover only when coverImage is a non-empty string.
Deviations: None.
Files changed: src/app/components/blog/BlogCard.tsx, src/app/components/blog/BlogArticle.tsx (modified); e2e/owner-publishes-blog-posts.spec.ts (modified)
E2E tests written: E2E-16..E2E-19      Passed before the change: E2E-18, E2E-19 (regression guards)
Manual checks pending: E2E-20 (dark theme)

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Task 3 — The repository's posts and their loader are removed
Completed: 2026-11-28      Commit: 7a142c7   (this commit deletes content/blog/hello-world.md and content/blog/building-portfolio-nextjs.md; the owner re-enters them from its parent, D-16)

Summary: The two Markdown posts and src/lib/blog/posts.ts are deleted; the barrel no longer exports the loader; RSS and the sitemap list no posts until owner-publishes-posts-to-feeds.
Decisions: sitemap keeps an empty typed posts array; rss passes an empty typed array.
Deviations: Locked E2E-21 forbade any "@/lib/blog" substring, contradicting the Step's import of the RSS builder; a fresh test-author dispatch narrowed it to the exact barrel import, and the rss route imports @/lib/blog/rss.
Files changed: content/blog/hello-world.md, content/blog/building-portfolio-nextjs.md, src/lib/blog/posts.ts (deleted); src/lib/blog/index.ts, src/app/rss.xml/route.ts, src/app/sitemap.ts (modified); e2e/owner-publishes-blog-posts.spec.ts (modified)
E2E tests written: E2E-21      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (large-diff, implementer-deviation)
Review: risk reviewer PASS (review 1)
Findings: spec-defect | note | logged | the Step's "imports from @/lib/blog" wording contradicts E2E-21; implementation uses @/lib/blog/rss
=====================================================================
=====================================================================
Task 4 — The earlier checks follow the change
Completed: 2026-11-28      Commit: 668aeaa

Summary: Twelve earlier spec files stop reading the repository's posts (tests that need posts seed and publish stand-in posts), the lib/server allow-rule gains the two blog pages, source lists lose the changed files, E2E-ACC-30 drops /blog/* from its byte-identical comparison, and the sign-in spec's landing check no longer expects the profile heading (D-20); E2E-22 guards the removals.
Decisions: blankPublished helper in owner-previews-blog-post.spec.ts (empties the stand-in, publishes, polls /blog/ for "No posts yet") so its published posts do not leak into later specs.
Deviations: The test author's Stop-if found owner-google-sign-in E2E-20 failing since owner-publishes-profile (the hero hides with no profile) — an earlier slice's regression not caught because each slice runs only its own spec; auto-revision D-20 settled it. The other Step 4 edits were kept across the revision because it did not change them.
Files changed: e2e/site-smoke, owner-google-sign-in, owner-edits-profile, owner-uploads-images, owner-manages-experience, owner-manages-projects, owner-manages-certifications, owner-manages-tech-stack, owner-manages-blog-posts, owner-previews-blog-post, retire-firebase, hosting-and-backend-migration-acceptance, owner-publishes-blog-posts .spec.ts (modified)
E2E tests written: E2E-22      Passed before the change: E2E-22 (test-only Step; the edits are what make it pass)
Manual checks pending: None.

Attempts: 1
Auto-revisions: Step 4 blocked on owner-google-sign-in E2E-20; D-20 (spec 0.3.0).
Mechanical gate: PASS (warnings: none)
Tier: high (test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: edge-case | note | logged | hosting E2E-ACC-16-area link list and retire E2E-44 hrefs assume no published post in the shared stand-in; can flake if a parallel spec publishes; filter to the expected set if it does
Findings: nit | note | logged | blankPublished is skipped when a preview test fails midway; try/finally would be sturdier
=====================================================================
