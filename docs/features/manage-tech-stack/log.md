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
=====================================================================
Task 2 — Extend the list editor, build the Tech stack screen and show it for the "Tech stack" menu item
Completed: 2026-11-26      Commit: 5665535

Summary: TechStackEditor on ListEditor with nested items. 20/20 tech-stack rows; experience 30, projects 17, certifications 16 pass with --grep-invert on their placeholder test (the five earlier placeholder tests are moved in Task 3, D-25: they are red between this commit and Task 3's).
Decisions: ListEditor split submit into handleSubmit (event wrapper) and saveContent(source); saveNow sets the draft and runs saveContent; renderFields is called through an internal FieldsHost component (avoids react-hooks/refs, no behaviour change); tech fields live in a TechFields component so the item-delete confirmation is local and resets on close; the confirmation closes after Confirm in edit mode; rowDetails is a div role="group" of <p> lines.
Deviations: None.
Files changed: src/app/components/admin/ListEditor.tsx, AdminPanel.tsx, Reference.md (modified), src/app/components/admin/TechStackEditor.tsx (created), e2e/manage-tech-stack.spec.ts (modified)
E2E tests written: E2E-04 to E2E-20      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: LOG emulator MetadataLookupWarning, harmless; DOCS Reference.md is the orchestrator's update)
Tier: high (Step Risk: high; large-diff)
Review: risk reviewer PASS (review 1)
Findings: edge-case | note | logged | saveNow checks the busy state while saveContent checks busyRef; practically unreachable (buttons disabled while busy). Optional: check busyRef.current in saveNow.
=====================================================================
