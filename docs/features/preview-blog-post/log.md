=====================================================================
Task 1 — Extract the blog's prose wrapper into `PostBody` and pin the public article's markup
Completed: 2026-11-26      Commit: 1410882

Summary: src/app/components/blog/PostBody.tsx holds the .prose wrapper (moved, not duplicated, from BlogArticle); BlogArticle renders it. E2E-09 pins the public article markup; site smoke 3/3 pass.
Decisions: PostBody takes a destructured { html } prop with a named props interface; comments are JS comments inside the return.
Deviations: None.
Files changed: src/app/components/blog/PostBody.tsx (created), src/app/components/blog/BlogArticle.tsx, Reference.md (modified), e2e/preview-blog-post.spec.ts (created)
E2E tests written: E2E-09      Passed before the change: E2E-09 (guards a refactor by design)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: nit | note | logged | PostBody uses a destructured props interface and inferred return type instead of the Step's literal signature (no runtime effect)
=====================================================================
