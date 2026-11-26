---
name: agentic-run
description: "Run the stories that /agentic-discover wrote, from spec to one pull request, with nobody answering questions: every slice is specced (/spec-this) and built (/do-this) in order on one feature branch, the intent file's pre-approved decisions answer the stops that would normally ask the user, a stop nothing pre-approves ends in a draft pull request carrying the failure digest and what is left, the intent's definition of done is checked at the end (/agentic-accept), and one pull request into develop is opened with a section per slice. Never merges. Resumes from what is on disk when run again. Use when asked to run, build or continue an autonomous goal after /agentic-discover, including in a cloud session."
---

# /agentic-run

The autonomous counterpart of [`/run-this`](../run-this/SKILL.md). It reuses `/spec-this` and `/do-this` unchanged, one slice after another on **one feature branch**, and differs from `/run-this` in three ways: it takes its slices from the decomposition, it never asks the user (a stop becomes a draft pull request), and it checks the intent's definition of done after the last slice.

```
/agentic-run <slug>            # <slug> = the intent file's slug; run, or resume, every runnable slice in order
/agentic-run <slug> local      # the same, but never push and never open a pull request
```

```
docs/requirements/<slug>.md  (Run order)
  -> per slice: /spec-this -> /do-this        one branch, commits grouped by slice
  -> /agentic-accept <slug>                   the intent's definition of done, once
  -> one pull request into develop            ready if all green, draft if anything stopped
```

## Hard rules

1. **Never ask the user.** There may be nobody to answer. A stop is resolved by the intent's pre-approved decisions (step 3 below) or ends the run in a draft pull request.
2. **One branch, one pull request.** No per-slice branches, no stacked pull requests, no waiting for a merge between slices. The branch is a feature branch; on `develop`, `main` or `master`, create `feat/<slug>` first.
3. **Pre-approved decisions are the whole safety boundary.** Only what intent §4 lists may be treated as a `[human]` ruling. Nothing else is ever approved on the user's behalf: no new dependency, environment variable name, external service or guessed choice beyond it.
4. **Never write a secret.** Environment variable values, keys and tokens are the user's; intent §7 lists them as human-only. Never read or edit `.env`, never set any environment variable for the site: it has none.md § Never violate permits.
5. **Never merge, approve or close a pull request.** Never force push, to any branch. Never `git add -A`, `.` or `commit -a`.
6. **This session is the only orchestrator.** It reads no story, spec, packet or source file; it hands paths. Every worker is a leaf subagent of the stage skill it runs.
7. **Do not stop to report progress, confirm a stage or ask whether to continue.**

## Before the first stage

1. Branch as in rule 2. `docs/requirements/<slug>-intent.md` must exist with `Status: ready`, and `docs/requirements/<slug>.md` must exist. If not: stop and offer `/agentic-intent <slug>` or `/agentic-discover <slug>`.
2. `node_modules` is installed (`npm ci`) and Playwright's Chromium is available. If not, run `npm ci` once; if that fails, stop (step 3, with nothing built yet).
3. `git status --short`: only files this run produced are acceptable. Any other dirty tracked file: stop and list it.
4. **The runnable list** is `Run order` in the decomposition: slices with status `written`, in order. A `BLOCKED` slice, and every slice that depends on one, is skipped and listed in the pull request. If the list is empty, stop.

## The loop, per slice

Choose the stage from the disk, never from memory, exactly as `/run-this` does:

| On disk | Do |
| --- | --- |
| no `story.md` | The decomposition is stale. Stop and offer `/agentic-discover <slug>`. |
| `story.md`, no `spec.md` | Follow [`/spec-this`](../spec-this/SKILL.md) for this slice, with the rulings below. |
| `spec.md`, no `docs(<slice>): mark implementation complete` commit | Follow [`/do-this`](../do-this/SKILL.md) for this slice. |
| that commit exists | Next slice. |

Read a stage's skill file when you reach it, not before. After each stage and each completed slice, push with a plain `git push -u origin HEAD` unless the run is `local`. A rejected push is not retried: end the run (step 3) and say the remote has commits this branch lacks.

**Rulings handed to `/spec-this`.** In the invocation text for a slice, name the intent path and say: "Intent §4 approves exactly these, record each as `[human: intent §4]` and treat it as settled: <the slice's `Needs` from the decomposition>. Intent §5 hard constraints and §3 non-goals bind the spec. Everything else the story cannot settle is yours to decide as `[auto]`." A slice with no `Needs` gets no ruling line.

## A stop is never a question

`/spec-this` and `/do-this` list their stop conditions. When one hits, in this order:

1. **Is the answer in the intent?** If the stop is a dependency, environment variable name, external service or choice that intent §4 approves, or a decision a hard constraint or non-goal settles, send the answer through `/spec-this <slice> revise` naming the intent line as a `[human: intent §N]` ruling, then resume the loop. Count it toward the spec's two automatic revisions as `/do-this` does.
2. **Otherwise the run ends here, as a draft pull request.** Do not guess, loosen a test, skip a check or retry past the stage's own limit (a task failed twice, two revisions used up, the feature review failed twice, a rejected push, a missing human-only item).

   - Push the branch (plain `git push`, unless `local`).
   - Write the stop into `.run-logs/<slug>/stop.md`: the slice, the stage, the stop condition, the path of the failing digest (`.run-logs/…`), and the slices still pending.
   - Open the pull request as a **draft** (see Pull request below) with that stop at the top of the body.
   - Print the same, and end the session's work. Re-running `/agentic-run <slug>` resumes from the disk once the user has fixed the cause, and finishes the same pull request.

## Acceptance

After the last runnable slice completes, follow [`/agentic-accept`](../agentic-accept/SKILL.md) for `<slug>`: it turns the intent's definition of done and hard constraints into end-to-end tests and runs them. If that skill is not installed, record "intent acceptance not run" in the pull request and open it as a draft. A failing acceptance is a stop: it ends the run as a draft pull request, with the failing outcome named.

## Pull request

When every runnable slice is complete and acceptance passed (or the run stopped, as a draft) and the run is not `local`:

1. If a pull request for this branch exists (`gh pr list --head <branch>`), update it with `gh pr edit` (body, and `gh pr ready` once the run is complete and green) and report its URL. Never open a second one.
2. Title: `feat(<slice>): <story title>` for one slice, `feat(<slug>): <goal name>` for several. The goal name is the first heading of the intent file.
3. Body, with one section per slice in `Run order`, each from that slice's `Completion` entry in `log.md` (read only that entry: `sed -n '/Completion/,$p'`):
   - **Stop** (only if the run stopped): the contents of `.run-logs/<slug>/stop.md`, first.
   - **Summary** of the goal, from the intent.
   - **Per slice:** summary; verification (the e2e pass counts and the build result); deviations from the spec; the decisions made without a human (`grep -n '\[auto\]' docs/features/<slice>/spec.md` and the story's Assumptions, one per line, so the reviewer can audit them), and those the intent made (`[human: intent §N]`).
   - **Intent acceptance:** from `docs/requirements/<slug>-acceptance.md` (on a failed acceptance, from `.run-logs/<slug>/acceptance-failures.md`): which definition-of-done lines and hard constraints passed by test id, which are `manual` and why, and any that did not pass.
   - **Skipped slices:** each BLOCKED slice and what it needs.
   - **Human-only items:** intent §7, verbatim, as never done by the agent.
   - **Manual checks still pending**, by `E2E-` id, stated plainly as never run.
   - **Open findings** from the decomposition, and follow-ups. No secret, environment value or internal URL.
4. `gh pr create --base develop --head <branch>`, with `--draft` unless the run is complete and acceptance passed. The base is always `develop`; `scripts/guard-bash.sh` refuses any other.
5. After opening it, if the `ccd_pr` tools exist: `get_status`, and `bind_pr` if it does not report this pull request. Never schedule or poll CI yourself; never enable auto-merge.
6. Never merge, approve or close it. A human merges.

## Report

Per slice, one line when it completes. At the end: the pull request URL and whether it is draft, the `[auto]` decisions by slice, the BLOCKED slices and what each needs, any stop, the human-only items, and every manual check still pending by `E2E-` id. Nothing else.

## Red flags — stop

- Asking the user anything, or waiting for an answer
- Approving something intent §4 does not list
- A second branch, a stacked or second pull request, or opening against a base other than `develop`
- Loosening, skipping or deleting a test or check to get past a stop
- Reading a story, spec or source file in this session
- Setting a secret, touching `.env`, or any force push
- Marking the pull request ready while a stop, a failed acceptance or an unrun acceptance stands
