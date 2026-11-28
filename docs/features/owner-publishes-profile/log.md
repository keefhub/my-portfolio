=====================================================================
Task 1 — The owner-only publish route, the public profile read and the view rules
Completed: 2026-11-28      Commit: 2a35b13

Summary: Added POST /api/admin/publish/ (owner check, one profile read, revalidatePath("/"), 503 on a failed read), the server-only public profile read and the client-safe view rules.
Decisions: A private parseUrl helper in publicProfile.ts is shared by socialKind and the host-name label fallback.
Deviations: None.
Files changed: src/app/api/admin/publish/route.ts (created), src/lib/server/publicProfile.ts (created), src/lib/publicProfile.ts (created), CLAUDE.md (modified, Routes row by the orchestrator), e2e/owner-publishes-profile.spec.ts (created)
E2E tests written: E2E-09, E2E-19, E2E-20      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: DOCS CLAUDE.md changed — the orchestrator's Routes row for the new route; cleared)
Tier: high (spec Risk: high)
Review: risk reviewer PASS (review 1)
Findings: spec-defect | note | logged | D-13 gives an empty label for a mailto link with no label (hostname is empty); fall back to the address
Findings: edge-case | note | logged | a photo of //host/x.png passes the leading-slash rule; next/image behaviour unchecked
=====================================================================
=====================================================================
Task 2 — Landing page, hero, About, footer and header read the published profile
Completed: 2026-11-28      Commit: 58b1d9f

Summary: The landing page reads the published profile on the server (kept copy, revalidate = false) and passes it to the hero, About, footer and header; empty parts and their menu links are hidden; the hard-coded profile content is gone.
Decisions: ICONS record typed Record<ContactKind, …> in hero.tsx and footer.tsx; long words wrap with wrap-anywhere; hero text container w-full min-w-0; Header memoises its filtered sections on showAbout.
Deviations: aboutme.tsx text block entry animation x:-30 -> y:24 (E2E-13 x >= 0; entry animation only, photo keeps x:30); page.tsx <main> gained overflow-x-clip because the Experience cards (don't-touch) overflow at 375px (cost: hover shadows or scale at section edges can be clipped); footer brand block min-w-0 max-w-full wrap-anywhere for long names at 375px. Locked test E2E-05 read a disposed Playwright response; a fresh test-author dispatch moved the reads inside the callback with assertions unchanged, then the test was relocked.
Files changed: src/app/page.tsx (modified), src/app/components/hero.tsx (modified), src/app/components/aboutme.tsx (modified), src/app/components/footer.tsx (modified), src/app/components/header.tsx (modified), e2e/owner-publishes-profile.spec.ts (modified)
E2E tests written: E2E-02, E2E-04, E2E-05, E2E-10, E2E-11, E2E-12, E2E-13, E2E-14, E2E-21 (E2E-23 is the build check)      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: E2E-03 moved to Step 3, which builds the Publish button (D-24, spec 0.3.0); Step 2's spec-file bullet no longer names the build-only check E2E-23 (D-25, spec 0.3.1)
Mechanical gate: PASS (warnings: TAILWIND [2rem] x2 in aboutme.tsx — pre-existing lines, not added by this task; cleared)
Tier: high (large-diff, implementer-deviation)
Review: risk reviewer PASS (review 1)
Findings: nit | note | logged | footer.tsx ICONS const sits between import statements
Findings: conformance | note | logged | the three deviations are acceptable
=====================================================================
