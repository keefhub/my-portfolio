=====================================================================
Task 1 — The shared list store type, the experience shape check and the browser's list store
Completed: 2026-11-27      Commit: 6c66c17

Summary: Moved the ListStore type and the list id pattern into the shared list module, added experienceShape (refuses wrongly typed bodies, treats absent fields as empty) and listClient, the browser's calls to the owner-only list routes with one fixed error text and no request when a reorder has no changes. The Firebase list store now imports its type from the shared module.
Decisions: listClient uses one private send() that adds cache no-store, a 15 s timeout, the JSON content-type and the ok check, so every failure is the fixed "The request failed." error. experienceShape copies details so the result is a fresh object. src/lib/firebase/list.ts imports ListStore as a type and re-exports it with export type next to the import.
Deviations: None.
Files changed: src/lib/admin/list.ts (modified), src/lib/admin/experience.ts (modified), src/lib/admin/listClient.ts (created), src/lib/firebase/list.ts (modified), e2e/owner-manages-experience.spec.ts (created)
E2E tests written: E2E-01, E2E-02, E2E-03      Passed before the change: E2E-01 (a guard row the spec says already holds)
Manual checks pending: None for this task (E2E-31, the owner's SIT check, is owned by a later task).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (spec Risk: high; test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: None.
=====================================================================

=====================================================================
Task 2 — The list SQL, the database functions, the generic list service and the owner-only route
Completed: 2026-11-27      Commit: b069ad3

Summary: Added the list SQL over a closed set of tables (the table name is the only interpolated text; every value is a bound parameter), the database functions, the generic list service (list, add, update, reorder all-or-nothing, delete; an unknown id answers not found and never inserts), a file-based stand-in, and the owner-only route at /api/admin/experience/ (GET, POST, PUT?id=, PATCH, DELETE?id=). The owner check runs before any body read and the id pattern before any database call. This is the shared pattern the next three list slices reuse.
Decisions: listSql has a private guard that throws for any table outside LIST_TABLES. In stand-in mode an element counts as a stored entry only if it has a string id and a finite number position; the same rule applies to update, reorder and delete. The stand-in read sorts by position then file index. The service checks the id against LIST_ID_PATTERN before the body. In the route the body is read only after the owner check, and an unparseable body counts as undefined.
Deviations: None.
Files changed: src/lib/server/listSql.ts (created), src/lib/server/standin.ts (modified), src/lib/server/database.ts (modified), src/lib/server/listStore.ts (created), src/app/api/admin/experience/route.ts (created), CLAUDE.md (modified, one Routes row, orchestrator), e2e/owner-manages-experience.spec.ts (modified)
E2E tests written: E2E-04 to E2E-13      Passed before the change: E2E-13 (a guard row)
Manual checks pending: E2E-31 (the owner's SIT check of the real database, the pooler and row level security).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: DOC-CLAUDE cleared by the CLAUDE.md Routes row; DOCS confirmed as the orchestrator's doc update)
Tier: high (spec Risk: high; large-diff 402 non-test lines; test-passed-before-change)
Review: risk reviewer PASS (review 1; mutation check on a scratch copy: skipping the owner check, inserting on an unknown id and a partial reorder each make a named test fail)
Findings: spec-defect | note | logged | the list schema statements run inside the same schema step as the profile and image statements, as the Step specifies; if the pooler refuses the experience statements, the profile and image routes fail too on SIT (look at the experience statements first); mention in the pull request
 edge-case | note | logged | no length or count limit on strings or on details (owner-only; revisit if a later slice adds size limits)
=====================================================================

=====================================================================
Task 3 — The Experience screen, retire the earlier Firebase experience code, amend the earlier specs and the docs
Completed: 2026-11-27      Commit: 21e5278 (the screen, the panel and the docs); the tests, the two Firebase deletions and the earlier-spec amendments are in the preceding commit 38b81f9

Summary: The panel's Experience item now shows the editor on the owner-only store: the owner adds, edits, reorders and, after confirming, deletes work and education entries, and the changes persist. The shared list editor works against the new store and no longer needs the saving-off flag. The Firebase experience store and its old spec are deleted. The three earlier specs now use "Blog posts" for the not-available notice and the sign-in menu loop skips Experience. CLAUDE.md describes the generic list service.
Decisions: ListEditor reads savingOn once as props.savingOn ?? true so the three failureMessage call sites are unchanged. ExperienceEditor's store is a module-level const. AdminPanel's notice condition is split across lines to add the experience exclusion. The CLAUDE.md Admin modules sentence is appended to the last sentence of that paragraph. The existing /api/admin/experience/ Routes row was left alone.
Deviations: COMMIT MISTAKE, corrected here: the first attempt to commit this task failed (git add refused a path whose deletion was already staged) and the script went on to log the task anyway, with the previous task's commit hash. That log commit (38b81f9, titled "log task 3") also swept in everything that was staged: the four test files, the deletion of the Firebase experience store and its old spec, and the earlier-spec amendments. The code and docs were committed next, as 21e5278. 38b81f9 therefore does not build on its own (the old ExperienceEditor still imported the deleted file); 21e5278 and everything after it do. The pushed history was not rewritten. The test author first missed the three earlier-spec amendments (they are test files, so they are the test author's, not the implementer's); the orchestrator sent the test author a narrow correction and checked the diff was exactly the named replacements. The implementer removed the two deleted files with git rm --cached followed by rm, so the deletions were already staged.
Files changed: src/app/components/admin/ListEditor.tsx (modified), src/app/components/admin/ExperienceEditor.tsx (modified), src/app/components/admin/AdminPanel.tsx (modified), src/lib/firebase/experience.ts (deleted), e2e/manage-experience.spec.ts (deleted), CLAUDE.md (modified), e2e/owner-manages-experience.spec.ts, e2e/owner-edits-profile.spec.ts, e2e/owner-uploads-images.spec.ts, e2e/owner-google-sign-in.spec.ts (modified)
E2E tests written: E2E-14 to E2E-27, E2E-29, E2E-30 (E2E-28 is a compiler check)      Passed before the change: None.
Manual checks pending: E2E-31 (the owner's SIT check).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================

=====================================================================
Completion — owner-manages-experience
Completed: 2026-11-27

Built: The panel's Experience screen. The owner adds, edits, reorders and, after confirming, deletes work and education entries and they persist through an owner-only route at /api/admin/experience/ (the owner check runs before any body read and the entry-id pattern before any database call). The list logic is a generic service over a closed set of tables with all-or-nothing reordering, and an update, reorder or delete of an unknown id answers not found and never inserts. This builds the shared list pattern (store type, browser list client, generic service, shared editor) that the projects, certifications and tech stack slices reuse; Section 2.4 of the spec states what each must add. The Firebase experience store and its old spec are removed.
Deviations from the spec: None in the build. Process mistake, corrected: the first attempt to commit Task 3 failed and the script logged the task anyway; commit 38b81f9 (titled "log task 3") also contains the Task 3 tests, the two Firebase deletions and the earlier-spec amendments and does not build on its own. 21e5278 completes the task and everything from it builds. The pushed history was not rewritten; the pull request should mention 38b81f9 so a bisect does not trip on it.
[auto] decisions: 20 lines tagged [auto] in the spec. No auto-revision was needed.
Feature review: PASS. Findings (all notes): the experience schema statements run inside the shared schema step, so if Supabase's pooler refuses them on SIT the profile and image routes fail too (look at the experience statements first; carried to E2E-31); no length or count cap on strings or detail lines (owner-only, spec Assumption 16); a paragraph in AdminPanel was not re-indented after the condition was split (cosmetic); and the mislabelled commit above.
Final verification: npm run build ok; npx playwright test e2e/owner-manages-experience.spec.ts 29 passed, 0 failed (the three earlier specs also pass whole: profile 30, images 35, sign-in 33).
Manual checks still pending (never run): E2E-31 (the owner's SIT check after the merge to develop and once the database setting is in Vercel: add, edit, reorder and delete an entry; the real database, the pooler and row level security are untested here).
Follow-ups not in scope: the notes above. No new setting name, no new dependency and no change to scripts/check-task.sh in this feature.
=====================================================================
