=====================================================================
Task 1 — The landing page shows the saved Experience entries
Completed: 2026-11-28      Commit: 21b2aae   (this commit removes the hard-coded Experience entries; the owner re-enters them from its parent, D-13)

Summary: Server-only experience read (build guard as the profile read), client-safe tolerant view rules, the landing page passes the entries to the timeline, the timeline renders only what it is given; the five hard-coded entries are gone.
Decisions: break-words on the front-face paragraphs and h3, back-face paragraphs and detail span; min-w-0 on the detail span.
Deviations: back-face bullet is CSS before:content-['•'] on the li instead of a <span>•</span>, so the li text is exactly the detail line (locked tests). Locked test E2E-02 checked the whole HTML for "Software Engineer", which the site-wide metadata always contains; a fresh test-author dispatch narrowed it to "Software Engineer at Acme Pte Ltd". Gate wording: a test-file Change bullet named earlier specs' ids; D-17 widened (plain spec revision).
Files changed: src/lib/publicExperience.ts (created), src/lib/server/publicExperience.ts (created), src/app/page.tsx (modified), src/app/components/experienceTimeLine.tsx (modified), e2e/owner-publishes-experience.spec.ts (created)
E2E tests written: E2E-01..E2E-11, E2E-13, E2E-17, E2E-18      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None (D-17 widened as a plain revision).
Mechanical gate: PASS (warnings: none)
Tier: high (large-diff, implementer-deviation)
Review: risk reviewer PASS (review 1)
Findings: nit | note | logged | CSS bullet deviation acceptable
Findings: nit | note | logged | narrowed E2E-02 absence check acceptable
=====================================================================
=====================================================================
Task 2 — The success message and the earlier checks follow the change
Completed: 2026-11-28      Commit: 75f7d07

Summary: The Publish success message now names "the changes"; the earlier profile spec's expected text and the two pre-migration source lists were updated (experienceTimeLine.tsx removed).
Decisions: None.
Deviations: None.
Files changed: src/lib/admin/publish.ts (modified); e2e/owner-publishes-experience.spec.ts, e2e/owner-publishes-profile.spec.ts, e2e/retire-firebase.spec.ts, e2e/hosting-and-backend-migration-acceptance.spec.ts (modified)
E2E tests written: E2E-12, E2E-15      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Task 3 — The standing documents and the earlier spec describe the entries as read from the database
Completed: 2026-11-28      Commit: 1b86c2b

Summary: CLAUDE.md and Reference.md describe the public experience read; Reference.md's "add an experience entry" path now points at the panel and Publish; the earlier profile spec carries the new success message.
Decisions: Reference.md reads "Add the entry in the admin panel's Experience section, then press Publish."; replace-all of the old message in the earlier spec (7 lines).
Deviations: None.
Files changed: CLAUDE.md, Reference.md, docs/features/owner-publishes-profile/spec.md (modified); e2e/owner-publishes-experience.spec.ts (modified)
E2E tests written: E2E-16      Passed before the change: None.
Manual checks pending: None.

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

Built: server-only experience read with the build guard, tolerant client-safe view rules, the landing page passing the entries to the timeline in the panel's order, the timeline hidden when empty, the generic Publish success message, and the earlier checks and documents brought in line.
Removed content (D-13): the five hard-coded Experience entries were removed in 21b2aae; the owner re-enters them from its parent (21b2aae^:src/app/components/experienceTimeLine.tsx).
Deviations from the spec: CSS bullet on the back-face li; E2E-02 absence check narrowed (site-wide metadata contains "Software Engineer"); D-17 widened for gate wording.
[auto] decisions in the spec: 16 lines (D-04..D-19).
Feature review: PASS (a first review ran against a wrong base commit and was discarded; the review against the correct base d56d36a passed)
Findings: nit | note | logged | CLAUDE.md invariant 1 reads as if each slice declares revalidate = false; reword in a later docs pass
Findings: nit | note | logged | page.tsx reads run sequentially; Promise.all optional
Final verification: npm run build ok; e2e/owner-publishes-experience.spec.ts 17 passed, 0 failed.
Manual checks pending: None.
Follow-ups: OQ-1 (a failure in the experience read alone during a renewal) is the outage slice's.
=====================================================================
