=====================================================================
Task 1 — Add the blog posts modules, the dedicated store and the pure rows
Completed: 2026-11-26      Commit: 31888a1

Summary: src/lib/admin/blogposts.ts (checkBlogPost, fromData/toData, sort) and src/lib/firebase/blogposts.ts (blogPosts keyed by slug; add by runTransaction that throws SlugTakenError when the slug exists; update/remove through withTimeout). withTimeout is now exported from src/lib/firebase/list.ts. Pure rows E2E-01 to 04 pass.
Decisions: body checked for emptiness on its trim and stored exactly as typed; blogPostLabel returns the title unless blank; add ignores position; reorder is a no-op; no "firebase" or "email" text in the pure module.
Deviations: None.
Files changed: src/lib/admin/blogposts.ts, src/lib/firebase/blogposts.ts (created), src/lib/firebase/list.ts (modified: export withTimeout), e2e/manage-blog-posts.spec.ts (created)
E2E tests written: E2E-01 to E2E-04      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: high (large-diff, 213 non-test lines)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
