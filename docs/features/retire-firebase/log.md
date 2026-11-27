=====================================================================
Task 1 — Delete the removed backend's files and prove the public site, the panel's privacy and the scans on the result
Completed: 2026-11-27      Commit: be7a9e2

Summary: The Firebase library folder, the two rules files, firebase.json, .firebaserc and the tracked .firebase cache are deleted, and nothing imported them. A new spec of 18 rows proves the public pages are unchanged against the commit before the migration, the panel stays private, the removed backend is gone from source, tooling and e2e, and no secret or owner email is in the repository or built output. The Firebase-era acceptance spec is deleted and eight earlier specs lose or reword their references to the removed files.
Decisions: Touched nothing under e2e/ (the test author's staged edits were already in place per D-23); the .firebase/ folder was removed whole.
Deviations: The first Stop-if (check the x-nextjs-cache HIT header on the unchanged tree) was not run separately; E2E-51 checks it on all eight public answers against the post-deletion build and passed, and no src/ file outside src/lib/firebase/ changed.
Files changed: src/lib/firebase/client.ts, config.ts, list.ts, firestore.rules, storage.rules, firebase.json, .firebaserc, .firebase/hosting.cHVibGlj.cache (all deleted); e2e/retire-firebase.spec.ts (created); e2e/admin-content-panel-acceptance.spec.ts (deleted); eight earlier e2e specs (modified)
E2E tests written: E2E-41 to E2E-57 and E2E-70      Passed before the change: E2E-44 to E2E-54, E2E-56, E2E-57, E2E-70 (guard rows, D-14; each has a control)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (large-diff, test-passed-before-change, implementer-deviation)
Review: risk reviewer PASS (review 1). In a scratch clone the reviewer injected one defect per row (an extra sitemap entry, a changed feed type, a panel link in the header, a POST handler, an AIza key, the owner email in built HTML and more); every guard row failed on its own defect.
Findings: vacuous-test | note | logged | E2E-41 counts a listed path only if it still exists on disk, because the deletions are staged only after the gate (still fails if a file is recreated)
 vacuous-test | note | logged | E2E-54 catches a signed-out write only if it creates a visible published post; the stand-in list is empty, so a write that only empties it would pass
 doc | note | logged | the first Stop-if was not run on the unchanged tree; covered by E2E-51 on the post-deletion build
=====================================================================
=====================================================================
Task 2 — Remove the packages, the deploy jobs and the Firebase ignore lines, and finish the earlier-spec edits
Completed: 2026-11-27      Commit: 1fc62e2

Summary: The firebase and firebase-tools packages and the two rules deploy scripts are removed with npm uninstall, so the lock file was rewritten by npm (588 entries from 1232; no version moved, and next, next-auth and postgres keep their pins). The pipeline workflow now holds only master-source and verify, with no secret, environment or hosting command. The Firebase ignore lines and the code scanning comment are updated. Four new rows (E2E-58 to E2E-61) prove it, and eight earlier specs finish their dependency-list and title edits. The build lists the public routes static and the panel and every /api route dynamic.
Decisions: Removed the two deploy scripts by a text replace after the uninstall; wrote the workflow and ignore edits exactly as the Step gave them; trimmed the workflow after the verify job's last step.
Deviations: None.
Files changed: package.json, package-lock.json, .github/workflows/pipeline.yml, .github/workflows/codeql.yml, .gitignore (modified); e2e/retire-firebase.spec.ts and eight earlier specs (modified)
E2E tests written: E2E-58 to E2E-61 (E2E-62 is the build's route list, checked by the Verify)      Passed before the change: None.
Manual checks pending: E2E-69 (the Build and lint job on GitHub after the pull request is opened).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (first run FAIL MANIFEST on a stray untracked firestore-debug.log, an emulator log that belonged to no task; deleted, rerun passed with no warnings)
Tier: high (the Step's own Risk line)
Review: risk reviewer PASS (review 1). It compared the lock package by package (nothing added, no version changed; ten surviving entries differ only in dev/optional flag keys), parsed both workflows, and confirmed CI needs no secret.
Findings: None.
=====================================================================
