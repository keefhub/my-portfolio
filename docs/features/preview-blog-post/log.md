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
=====================================================================
Task 2 — Build the preview and the Preview control in the Blog posts form
Completed: 2026-11-26      Commit: 56eaba5

Summary: The converter now lives in src/lib/markdown.ts (identical to the old src/lib/blog/markdown.ts, which is now a one-line re-export), so the client PostPreview imports @/lib/markdown and no @/lib/blog path. Preview renders the body inside PostBody; Back to form keeps the draft; nothing is written. 10/10 preview rows; blog posts 23, experience 31, projects 18, certifications 17, tech stack 20, site smoke 3, and the email/process.env greps pass.
Decisions: blank body skips conversion; a stale conversion is ignored by matching its stored body; preview mode is applied inside renderFields so ListEditor's draft survives; Preview button after the Body error, before Featured.
Deviations: None.
Files changed: src/lib/markdown.ts, src/app/components/admin/PostPreview.tsx (created), src/lib/blog/markdown.ts, src/app/components/admin/ListEditor.tsx, src/app/components/admin/BlogPostsEditor.tsx, CLAUDE.md, Reference.md (modified), e2e/preview-blog-post.spec.ts (modified)
E2E tests written: E2E-01 to E2E-08, E2E-10      Passed before the change: None.
Manual checks pending: None.

Attempts: 1 (after one auto-revision)
Auto-revisions: (1) the first build imported @/lib/blog/markdown from the client PostPreview; the gate's BARREL check enforces CLAUDE.md invariant 3 as a path rule. Revised D-03/D-04: move the converter to src/lib/markdown.ts with a re-export from src/lib/blog/markdown.ts (one pipeline, no drift); only E2E-08 was rewritten. Spec commit: "revise the spec after a blocked task".
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS CLAUDE.md and Reference.md are the orchestrator's updates)
Tier: high (Step Risk: high; large-diff)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================
