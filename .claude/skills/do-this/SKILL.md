---
name: do-this
description: "Build a feature from docs/features/<slug>/spec.md (Section 8), task by task, with this chat session as the only orchestrator and every worker a Sonnet leaf subagent that is handed paths, not pasted text. Per task: a script writes the step packet, a test author writes the failing tests, an implementer makes them pass, the mechanical gate (`npm run check:task`) checks the result, a risk reviewer reviews only a task the spec marks high risk, and the orchestrator commits. One feature review runs at the end. The run is autonomous: a blocked task is resolved by an automatic spec revision, and the user is asked only when that fails. Use when asked to run, execute or implement a feature's spec. State is kept in PROGRESS.md and log.md, so a dead session resumes with the same command. Does not write specs (see spec-this)."
---

# /do-this

Build one feature from Section 8 of `docs/features/<slug>/spec.md`. Each `### Step N` block is one task (Task N = Step N). **This session is the orchestrator.** It runs scripts, dispatches workers, commits and writes state. It does not write production code or tests, and it does not read the spec.

## Usage

```
/do-this <slug>            # run every unticked task of docs/features/<slug>/spec.md, then Completion
/do-this <slug> restart    # discard PROGRESS.md (log.md stays) and begin again at Task 1
```

The run goes on, without asking, until the feature is complete or a stop condition holds. If the session dies, run the same command: `PROGRESS.md` says where to resume.

## Why it is shaped this way

A subagent cannot spawn a subagent, so every worker is dispatched from here and is a leaf. The cost of that is the orchestrator's context, which is re-sent on every turn for the whole feature. Three rules keep it small:

1. **Pass paths, never text.** A dispatch message is a few lines: slug, step number, the packet path, the mode. The worker's brief is its agent definition; the spec content is the packet. Never paste a Step, a diff, a convention block or a report into a prompt.
2. **Never read what a worker reads.** Do not open `spec.md`, the packet, a test file, a source file or a diff. The one exception is the spec's headings, once (Step 0).
3. **Send long output to a file and read its end.** Gate runs, the Completion suite and worker findings go to `.run-logs/<slug>/` (git-ignored). Read the verdict lines, not the log.

## Checks, and why there are only these

| Check | When | What it is |
| --- | --- | --- |
| Locked tests | every task that has `E2E-` rows | written before the code, by a different worker, and staged so they cannot be edited |
| Mechanical gate | every task | a script: typecheck, lint, build, tests, the file manifest, the repo rules |
| Risk review | only a task whose Step says `Risk: high`, or one that escalated | one read-only reviewer, before the commit |
| Feature review | once, after the last task, the build and the feature's own spec | one read-only reviewer over the whole feature's diff |

There is no per-phase review and no diff read by the orchestrator. [`.claude/repo-profile.md`](../../repo-profile.md) § Gate risk tiers owns the tier rule.

## Workers

Agent definitions in [`.claude/agents/`](../../agents/); every one is Sonnet.

| Agent | Does | Is given |
| --- | --- | --- |
| `pipeline-test-author` | Writes the task's failing tests | the packet path |
| `pipeline-implementer` | Makes them pass (`MODE: implement`), or fixes named findings (`MODE: fix`) | the packet path; a findings path in fix mode |
| `pipeline-risk-reviewer` | Reviews a high-tier task's diff, read-only | the packet path, the gate output path |
| `pipeline-feature-reviewer` | Reviews the finished feature, read-only | the base commit and the Completion output path |
| `pipeline-spec-writer` | Revises the spec when a task is blocked on it | the story path and the question |

Every dispatch is a foreground `Agent` call with `subagent_type` set to the agent's name and `model: "sonnet"` (the agent definitions say it too; never raise it). One at a time: two workers never write the same tree at once.

## Invariants

1. **One task in flight.** Within a task the stages run in order: packet, tests, implementation, gate, review if the tier requires it, commit.
2. **A fresh worker per dispatch.** No worker is told what another concluded, except through a findings file in fix mode or a failed attempt's report.
3. **The orchestrator commits, never a worker.** Only after `MECH: PASS` and, for a high-tier task, a reviewer `PASS`.
4. **The tier is computed, not judged.** `npm run check:task` prints it. The orchestrator may raise it and never lowers it.
5. **Tests are locked before the implementer starts.** The orchestrator stages them; the gate fails if a staged test was edited afterwards.
6. **State is written only after the commit exists.** `PROGRESS.md` (git-ignored) and `log.md` (committed) live in the feature folder.
7. **Decisions are made, recorded and carried on from.** An implementation choice is the implementer's. A product question goes to the spec writer, which decides it and records it as `[auto]`. The user is asked only at a stop condition.
8. **Never on a protected branch.** If the current branch is `develop`, `main` or `master`, create `feat/<slug>` and work there. `scripts/guard-bash.sh` refuses a commit to a protected branch anyway.

## Step 0 — Setup (once per run)

1. **Branch and tree.** Not a protected branch (invariant 8). `git status --short` must show no tracked file modified, apart from the paths in [`.claude/repo-profile.md`](../../repo-profile.md) § Known-dirty paths. If the dirt is the interrupted work of the task `PROGRESS.md` shows as next (its staged tests, half-written code), discard it and restart that task. Any other dirt: stop and list the files.
2. **Environment.** Dependencies are installed (`npm ci`) and a Chromium is available for Playwright. Run `npx next typegen` if the repo's typecheck needs generated Next types; without them `npm run typecheck` can fail for a reason no task caused.
3. **The plan, from headings only.** `grep -nE '^(## Phase|### Step [0-9]+)' docs/features/<slug>/spec.md`. That is all the orchestrator reads of the spec. No Section 8 means a thin spec: see **Thin specs**. No `spec.md`: stop and offer `/spec-this`.
4. **`PROGRESS.md`.** If it exists, it is the source of truth for what is done. With `restart`, delete it first and say so. Otherwise create it from the headings:

   ```markdown
   # do-this Progress — <slug>

   Base: <git rev-parse HEAD before Task 1>

   - [ ] Task 1: <Step title>
   - [ ] Task 2: <Step title>
   - [ ] Task 3: <Step title>
   - [ ] Feature review
   ```

5. **`log.md`.** Create it empty if missing; otherwise append below what is there.
6. **Consistency.** If a task is already ticked, check that the last ticked line's commit exists (`git log --oneline -1 <hash>`) and that `log.md` has its entry. If they disagree, stop and say what is inconsistent.

Then take the first unticked line of `PROGRESS.md`: a task runs Steps 1–6; `Feature review` means **Completion**.

## The task loop

### Step 1 — Packet

`npm run step:packet -- <slug> <N>`. Its last line is `PACKET: <path> (<lines> lines, E2E rows: <n>)`. Keep the path and the row count; do not open the file. `PACKET: FAIL` stops the run.

### Step 2 — Tests

Skip when the packet reports `E2E rows: 0`.

Dispatch `pipeline-test-author`:

```
Slug: <slug>   Step: <N>
Packet: .run-logs/<slug>/step-<N>.md
```

- `DONE` → stage the test files by explicit path (`git add <path>…`). They are now locked. If its report lists tests under "Passed before the change", carry on and add `test-passed-before-change` to the gate's `--escalate`: such a test guards against regression but proves nothing about this task, so the task gets a reviewer.
- `BLOCKED` → a row cannot be written as stated. Run **Auto-revision** with its `Blocked on:` line, then start the task again from Step 1.

### Step 3 — Implementation

Dispatch `pipeline-implementer`:

```
Slug: <slug>   Step: <N>
Packet: .run-logs/<slug>/step-<N>.md
MODE: implement
```

Branch on the first line of its report:

- **`DONE`** → Step 4. Keep its `Decisions:` and `Deviations:` lines for the log. A non-empty `Deviations:` adds `implementer-deviation` to `--escalate`.
- **`BLOCKED`**, or a non-empty `Stop-if:` → the spec is wrong or silent on something that is not the implementer's to decide. Run **Auto-revision** with its `Question:` or `Stop-if:` line, then start the task again from Step 1. This is not a failed attempt.
- **`FAILED`** → a failed attempt. See **Attempts**.

### Step 4 — Docs, then the mechanical gate

**Docs first.** If the implementer's `Files:` line shows one of these, update the named section now, reading only that section, so the edit is inside the diff that is gated:

| The task | Update |
| --- | --- |
| Adds, moves or deletes a path `CLAUDE.md` § Layout shows, or adds a module, route or endpoint | `CLAUDE.md` § Layout |
| Adds, removes or upgrades a runtime dependency | `CLAUDE.md` header line |
| Adds a persisted key, an action or endpoint, or changes a domain rule | `CLAUDE.md` § Domain facts |
| Adds a component or changes a documented variant, prop or token | `Reference.md`, the section on the token or component |
| Changes a path or rule the profile names | `.claude/repo-profile.md`, that section |

A task that touches none of these leaves the docs alone.



**Then the gate**, with its output in a file:

```
npm run check:task -- <slug> <N> [--escalate <reasons>] > .run-logs/<slug>/gate-<N>.txt 2>&1
grep -E '^(FAIL|WARN)' .run-logs/<slug>/gate-<N>.txt; tail -n 3 .run-logs/<slug>/gate-<N>.txt
```

`--escalate` carries the triggers the script cannot see, comma-separated: `implementer-deviation`, `attempt-2`, `test-passed-before-change`, `uncleared-warning`. Never set `CHECK_SKIP_RUN`.

- **`MECH: PASS`** → clear each `WARN`: a doc warning by the doc edit above, any other by a one-line answer for the log. One you cannot answer makes the task high tier (run the gate again with `--escalate uncleared-warning`). Go to Step 5.
- **`MECH: FAIL`** → dispatch `pipeline-implementer` in `MODE: fix` with `Findings: .run-logs/<slug>/gate-<N>.txt`, then run the gate again. A second `MECH: FAIL` fails the attempt. A `FAIL LOCKED` line (a locked test was edited) fails the attempt at once: restore the test with `git checkout -- <file>`.

### Step 5 — Risk review, only when `TIER: high`

`TIER: low` → go straight to Step 6. The mechanical gate has passed and the feature review will read this diff.

`TIER: high` → dispatch `pipeline-risk-reviewer`:

```
Slug: <slug>   Step: <N>
Packet: .run-logs/<slug>/step-<N>.md
Gate output: .run-logs/<slug>/gate-<N>.txt
Unrelated uncommitted paths: <the known-dirty list, or none>
```

- **`PASS`** → Step 6. Its `note` findings are logged, not fixed.
- **`FAIL`** → write its report to `.run-logs/<slug>/review-<N>.md`, dispatch `pipeline-implementer` in `MODE: fix` with that path, run the gate again, then dispatch a fresh `pipeline-risk-reviewer`. If it fails again, the attempt has failed. No second fix-and-re-review cycle.

### Step 6 — Commit and state

1. `git status --short`. Stage by explicit path: the files in the implementer's `Files:` line, and the docs you edited. The tests are already staged. Never `git add -A` or `git add .`.
2. `git diff --staged --stat`. A path that is in neither list: unstage it and stop.
3. Commit with a heredoc, Conventional Commits:

   ```
   <feat|fix|refactor|chore>(<slug>): <imperative summary, at most 72 characters>

   <2–6 bullets, one behaviour per line>

   Spec: docs/features/<slug>/spec.md (Step N)
   ```

   Never `--no-verify`, never amend.
4. Tick the task in `PROGRESS.md` with the commit hash: `- [x] Task N: <title> (abc1234)`. Never stage this file.
5. Append to `log.md`, then `git add docs/features/<slug>/log.md` and commit as `docs(<slug>): log task N`:

   ```
   =====================================================================
   Task N — <Step title>
   Completed: <ISO date>      Commit: <hash>

   Summary: <1–3 sentences on what landed>
   Decisions: <the implementer's Decisions line, or "None.">
   Deviations: <the implementer's Deviations line, or "None.">
   Files changed: <path (created|modified|deleted)>, …
   E2E tests written: <ids, or "None.">      Passed before the change: <ids, or "None.">
   Manual checks pending: <E2E ids, or "None.">

   Attempts: <1 | 2>
   Auto-revisions: <the question and the spec commit that settled it, or "None.">
   Mechanical gate: PASS (warnings: <each, and how cleared> | none)
   Tier: high (<reason>) | low
   Review: risk reviewer PASS (review <n>) | none (low tier)
   Findings: <class> | <blocking|note> | <fixed|logged> | <one line>     (one per finding, or "None.")
   =====================================================================
   ```

Then go on to the next unticked line. Say one line to the user per finished task (number, title, hash, tier) and nothing more.

## Auto-revision

A task is blocked on something the spec does not settle, or settles wrongly. Do not answer it yourself (you have not read the spec) and do not ask the user. Hand it to the spec writer, which decides it by its own rules and records the decision where every later worker will read it.

1. Count the revisions so far: `git log --oneline --grep="^docs(<slug>): revise the spec after a blocked task" | wc -l`. **Two already** → stop (see **Stop conditions**).
2. Discard the task's uncommitted work: restore changed tracked files with `git checkout -- <file>`, delete files it created, and unstage and delete the task's new tests (`git restore --staged <test>`; restore a pre-existing test file with `git checkout HEAD -- <test>`).
3. Write the worker's line to `.run-logs/<slug>/blocked-<N>.md` and dispatch `pipeline-spec-writer`:

   ```
   Story: docs/features/<slug>/story.md
   MODE: revise
   Ruling: /do-this is blocked on Step <N>. Read .run-logs/<slug>/blocked-<N>.md, decide it under "Decide, do not ask", record it as an [auto] Decision, and amend Step <N> and any later Step it changes. Do not renumber a Step or touch one that is already committed (Steps 1 to <N-1>).
   ```

4. `STATUS: DONE` → `git add docs/features/<slug>/spec.md docs/features/<slug>/impact.md` and commit as `docs(<slug>): revise the spec after a blocked task`. Start the task again from Step 1, so the packet carries the decision.
5. `STATUS: BLOCKED` → the writer hit one of its own stop conditions. Stop.

## Attempts

One **attempt** is: the implementer, the gate with at most one fix, and for a high-tier task the review with at most one fix-and-re-review cycle. It fails when the implementer reports `FAILED`, a locked test was edited, the gate fails a second time, or the reviewer fails a second time.

1. **Attempt 1 fails** → write the failure (the implementer's report, the gate's `FAIL` lines, the reviewer's findings) to `.run-logs/<slug>/attempt-<N>-1.md`. Discard the work: restore changed tracked files with `git checkout -- <file>` and delete the files it created, leaving only the staged tests.
2. **Attempt 2** → dispatch a fresh `pipeline-implementer` in `MODE: implement` with `PREVIOUS ATTEMPT: .run-logs/<slug>/attempt-<N>-1.md`. The task is high tier from here (`--escalate attempt-2`).
3. **Attempt 2 fails** → stop.

The attempt count is the number of `attempt-<N>-*.md` files, so it survives a restarted session.

## Completion

1. Run the build, then the feature's own spec only (never the full suite: `.claude/repo-profile.md` § Verification commands), with the output in a file:

   ```
   npm run -s verify -- --log .run-logs/<slug>/completion-raw.log "npm run build && npx playwright test e2e/<slug>.spec.ts" > .run-logs/<slug>/completion.txt 2>&1
   grep -E '^(EXIT|\[)' .run-logs/<slug>/completion.txt
   ```

   `completion.txt` is a digest of at most 90 lines (the counts, then each failure's `file:line`, title and first error lines, and a `LOG` line); the whole output is in `completion-raw.log`. Read the `EXIT` and `[...]` lines for the verdict, never the raw log.

   A failing test in the feature's own spec is fixed before going on: dispatch `pipeline-implementer` in `MODE: fix` with `Findings: .run-logs/<slug>/completion.txt` and the packet of the last task, run the checks (`npm run -s verify -- npm run typecheck`, and the same for `lint:new` and `build`), commit as `fix(<slug>): <what regressed>`, and run the build and the feature's spec again. Still failing after one fix: stop.
2. **Feature review.** Dispatch `pipeline-feature-reviewer`:

   ```
   Slug: <slug>
   Base commit: <the Base line of PROGRESS.md>
   Completion run: .run-logs/<slug>/completion.txt
   ```

   - **`PASS`** → tick `Feature review` in `PROGRESS.md`.
   - **`FAIL`** → write the report to `.run-logs/<slug>/feature-review.md`, dispatch `pipeline-implementer` in `MODE: fix` with that path (and the packet of the task each finding names), run the checks, commit as `fix(<slug>): <the finding fixed>`, and run the feature review once more. A second `FAIL` stops the run.
3. Append a `Completion` entry to `log.md`: what was built; deviations from the spec; the `[auto]` decisions made during the run (`grep -c '\[auto\]' docs/features/<slug>/spec.md`, and the ones added by an auto-revision); the feature review's verdict and its findings, one line each in the `Findings:` shape; final verification with the pass counts; manual checks still pending; follow-ups not in scope.
4. `git add docs/features/<slug>/log.md` and commit as `docs(<slug>): mark implementation complete`.
5. Report: tasks and commits, every auto-revision and what it decided, every second attempt, the feature review verdict, the e2e result, and every **manual check still pending** by `E2E-` id. Those were never run and must not be reported as passed.

## Stop conditions

These are the only reasons to stop and ask the user:

- attempt 2 of a task failed;
- two auto-revisions have already been used on this feature, or the spec writer reported `BLOCKED` (the story conflicts with a standing rule, needs a new dependency or secret, is ambiguous about stored data or permissions, or lacks a scenario);
- the Completion run (build and the feature's spec) still fails after one fix, or the feature review failed twice;
- the tree is dirty with files no task owns, the state files disagree with `git log`.

Say which task, what was observed (quote the worker's line or the `FAIL` lines), and the options with your recommendation. Leave the tree and the staged tests as they are. When the user's answer changes what is built, send it through `/spec-this <slug> revise` before resuming, so it is in the spec the workers read.

## Thin specs

A thin spec has no Section 8, so there is no packet and no `check:task` run for it. It is short by definition: give each worker the path of `spec.md` in place of the packet and the number of the item in its **Implementation order** list, run `npm run -s verify -- npm run typecheck`, and the same for `lint`, `build` and `test`, yourself in place of the gate (read each digest, not its log), skip the risk review, and run the feature review at the end as usual.
