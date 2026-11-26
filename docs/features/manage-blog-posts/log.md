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
=====================================================================
Task 2 — Extend the list editor, build the Blog posts screen and show it for the "Blog posts" menu item
Completed: 2026-11-26      Commit: 2a35908

Summary: BlogPostsEditor on ListEditor (not movable; newest first) over the slug-keyed store; AdminPanel's placeholder branch removed since every menu item now has an editor. 23/23 blog rows; experience 30, projects 17, certifications 16, tech stack 19 pass with --grep-invert on their menu placeholder test (the six earlier placeholder tests are moved in Task 3, D-22: red between this commit and Task 3's).
Decisions: order applied inside the setEntries updater after add and edit; saveFailure only in the save catch; Slug input read-only in edit mode, disabled only in add mode while busy; field ids use a blog- prefix.
Deviations: None.
Files changed: src/app/components/admin/ListEditor.tsx, AdminPanel.tsx, Reference.md (modified), src/app/components/admin/BlogPostsEditor.tsx (created), e2e/manage-blog-posts.spec.ts (modified)
E2E tests written: E2E-05 to E2E-23      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; large-diff)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
=====================================================================
Task 3 — Move six placeholder tests from the "Blog posts" placeholder to its editor
Completed: 2026-11-26      Commit: 22f094c

Summary: Every toBeVisible on "Blog posts editor is not available yet." in admin-sign-in, manage-profile, manage-experience, manage-projects, manage-certifications and manage-tech-stack now expects the level-2 "Blog posts" heading; count-0 lines kept. All six files pass in full (19, 32, 31, 18, 17, 20). Closes the D-22 gap opened by Task 2.
Decisions: None (test-only Step; no implementer).
Deviations: None.
Files changed: e2e/admin-sign-in.spec.ts, e2e/manage-profile.spec.ts, e2e/manage-experience.spec.ts, e2e/manage-projects.spec.ts, e2e/manage-certifications.spec.ts, e2e/manage-tech-stack.spec.ts (modified)
E2E tests written: rows named by the packet for the moved tests      Passed before the change: not checked (red after Task 2 by design)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
