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
