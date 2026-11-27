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
=====================================================================
Task 3 — Rewrite the standing documents for the new stack
Completed: 2026-11-27      Commit: 782f2c4

Summary: README.md is now a real description of the site, the stack (Vercel, Auth.js, Supabase), how to run it, the checks and the branches, replacing a four-line draft note. Reference.md is rewritten for the new stack: the route table gains the /api/auth/* and /api/admin/* rows, the Backend section lists the server pieces, the panel tree drops the notice and user-ID states, and the deployment notes say sign-in does not work on preview addresses. CLAUDE.md loses its leftover-rules paragraph and the Firebase wording; the repo profile loses the rules-job and service-account wording; OVERVIEW.md's index lists the feature. Every string earlier specs still read from these documents is kept.
Decisions: README paragraphs are the implementer's own wording within the Step's keyword list; Reference.md's /api/auth/* row points at the nextauth route file and /api/admin/* at src/app/api/admin/**; the earlier-admin-specs sentence in the profile was removed with its line break.
Deviations: None.
Files changed: README.md, Reference.md, CLAUDE.md, .claude/repo-profile.md, docs/features/OVERVIEW.md (modified); e2e/retire-firebase.spec.ts (E2E-63 added)
E2E tests written: E2E-63      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
Cross-spec check (extra, not required by the gate): every earlier owner-* spec was run whole, one at a time, after the edit, and all passed (sign-in 33, profile 30, uploads 35, experience 29, projects 30, certifications 34, tech-stack 34, blog posts 34, preview 17). Running several spec files in one command makes them interfere through the shared stand-in database (empty-list expectations fail), so they must be run one file per command.
=====================================================================
=====================================================================
Task 4 — Clear the last traces in tooling text, add the settings section to the pull request template, and prove the whole search
Completed: 2026-11-27      Commit: 766bad3

Summary: The removed backend's hosting file is gone from the gate's sensitive-path list and from the bugfix, user-story-creator and write-bug-report skill files. The pull request template gains a "Settings to set in Vercel" section naming the seven settings and where each is set. Four rows (E2E-64 to E2E-67) prove the whole-repo search finds no trace outside the named records and public content, and that the template section is complete.
Decisions: None beyond the Step; edits applied by exact-match replacement with each target asserted once.
Deviations: None. The implementer made the one-line scripts/check-task.sh edit itself (removing the firebase.json alternative from the sensitive-path case); the diff is exactly that one alternative, as D-11 specifies, and is flagged for human review in the pull request with the two earlier gate-script edits.
Files changed: scripts/check-task.sh, .claude/skills/bugfix/SKILL.md, .claude/skills/user-story-creator/SKILL.md, .claude/skills/write-bug-report/SKILL.md, .github/pull_request_template.md (modified); e2e/retire-firebase.spec.ts (E2E-64 to E2E-67 added)
E2E tests written: E2E-64 to E2E-67      Passed before the change: None.
Manual checks pending: E2E-68 (read the pull request description on GitHub after it is opened into develop), E2E-69 (the Build and lint job on GitHub).

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
Completion — retire-firebase
Completed: 2026-11-27

Built: The Firebase backend is retired and the new stack is documented. The Firebase library folder, rules files, hosting config and tracked cache are deleted; the firebase and firebase-tools packages and the two rules deploy scripts are removed (the lock file was rewritten by npm, nothing else moved); the pipeline workflow keeps only master-source and verify and needs no secret; the stale ignore lines and tooling text are cleared; README, Reference.md, CLAUDE.md, the repo profile and the overview describe Vercel, Auth.js and Supabase; and the pull request template gains a "Settings to set in Vercel" section naming the seven settings. A new spec of 27 rows proves the public pages are unchanged from before the migration, the panel stays private and indexless, the removed backend is absent from source, tooling and e2e, and no secret or owner email is in the repository or built output. The Firebase-era acceptance spec is deleted and eight earlier specs lose or reword their references to removed files.
Deviations from the spec: None. The Task 1 first Stop-if (the cache header on the unchanged tree) was covered by E2E-51 on the post-deletion build.
[auto] decisions: 21 lines tagged [auto] in the spec (D-01 to D-22 in the written spec, plus D-23 from the revise round: the test author makes every change under e2e/ in Steps 1 and 2). No auto-revision was needed during the build.
Feature review: PASS. Findings (notes): E2E-41 counts a listed path only if it is still on disk, because deletions are staged after the gate; E2E-54 would miss a write that only emptied non-published data (E2E-53 and E2E-70 still catch any accepted write); the bugfix and write-bug-report skills still carry other stale static-export wording (D-10 limited the edit); D-22: a write method to a prerendered /blog/<slug>/ answers 200 with the unchanged page, so the story's "refused" is met as nothing created, changed or deleted, because a literal 405 needs middleware that Invariant 1 forbids (owner to audit, OQ-8).
Final verification: npm run typecheck ok; npm run build ok; npx playwright test e2e/retire-firebase.spec.ts 27 passed, 0 failed, 0 flaky. Each earlier owner-* spec also passes when run alone after Task 3 (sign-in 33, profile 30, uploads 35, experience 29, projects 30, certifications 34, tech-stack 34, blog posts 34, preview 17).
Manual checks still pending (never run): E2E-68 (read the pull request description on GitHub and confirm it lists the seven settings), E2E-69 (the Build and lint job on GitHub after the pull request is opened).
Follow-ups not in scope: the notes above; the skills' remaining stale wording; the owner deleting the Firebase projects, the SIT hosting site and the service-account secret (intent section 7).
=====================================================================
