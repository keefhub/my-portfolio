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
