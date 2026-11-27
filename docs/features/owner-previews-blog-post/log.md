=====================================================================
Task 1 — Add the preview's spec, remove the Firebase-era spec and the one line that expects it
Completed: 2026-11-27      Commit: 1e38339

Summary: A new spec proves the existing preview against the new stack: no server request to render, nothing stored, the session untouched, the body only (no title, date, status or cover), the same markup as the public blog's article (byte-identical div.prose and the highlight colour), phone layout, theme tokens, keyboard use, a long body, an empty body, and no preview text on public pages. The Firebase-era preview spec, which can no longer run, is deleted, and the one array entry in the blog posts spec that expected it is removed. No production file changed: the preview already meets the story.
Decisions: None by the implementer (its whole task was the git rm). The earlier spec's amendment was one line removed, made by the test author.
Deviations: None.
Files changed: e2e/owner-previews-blog-post.spec.ts (created), e2e/preview-blog-post.spec.ts (deleted), e2e/owner-manages-blog-posts.spec.ts (modified: one line)
E2E tests written: E2E-01 to E2E-17      Passed before the change: E2E-01 to E2E-16 (expected: they describe behaviour the unchanged preview already has; E2E-17, the retirement row, was the only one red)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none; zero production lines changed)
Tier: high only because of the test-passed-before-change escalation (the Step itself is Risk: low)
Review: risk reviewer PASS (review 1). Because 16 rows passed against unchanged code, the reviewer built a scratch copy outside the repository and applied about twenty independent mutations to the preview (a network request on open, rendering the title or status, different markup from the public article, saving or clearing the session on open, losing form values, raw colours, a dark: class, an animation, the preview on a public page and more); every mutation but two was caught by at least one specific row, so the tests are not vacuous.
Findings: spec-defect | note | logged | D-08 says the preview gets no maximum height, but nothing enforces it: adding maxHeight with overflowY auto to the preview's content box kept all 17 rows passing, because E2E-14 scrolls the last paragraph into view inside the nested box (optional fix: assert the content box has no vertical scroll)
 spec-defect | note | logged | the markup comparison covers only div.prose, so an extra plain div wrapped around the post body inside the preview passes all rows (matches Section 4 and D-07)
Product reading for the owner to audit (decided as [auto] by the spec writer): story Assumption 9 says reloading while previewing returns the owner to the post list; the panel keeps the chosen section in component state only, so a reload shows the section menu and the owner chooses Blog posts to see the list (D-18, E2E-12). Story Assumption 11 ("scrolls inside its own box") is read as horizontal scrolling of the box with no maximum height (D-08).
Known flaky test: the sign-in spec's E2E-09 ("a sign-in that Google does not complete shows the failure message and can be retried") failed once on the first run of the implementer's Verify here and passed on the rerun; it also failed once in the first Completion run of owner-google-sign-in. Both failures were the first run after a fresh build and neither reproduced; it is a timing flake in an earlier slice's test.
=====================================================================
