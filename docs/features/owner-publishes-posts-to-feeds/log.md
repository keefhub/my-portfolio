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
=====================================================================
Task 2 — The earlier checks follow the feeds
Completed: 2026-11-28      Commit: 98d1f31

Summary: Twelve mention-rule lines in eight earlier specs gain the two feed files; E2E-21 of the blog posts spec retitled; retire-firebase E2E-44 and hosting ACC-16 use a two-part sitemap check; ACC-17 drops the item count; ACC-25 checks drafts in the feeds; ACC-30 skips the feeds in its equality check; E2E-16 guards these edits.
Decisions: None (test-only Step; no implementer dispatched).
Deviations: The gate required the retitled E2E-21 to be named in the Step; a gate-wording spec revision named it.
Files changed: e2e/owner-publishes-posts-to-feeds, owner-publishes-blog-posts, retire-firebase, hosting-and-backend-migration-acceptance, owner-edits-profile, owner-uploads-images, owner-manages-experience, owner-manages-projects, owner-manages-certifications, owner-manages-tech-stack, owner-manages-blog-posts .spec.ts (modified)
E2E tests written: E2E-16      Passed before the change: E2E-16 (reads the edited specs as text)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Task 3 — The standing documents describe the feeds
Completed: 2026-11-28      Commit: a41e286

Summary: CLAUDE.md (route rows, invariant 1, admin-modules import rule) and Reference.md (routes table) say the feeds read the published posts and are renewed by Publish.
Decisions: None.
Deviations: None.
Files changed: CLAUDE.md, Reference.md (modified); e2e/owner-publishes-posts-to-feeds.spec.ts (modified)
E2E tests written: E2E-17      Passed before the change: None.
Manual checks pending: E2E-18 (owner's real publish on SIT)

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Completion
Completed: 2026-11-28

Built: RSS and the sitemap list the published posts from the snapshot (drafts never), Publish renews both feeds, RSS escapes CDATA ends, earlier checks and documents brought in line.
Deviations from the spec: one gate-wording revision (Step 2 names the retitled E2E-21).
[auto] decisions in the spec: 9 lines (D-02..D-12).
Feature review: PASS
Findings: None.
Final verification: npm run build ok; e2e/owner-publishes-posts-to-feeds.spec.ts 17 passed, 0 failed.
Manual checks pending: E2E-18 (owner's real publish on SIT).
=====================================================================
