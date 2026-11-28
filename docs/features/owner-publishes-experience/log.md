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
