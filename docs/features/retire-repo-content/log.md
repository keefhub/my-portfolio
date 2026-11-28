=====================================================================
Task 1 — Rewrite the standing documents, record the removing commits, flag the rewrite in the template
Completed: 2026-11-28      Commit: 4c90316

Summary: README, Reference.md, CLAUDE.md, OVERVIEW.md and .claude/repo-profile.md now describe content as living only in the database and going live on Publish; Reference.md gains "Content removed from the repository" naming 58b1d9f, 21b2aae, b61ba7b, adda6c3, b057997 and 7a142c7; the PR template gains "Standing rules rewritten".
Decisions: edits made by exact-once text replacement; OVERVIEW items 2 and 5 replaced as whole lines; the Reference.md section sits before "## Deployment".
Deviations: None.
Files changed: README.md, Reference.md, CLAUDE.md, docs/features/OVERVIEW.md, .claude/repo-profile.md, .github/pull_request_template.md (modified); e2e/retire-repo-content.spec.ts (created)
E2E tests written: E2E-01, E2E-02, E2E-03      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None. (One orchestrator wording fix: the Step's "E2E-0N" placeholder was read by the gate as an id; replaced in the spec revision commit before the gate re-run.)
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
=====================================================================
Task 2 — Add the file-scan checks
Completed: 2026-11-28      Commit: 9113386

Summary: E2E-04 to E2E-11 scan the project (and the built output) for left-over content, hard-coded lists, post files, dependency/config drift, new settings, database addresses, real emails, setting values and logged settings; each scan proves itself on a planted match first.
Decisions: None (tests-only Step; no implementer dispatch, nothing to implement).
Deviations: None.
Files changed: e2e/retire-repo-content.spec.ts (modified)
E2E tests written: E2E-04, E2E-05, E2E-06, E2E-07, E2E-08, E2E-09, E2E-10, E2E-11      Passed before the change: all eight (expected, spec D-11: the end state already holds)
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: high (test-passed-before-change)
Review: risk reviewer PASS (review 1)
Findings: test-coverage | note | logged | E2E-10's email-domain filter has no planted control of its own
Findings: test-coverage | note | logged | E2E-06's front-matter sub-check has no planted control (the planted file sits outside src)
Note: Task 1's test file e2e/retire-repo-content.spec.ts landed in the spec revision commit (staged tests were included when that commit was made); not amended, per the no-amend rule.
=====================================================================
