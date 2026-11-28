=====================================================================
Task 1 — The landing page shows the saved certifications and hides the section when there are none
Completed: 2026-11-28      Commit: b057997   (this commit removes the three hard-coded certifications; the owner re-enters them from its parent, D-13; public/certs/* stays)

Summary: Server-only certifications read with the build guard, tolerant view rules (badge: single-slash path or http(s); link: https only), the page renders section#certifications only when there are certifications and passes showCertifications to the header; the hard-coded entries are gone.
Decisions: card body built once and wrapped in <a> or <div>; the two address patterns are shared constants.
Deviations: Locked test E2E-07 expected an Experience menu link on an empty page, which the built tech-stack slice hides; a fresh test-author dispatch added and published one Experience entry first (D-20's own evidence), assertions unchanged.
Files changed: src/lib/publicCertifications.ts (created), src/lib/server/publicCertifications.ts (created), src/app/page.tsx, src/app/components/header.tsx, src/app/components/certifications.tsx (modified), e2e/owner-publishes-certifications.spec.ts (created)
E2E tests written: E2E-01..E2E-11, E2E-13, E2E-16      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (large-diff, implementer-deviation)
Review: risk reviewer PASS (review 1)
Findings: edge-case | note | logged | badge pattern accepts a backslash-led path that may load an image from another host (image only); harden the lookahead to (?![\/\\]) in a later revision
Findings: nit | note | logged | E2E-07's waitFor("Engineer") passes at once because metadata contains "Software Engineer"; the next goto is still the first renewed request
=====================================================================
=====================================================================
Task 2 — The earlier checks follow the hidden section
Completed: 2026-11-28      Commit: 99bf9b7

Summary: Earlier specs (profile, experience, retire-firebase, hosting) no longer expect section#certifications, its heading or certifications.tsx on a nothing-saved page; E2E-14 guards the removals.
Decisions: single-entry id/selector loops removed outright; the two Certifications heading assertions in the experience spec deleted.
Deviations: None.
Files changed: e2e/owner-publishes-profile.spec.ts, e2e/owner-publishes-experience.spec.ts, e2e/retire-firebase.spec.ts, e2e/hosting-and-backend-migration-acceptance.spec.ts, e2e/owner-publishes-certifications.spec.ts (modified)
E2E tests written: E2E-14      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
