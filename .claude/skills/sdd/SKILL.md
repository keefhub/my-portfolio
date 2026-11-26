---
name: sdd
description: "Execute the implementation plan in docs/features/<slug>/spec.md (Section 8, or a thin spec's implementation order) one step at a time via fresh subagents, writing the end-to-end tests each step names, running each step's Verify command and stopping on its Stop-if, gated by independent review (spec compliance, code quality) before anything is committed. Use when asked to run/execute a feature's spec with subagents, 'subagent-driven development', or to implement a /feature-spec output autonomously. Persists resumable state to PROGRESS.md and log.md in the feature folder. Does not write specs (see feature-spec)."
---

# /sdd

Execute the implementation plan of one feature — Section 8 of `docs/features/<slug>/spec.md` — step by step using **fresh subagents** for implementation and **independent review gates** per step (how many is risk-tiered — see Step 3), with the controller (this session, never a subagent) owning every commit. Each Section 8 `### Step N` block is one *task* below (Task N = Step N, same number); the words "Step 0" to "Step 8" in this file name stages of the `/sdd` loop, not spec steps.

A thin-feature spec has no Section 8: execute its **Implementation order** list the same way, one numbered item per task.

## Usage

```
/sdd <slug>                       # executes docs/features/<slug>/spec.md
/sdd <slug> resume                # continue an interrupted run
```

e.g. `/sdd export-report-as-csv`. State lives in `docs/features/<slug>/` — nothing is written outside the feature folder.

## Core invariants

These are non-negotiable — do not shortcut them under time pressure or when a task "looks trivial":

1. **One task in flight at a time.** Never start task N+1 while task N's implementation or review is still in progress. Within a task, the two review gates run **in parallel** (dispatched in the same message, not sequentially).
2. **Fresh subagent per task.** Every implementer and every reviewer is a brand-new `Agent` call with no memory of prior tasks. Its prompt must contain the full task text and every piece of context it needs, pasted in — never "see the plan we discussed" or "as before." The implementer is explicitly told not to run `git add` or `git commit`.
3. **Mandatory independent review**, never skipped — each gate a separate fresh subagent that reads the actual changed files itself (`git status`, `git diff`, then `Read` the full files) and never trusts the implementer's self-reported summary. Two concerns are always covered:
   - **Spec/requirements** — did it build what the task and source spec asked for; lists gaps.
   - **Code quality** — is it correct and consistent with this codebase's own patterns; lists bugs/issues.

   **How many subagents carry them is risk-tiered per task** — two separate gates, or one combined gate for pure UI/route wiring. Step 3 and [`.claude/repo-profile.md`](../../repo-profile.md) § Gate risk tiers own that decision. What is non-negotiable is that both concerns are reviewed by someone who did not write the code, and that every gate returns `PASS` before the task is committed.
4. **Persistent, file-based state**: `PROGRESS.md` (one checkbox per task, git-ignored run state) and `log.md` (append-only, one entry per completed task, committed) live in `docs/features/<slug>/`, beside `spec.md`. Update both **only after both gates pass and the commit exists** — this is what makes a run resumable after the session dies mid-plan. Do not use the in-session todo list as a substitute; it does not survive a restart.
5. **The controller commits, never a subagent.** No implementer or reviewer subagent ever runs `git add`/`git commit`. This session stages, reviews the diff, and commits only after both gates are green.
6. **Dispatch gate before every task** (including the first): confirm the previous task's checkbox, log entry, commit, and both gate verdicts all agree before starting the next one.
7. **Escalate, don't blindly retry.** If the same task fails for the 2nd consecutive time (implementation failure, or a gate still failing after one fix-and-re-review cycle), stop and ask the user how to proceed. Do not attempt a 3rd automatic try.
8. **No branch-guard checks.** This is a personal project — direct commits to the current working branch are fine. Do not add protected-branch logic.
9. **Clean working tree before the run starts.** "Dirty" means **tracked files with uncommitted modifications**. Untracked paths no task will touch are permitted but must be declared. This is not tidiness: every reviewer runs `git status --short` and sees the same tree, so undeclared changes are what produce wrong-baseline review findings — a gate failing on code that is not part of this task at all. The permanently-permitted paths live in [`.claude/repo-profile.md`](../../repo-profile.md) § Known-dirty paths; read them there rather than keeping a copy here.

---

## Step 0 — Setup

1. **Clean-tree precondition — run this FIRST, before anything else in Step 0.** `git status --short`. Treat every path in [`.claude/repo-profile.md`](../../repo-profile.md) § Known-dirty paths as permanently permitted. If any *other* tracked file shows uncommitted modifications, **stop and report** — list the files and ask the user to commit, stash, or declare them. Record whatever they declare; Step 3 of the per-task loop pastes that list into every gate prompt.

   > This is item 1 deliberately. Items 4 and 5 below *create* `PROGRESS.md` and `log.md`, so a precondition placed after them would trip on files `/sdd` itself had just written.

2. Resolve the argument to `docs/features/<slug>/` (`ls docs/features/<slug>`) and read `spec.md` in full. Take the plan from **Section 8**: every `### Step N` block, each with **Satisfies**, **Depends on**, **Files**, **Change**, **Verify** and **Stop-if**. Also read Section 2 "Decisions made (do not revisit)" and "Do not touch" — both go into every implementer and reviewer prompt — and Section 4 (Verification mapping): the `E2E-` rows a task writes go into its prompts. If `spec.md` has no Section 8 it is a thin spec: use its **Implementation order** list instead, and its **Verification** table in place of Section 4. If neither exists, stop and offer `/feature-spec`.
3. Let `<feature-dir>` be `docs/features/<slug>/`.
4. **`PROGRESS.md`** — if `<feature-dir>/PROGRESS.md` already exists, **stop and ask the user** whether to resume or start over, unless they already said to resume (`/sdd <slug> resume`). On resume, read it — it is the source of truth for which tasks are done, not your memory of a prior session. If it does not exist, create it (template below) with one unchecked line per task. It is git-ignored run state, scoped to this feature: *feature-level* progress is still derived from `git log`, per CLAUDE.md. The two do not compete.
5. **`log.md`** — if `<feature-dir>/log.md` does not exist, create an empty file. If it already exists, leave existing entries untouched and append below them.
6. Find the first unchecked task in `PROGRESS.md`. If none — every task is checked — skip to **Completion** below.
7. Build the **context packet** handed to every subagent: [CLAUDE.md](../../../CLAUDE.md)
   § Never violate, § Layout, § Domain facts and § Conventions, pasted verbatim. Each dispatch
   also receives the task's row from [`.claude/repo-profile.md`](../../repo-profile.md) § Layers,
   and — for a task tagged `ui`, or any task whose **Files** include a component, when the profile
   names a design system — the sections of it the task touches. Paste only those sections,
   never the whole design doc. A task whose **Files** include the feature's e2e spec file also
   receives [`.claude/repo-profile.md`](../../repo-profile.md) § Behavioral gate (the e2e test
   file conventions), pasted verbatim. Re-read CLAUDE.md in full only when a task will modify it
   (see below).

**`PROGRESS.md` template:**

```markdown
# SDD Progress — <feature title>

Spec: `docs/features/<slug>/spec.md`

- [ ] Task 1: [Layer] — <outcome>
- [ ] Task 2: [Layer] — <outcome>
- [ ] Task 3: [Layer] — <outcome>
```

`[Layer]` is derived from the task's **Files** using [`.claude/repo-profile.md`](../../repo-profile.md) § Layers (a task spanning layers takes the riskiest one for gate tiering). Each line is ticked with its commit hash appended only in Step 7 below, e.g. `- [x] Task 1: [data] — add CSV row serialiser (a1b2c3d)`.

---

## Keeping CLAUDE.md and the design doc current

[CLAUDE.md](../../../CLAUDE.md) states its own policy: "if it contradicts the code, the code wins — fix this file in the same change." `/sdd` enforces that policy at every task, since each task is exactly one committed change and the doc update belongs in that same commit — not a cleanup pass at the end of the plan.

**The controller owns this update, not the implementer.** Wire it into the loop as: the implementer builds and reports (Step 2), **the controller updates the docs against the table below — after the implementer returns and before the gates are dispatched (Step 2b)** — the spec reviewer then checks that update against the real code as part of the diff it reviews (Step 3, Gate A), and the controller stages it with everything else the task touched (Step 6). Never touch either file from outside a task's own diff.

The timing is the point. Making the edit *after* the gates would leave the one part of each commit that no reviewer ever sees. Doing it before they are dispatched keeps it inside the reviewed diff.

The controller reads only the section the table points at — not the whole file.

**Update in the same task's diff when the task:**

| Task does this | Update this section |
| --- | --- |
| Adds, moves or deletes a file or directory that `CLAUDE.md` § Layout shows, or adds a new module, route or endpoint | `CLAUDE.md` § Layout |
| Adds, removes, or upgrades a runtime dependency | `CLAUDE.md` header line (stack) |
| Adds a persisted key or changes a stored shape, adds an endpoint or action, changes a domain rule, or changes a module's public API | `CLAUDE.md` § Domain facts |
| Adds a component or changes a component's variants, props or behaviour as documented | the design doc's component section (and its file map if the layout changed), when the profile names a design doc |
| Adds or changes a design token | the design doc's token section, when the profile names one |
| Changes a path or rule named in `.claude/repo-profile.md` | that section of the profile |
| Makes any other fact in those files stop matching the code | whichever section is now wrong |

A task that touches none of the above leaves the docs untouched — do not add speculative or restating-the-obvious lines.

**CLAUDE.md's workflow sections — touch only when the task itself changes the workflow**, not when it implements product code: a new skill, a revised implementation order, a changed per-feature loop step. This will be rare-to-never for ordinary feature tasks. If a task's own plan text calls for a process change, update it there and say so in the log entry's Key Decisions.

---

## The per-task loop

Run this loop once per task, strictly in order. Do not read ahead and batch tasks.

### Step 1 — Dispatch gate

Before starting this task (skip these checks only for the very first task of the run):

- [ ] `PROGRESS.md` shows the previous task checked, with a commit hash.
- [ ] `log.md` has a matching entry for the previous task.
- [ ] `git log --oneline -1` shows a commit whose subject matches that task's scope.
- [ ] That `log.md` entry shows both review gates as `PASS`.

If any of these is false, **stop and tell the user** what's inconsistent — do not guess forward or "fix" state silently.

### Step 2 — Implement (fresh subagent)

Dispatch one `Agent` call, `subagent_type: general-purpose`, run in the foreground (`run_in_background: false` — the next step depends on its result). Build the prompt from this template, with everything in `{{...}}` pasted in literally:

```
You are implementing exactly one step from a feature's implementation plan.
Work only within the scope below — do not read ahead in the plan, do not
touch other steps, and do NOT run `git add` or `git commit` under any
circumstances; the controller commits after independent review.

FEATURE CONTEXT
Feature: {{spec.md title}}
Approach: {{spec.md Section 2.1 Approach}}
Decisions made — do not revisit: {{spec.md Section 2.7, verbatim}}
Do not touch: {{spec.md Section 2.8, verbatim}}

REPO CONVENTIONS
{{the context packet from Step 0 item 7: the CLAUDE.md sections, this task's
  repo-profile § Layers row, and the relevant design-doc sections for
  UI work. Paste these, never the raw OVERVIEW.md or the whole design doc.}}

If anything this task needs is missing from the context above, say so in your
report rather than guessing — the packet gets corrected.

TASK TO IMPLEMENT (verbatim from spec.md Section 8)
{{full "### Step N" block — Satisfies, Depends on, Files, Change, Verify, Stop-if}}

E2E TESTS THIS TASK WRITES (verbatim rows from spec.md Section 4)
{{every `e2e` E2E- row whose id this Step's Change names — E2E ID, AC,
  Steps, Assertion — or "None."}}

Instructions:
1. Tests first. For each E2E row above, write one test in the feature's
   spec file titled `E2E-NN: <what it checks>`, following the
   e2e conventions in REPO CONVENTIONS. Its actions are the row's
   Steps and its expectations are the row's Assertion — no weaker. Run it
   with the Step's e2e Verify command and confirm it FAILS for the
   reason the row describes (the behaviour is missing), not a typo, a bad
   locator or a server error. A test that passes before the Change exists
   proves nothing: if one does, say so in your report.
2. Implement the Change. Then run every Verify command yourself and compare
   the real output with its expected result. A Verify line marked `manual`
   needs a human and a browser: do not claim it passed — list it in your
   report as "manual check pending" with its E2E id.
3. Never make a test pass by weakening it: no loosened or deleted
   expectation, no skipped, focused or pending test, no
   fixed-duration sleep, no assertion other than the row's. If you believe the
   row's Assertion itself is wrong, that is a spec defect — stop and report
   it with the evidence.
4. If a Stop-if condition holds, or a real result doesn't match an expected
   result, stop at once, do not improvise beyond what the step describes,
   and report exactly what you observed instead of pushing forward.
5. Do not perform any step titled "Commit" — stop once the task's
   Verify commands pass.
6. Do not edit CLAUDE.md, the design doc or .claude/repo-profile.md.
   The controller owns those updates for this task.
7. Report back: every file created/modified/deleted, the literal output of
   each verification command you ran — including the failing e2e
   run from instruction 1 and the passing one after the Change — and any
   deviation from the plan as written (extra file, different name, a step
   that turned out unnecessary).
```

If the implementer reports it could not complete the task, or a Verify command's real output didn't match its expected result, treat this as a **failed attempt** for this task (see Escalation). If it reports a **Stop-if** condition, do not retry: the spec's premise is wrong. Stop and report the observed condition to the user — that is a spec defect for `/feature-spec` revision mode, not an implementation failure.

### Step 2b — Controller updates the docs (before dispatching gates)

Check what the implementer actually changed against the table in *Keeping CLAUDE.md and the design spec current*. If a row applies, update that section now — reading only that section, not the whole file. If no row applies, leave the docs untouched; do not add speculative or restating-the-obvious lines.

This must happen **before** Step 3, so the edit is inside the diff the gates review.

### Step 3 — Two review gates (parallel, fresh subagents)

**How many gates this task gets** is decided per task by its `[Layer]`, not by the size of the
feature it belongs to. [`.claude/repo-profile.md`](../../repo-profile.md) § Gate risk tiers is the
source of the rule; do not restate its criteria here. In short: a task touching types, data,
domain logic, shared libraries, or any module boundary gets **two** independent gates; pure UI and route
wiring with no data or rule change gets **one** combined gate — a single fresh subagent given the Gate A
brief with the Gate B checklist appended to its report instruction.

Task-level tiering outranks the feature-level thin rule. A task the profile tiers as high-risk gets two gates even
inside a thin feature; `CLAUDE.md`'s thin-feature rule governs only whether `/feature-spec` writes the full
document or the short note.

**Every gate prompt opens with the baseline contract below, pasted in by the controller.** Both
false-positive classes seen in practice came from its absence — a reviewer judging the working tree
instead of this task's diff, and a reviewer flagging the not-yet-existing commit as a gap.

```
BASELINE — read this before anything else.

THE DIFF UNDER REVIEW (this is the whole change; nothing else is yours to judge):
{{the exact `git diff` the controller intends to commit, pasted verbatim}}

UNRELATED UNCOMMITTED PATHS, declared at Step 0 — NOT part of this task, never a finding:
{{the declared known-dirty list, by name, or "none"}}

WHERE YOU ARE IN THE PIPELINE: the commit does not exist yet. `PROGRESS.md` and `log.md` are
written by the controller only after you pass. Their absence, an unticked checkbox, and a missing
commit are the correct state right now and are never a gap.

If your reading of the repo disagrees with the diff above, re-read against `git show HEAD:<path>`
before reporting — the working tree may contain changes that are not this task's.
```

Dispatch **both** of the following in the **same message** (two `Agent` tool calls, `subagent_type: general-purpose`, `run_in_background: false`) so they run in parallel and you block on both before deciding.

**Gate A — Spec/requirements reviewer:**

```
{{paste the BASELINE block above, filled in, as the first thing in this prompt}}

You are reviewing whether a just-completed implementation task actually
satisfies its specification. You were not involved in writing the code —
verify everything yourself from the real files, never from a summary
someone else gives you.

TASK AS SPECIFIED (verbatim from spec.md Section 8)
{{full "### Step N" block}}

SOURCE REQUIREMENT
{{the business rules (BR-) and design elements (TS-) the Step's Satisfies line cites,
  copied from spec.md Sections 1.3 and 2.2, plus Section 2.8 "Do not touch" — or
  "None cited — judge against the task text only."}}

E2E TESTS THIS TASK MUST WRITE (verbatim rows from spec.md Section 4)
{{the same E2E rows the implementer received, or "None."}}

Do this, in order:
1. Run `git status --short` and `git diff` (or `git diff --staged` if the
   changes are already staged) to see exactly what changed.
2. Read the full content of every changed file listed — not just the diff
   hunks — so you can judge behavior the diff alone won't show.
3. Check every step and acceptance detail in the task/spec against what
   the code actually does.
4. Check the docs against this rule: {{paste the "Update in the same
   task's diff when the task..." table}}. If a row applies and the named
   doc section was NOT updated in this diff, that is a gap. If a doc was
   updated, confirm what it now says still matches the real code you just
   read — a stale or inaccurate doc update is also a gap.
5. For every E2E row above: the feature's spec file has exactly one test
   titled with that id, its actions match the row's Steps and its
   expectations are at least as strong as the row's Assertion. A missing
   test, a weaker expectation, or a skipped/focused test is a gap. Then run
   the Step's e2e Verify command yourself and paste the result; a
   failure is a gap.

Report:
VERDICT: PASS or FAIL
Gaps: anything the task/spec asked for that the code does not do — quote
  the task/spec line and point at the file/line that's missing it. Include
  any doc gap found in step 4 and any test gap found in step 5 here.
Extras: anything the code does that the task did not ask for (flag, don't
  necessarily fail on it alone).

Do not comment on code style or implementation quality — a separate
reviewer covers that. Do not edit any files.
```

**Gate B — Code-quality reviewer:**

```
{{paste the BASELINE block above, filled in, as the first thing in this prompt}}

You are reviewing a just-completed implementation task for correctness and
consistency with this codebase's own patterns — not against the spec (a
separate reviewer covers that). Verify everything from the real files, not
from a summary someone else gives you.

REPO CONVENTIONS
{{the same context packet the implementer received (Step 0 item 7).}}

If anything you need to judge this task is missing from the context above, say so
in your report rather than guessing — the packet gets corrected.

TASK AS IMPLEMENTED (verbatim step text from spec.md Section 8, for context only)
{{full "### Step N" block}}

Do this, in order:
1. Run `git status --short` and `git diff` to see exactly what changed.
2. Read the full content of every changed file — not just the diff hunks.
3. Check for: logic bugs, unhandled edge cases the task implies, type
   issues ESLint/tsc wouldn't catch, inconsistency with this repo's
   existing patterns (naming, layer boundaries — see the table above —
   error handling style), violations of the CLAUDE.md "Never violate"
   rules, accessibility regressions against the design doc's accessibility
   section (if the profile names one), and dead or duplicated code.
4. If the diff touches tests, check each test against the e2e
   conventions in REPO CONVENTIONS: whatever the profile says about
   fixtures, locators and waiting, no test depending on another test's
   state, and no assertion that would still pass if the behaviour under
   test were removed.

Report:
VERDICT: PASS or FAIL
Issues: each one as file:line, what's wrong, and the concrete fix.

Do not comment on whether the task matches the spec — a separate reviewer
covers that. Do not edit any files.
```

### Step 4 — Gate decision

- **Both PASS** (or the single combined gate PASSes, for a one-gate task) → go to Step 5 (commit).
- **One or both FAIL** (or the combined gate FAILs) → dispatch a fresh fix subagent (`general-purpose`, foreground) scoped to only the failing findings:

```
A reviewer found the following issues in a task you're about to fix. Fix
exactly these — do not expand scope, do not touch files this task didn't
already touch unless the fix genuinely requires it, and do NOT run
`git add` or `git commit`.

TASK (original, for context)
{{full "### Step N" block}}

REVIEWER FINDINGS TO FIX
{{verbatim findings from the failing gate(s)}}

Never make an e2e test pass by weakening, skipping or deleting it; if
a finding says a test fails, fix the code, or report that the spec's
Assertion is wrong with the evidence.

Report back: what you changed and why, file by file, and the literal
output of the task's Verify commands after the fix.
```

Then re-run **only the gate(s) that failed** — a fresh subagent again, same prompt template as Step 3. **Exception:** if the fix touches files or logic that the _passing_ gate already reviewed, re-run **both** gates (for a one-gate task, simply re-run the combined gate), since the passing verdict no longer covers the current diff.

This fix-and-re-review cycle is the task's **one allowed retry**. If, after it, either gate still fails, that is the task's 2nd consecutive failure — go to **Escalation**, do not fix-and-re-review a second time.

### Step 5 — Escalation

Attempt counts are tracked for the conversation, not persisted to disk (only completed tasks are persisted — see invariant 4). A "failed attempt" is either: the implementer failing to complete Step 2, or a gate still failing after Step 4's one fix-and-re-review cycle.

If the **same task** produces its 2nd failed attempt in a row: **stop**. Do not dispatch a 3rd attempt. Report to the user:

- The task number and title.
- What was tried both times (implementer summary, gate findings).
- A concrete question: retry with guidance, skip and revisit later, or take it over manually.

If a session restarts mid-task, treat the resumed task as a fresh first attempt — there is no persisted attempt counter to recover.

### Step 6 — Commit (controller only, never a subagent)

Once both gates show `PASS`:

1. `git status --short` — stage only the files this task actually touched (per its `**Files**` manifest, plus any doc the controller updated in Step 2b, and the reviewers' `git diff`), plus `<feature-dir>/spec.md` and `impact.md` if this is the first task of the run and either is still untracked — the spec belongs in git alongside the code it drove. Never `git add -A`/`git add .`. If anything unexpected is staged, unstage and flag it.
2. `git diff --staged` — read it; the commit message must come from the real diff, not the task description.
3. Compose the message in this repo's format (Conventional Commits, per CLAUDE.md § Conventions):

   ```
   <type>(<scope>): <imperative summary, ≤72 chars>

   <2-6 body bullets, one behavior per line, derived from the diff>

   Spec: docs/features/<slug>/spec.md (Step N)
   <attribution trailer, if this session requires one>
   ```

   `<type>` is `feat`/`fix`/`refactor`/`chore` as appropriate; `<scope>` is the feature's slug (its `docs/features/<slug>/` folder name) if the plan is tied to one.

4. Commit via heredoc. Never `--no-verify`, never amend, never force anything.
5. `git log -1 --stat` to confirm the commit landed with the expected files.

### Step 7 — Update persistent state (only after the commit exists)

Do all of these, in order:

1. **`spec.md` is not edited.** It is the design record; a run never ticks or restructures it.
2. **`PROGRESS.md`** — tick this task's line and append the commit hash: `- [x] Task N: ... (abc1234)`. Never stage or commit this file — it is git-ignored run state, redundant with `log.md` and `git log` (per CLAUDE.md's "progress is derived from git log, not a status file"). `PROGRESS.md` in `.gitignore` enforces this mechanically.
3. **`log.md`** — append an entry, append-only, using this shape (records the two gate verdicts and the commit):

```
=====================================================================
Task N: [Layer] — <outcome>
Completed: <date, ISO 8601>
Commit: <hash>

Summary:
  <1-3 sentences on what actually landed>

Key Decisions:
  <every choice a future reader couldn't infer from the code, or "None.">

Deviations:
  <anything that differed from the Step as written, or "None.">

Files Changed:
  - <path> (created|modified|deleted)

Verification:
  <Verify commands run and their real results>
  E2E tests written: <E2E ids added to the feature's spec file, each "failed before, passes after", or "None.">
  Manual checks pending: <E2E ids needing a human and a browser, or "None.">

Review Gate — Spec:    PASS (attempt <n>)
Review Gate — Quality: PASS (attempt <n>)
=====================================================================
```

For a one-gate task, replace the two `Review Gate —` lines with one:

```
Review Gate — Combined: PASS (attempt <n>)
```

If the spec itself turned out to be wrong (an extra file, a superseded step), say so under Deviations with the evidence and leave `spec.md` as written; the fix is a `/feature-spec` revision, not an edit made mid-run. Do not renumber tasks; `log.md` and commit messages reference them by number.

4. **Commit `log.md`.** `git add <feature-dir>/log.md` (never `PROGRESS.md`) and commit as `docs(<slug>): log task N`, `<slug>` being the feature's folder name. This is a separate commit from Step 6's code commit — `log.md`'s entry cites that commit's hash, so it cannot be folded into it. Keeping the decision log in git history (not left untracked) is the point: it's the record future work reads instead of re-deriving.

### Step 8 — Loop or finish

Go back to **Step 1** for the next unchecked task. When `PROGRESS.md` shows every task checked:

## Completion

1. Run the build and the feature's own e2e spec exactly as `.claude/repo-profile.md` § Verification commands lists them (the build, then `npx playwright test e2e/<slug>.spec.ts`) — one after the other, never at once if the profile says they share an output directory. Do **not** run the full e2e suite: this repo's profile deliberately limits the gate to the feature's own spec. A feature's plan is not complete on a failing build or a failing test in its spec file; fix it as a task (fresh implementer, gates, commit) before completing.
2. Append a `Completion` entry to `log.md` (What was built / Deviations from the spec / Follow-ups not in scope / Final verification, with the feature spec's e2e pass counts / Manual checks still pending).
3. Commit it: `git add <feature-dir>/log.md` and commit as `docs(<slug>): mark implementation complete`.
4. Report to the user: total tasks completed, total commits made, the e2e result (the feature spec's tests passed per project or browser), every **manual check still pending** by `E2E-` id (these were never run and must not be reported as passed), and point them at `log.md` for the full history.
