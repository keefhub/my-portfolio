=====================================================================
Task 1 — Add the tech stack modules and the pure rows
Completed: 2026-11-26      Commit: d6fc320

Summary: src/lib/admin/techstack.ts and src/lib/firebase/techstack.ts (collection techCategories, fields category and tools[{name, icon}]). Pure rows E2E-01 to 03 pass.
Decisions: moveTool returns null for a non-integer index too; modules follow the Step's signatures and texts.
Deviations: None.
Files changed: src/lib/admin/techstack.ts, src/lib/firebase/techstack.ts, e2e/manage-tech-stack.spec.ts (created)
E2E tests written: E2E-01 to E2E-03      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
