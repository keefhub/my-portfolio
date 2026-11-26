---
name: run-this
description: "Run one or more vetted feature stories from story.md to a pull request, with this chat session as the orchestrator: spec stage (/spec-this), build stage (/do-this), push, then one pull request into develop. Each stage hands the next one a path, never pasted content, and every worker is a leaf subagent of this session. The next stage is chosen from what is on disk, so the same command resumes a stopped run. Use when asked to run the pipeline, take a story to done, or continue after /help-discover-this."
---

# /run-this

Takes a feature from a vetted `story.md` to an open pull request. It replaces the old shell runner: the orchestrator is this chat session, not a script that starts headless sessions.

```
/run-this <slug> [<slug> …]          # run, or resume, the named features in order
/run-this <slug> local               # the same, but never push and never open a pull request
```

Discovery is not part of it. [`/help-discover-this`](../help-discover-this/SKILL.md) is interactive and is the only way a `story.md` gets written; when it finishes a story, it offers to continue here.

## What is handed from stage to stage

Only paths and one-line verdicts. This session never reads a story, a spec, a packet or a source file; the workers do, in their own context.

| Stage | Runs | Is handed | Hands on |
| --- | --- | --- | --- |
| Discovery | `/help-discover-this` (you, interactive) | a requirement | `docs/features/<slug>/story.md` |
| Spec | [`/spec-this`](../spec-this/SKILL.md) | the story path | `docs/features/<slug>/spec.md`, `impact.md` |
| Build | [`/do-this`](../do-this/SKILL.md) | the slug (the spec's headings, then one step packet per task) | commits, `log.md` |
| Pull request | this skill | the slugs | the pull request URL |

## Before the first stage

1. `git branch --show-current` must not be `develop`, `main` or `master`. If it is, create `feat/<slug>` (the first slug) with `git checkout -b` and work there. Do not ask.
2. `node_modules` is installed (`npm ci`) and Playwright's Chromium is available.
3. `git status --short`. A new, uncommitted story is expected: commit `docs/features/<slug>/story.md`, `docs/features/OVERVIEW.md` and `CLAUDE.md` (those paths only, and only if changed) as `docs(<slug>): add the story and index it`. Any other dirty tracked file: stop and list it.

## The loop, per slug

Choose the stage from the disk, never from memory:

| On disk | Do |
| --- | --- |
| no `story.md` | Stop. Offer `/help-discover-this <slug>`. |
| `story.md`, no `spec.md` | Follow [`/spec-this`](../spec-this/SKILL.md) for this slug. |
| `spec.md`, no `docs(<slug>): mark implementation complete` commit | Follow [`/do-this`](../do-this/SKILL.md) for this slug. |
| that commit exists (`git log --oneline --grep="^docs(<slug>): mark implementation complete"`) | Next slug. |

Read the skill file of a stage when you reach it, not before. After each stage, and after each feature completes, push with a plain `git push -u origin HEAD` unless the run is `local`. Never force. A rejected push is reported and not retried: the remote has commits this branch lacks, and that is the user's to reconcile.

## It runs without you

The run is meant to go from a vetted story to a pull request with nobody answering questions. Each stage decides what it can and records the decision where it can be audited:

- the spec writer settles open questions itself and tags each one `[auto]` in the spec's Decisions;
- an implementer makes implementation choices and reports them in `log.md`;
- a task blocked on the spec triggers an automatic spec revision, at most twice per feature.

A stage stops only on its own stop conditions (its skill lists them): the story cannot be specified without a new dependency, a secret, or a ruling on stored data or permissions; a task failed twice; the feature review failed twice. Then ask the user in the chat, with the options and your recommendation. When the answer changes what is built, send it through `/spec-this <slug> revise` before resuming, so it is in the spec the workers read. Then carry on from the table above.

Do not stop to report progress, to confirm a stage, or to ask whether to continue to the next slug.

## Pull request

When every slug is complete and the run is not `local`:

1. If a pull request for this branch exists (`gh pr list --head <branch>`), report its URL and stop. Never open a second one.
2. Title: `feat(<slug>): <story title>` for one slug, `feat: <slug>, <slug>` for several. The story title is the first heading of `story.md` (`head -n 1`).
3. Body, from each feature's `Completion` entry in `log.md` (read only that entry: `sed -n '/Completion/,$p'`): Summary; Verification (the e2e pass counts and the build result); Deviations from the spec; Decisions made without a human (`grep -n '\[auto\]' docs/features/<slug>/spec.md`), listed one per line so the reviewer of the pull request can audit them, and any a human made (`[human]`); Manual checks still pending, stated plainly as never run; Follow-ups. No secret, environment value or internal URL.
4. `gh pr create --base develop --head <branch>`. The base is always `develop`; `scripts/guard-bash.sh` refuses any other.
5. Never merge, approve or close a pull request. A human merges.

## Report

Per feature, one line when it completes. At the end: the pull request URL, the `[auto]` decisions by feature, any question that was put to the user and its answer, and every manual check still pending by `E2E-` id.
