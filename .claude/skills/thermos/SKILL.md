---
name: thermos
description: "Run both thermo-nuclear reviews (bugs/security and code quality) in parallel as subagents, then synthesise one verdict. Use for 'thermos', 'double thermo review', or a combined correctness and maintainability audit of a branch. Manual only."
disable-model-invocation: true
---

# Thermos

Adapted from Cursor's `thermos` plugin. Runs [`thermo-nuclear-review`](../thermo-nuclear-review/SKILL.md) and [`thermo-nuclear-code-quality-review`](../thermo-nuclear-code-quality-review/SKILL.md) as two parallel read-only subagents and merges the results. Nothing is edited, staged or committed.

## Usage

```
/thermos                 # review the current branch against the base branch
/thermos <pr-number>     # review that PR's diff
```

## Workflow

1. **Scope.** Take it from the request, a PR, or the current branch. Default base is the branch `.claude/repo-profile.md` § Branches names. Run `git status --short` and `git log --oneline <base>..HEAD`; if there is no diff, say so and stop.
2. **Gather context once.** `git diff <base>...HEAD` and the full contents of each changed file. Pass the same material to both reviewers so their findings are comparable.
3. **Dispatch both in the same message**, in the background:
   - `thermo-nuclear-review-subagent` for bugs, breakage, security, dev-workflow and rule violations.
   - `thermo-nuclear-code-quality-review-subagent` for structure, layering, design-system fit and file growth.
   Give each a prompt with `### Git / diff output` and `### Changed file contents` sections.
4. **Synthesise.** Findings first, deduplicated. Weight findings both reviewers raise more heavily. Where they disagree, decide using your own reading of the code. Keep the summary short.
5. **Verification.** Report the result of the verification commands in `.claude/repo-profile.md` (typecheck, lint, the build, and the feature's own e2e spec — not the full suite) when the tree allows. Say plainly which `manual` checks in the feature's spec were not run by this review.

If the reviewers' summaries are already visible, don't restate them. Give the unified verdict, the highest-signal findings, and what remains uncertain.
