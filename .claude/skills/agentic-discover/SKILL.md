---
name: agentic-discover
description: "Turn a ready intent file (docs/requirements/<slug>-intent.md, from /agentic-intent) into an ordered set of vetted feature stories with no questions to the user: a decomposer subagent splits the goal into right-sized slices, one author subagent per slice sweeps the edge-case taxonomy and writes docs/features/<slice>/story.md, one reviewer checks that every definition-of-done line and hard constraint is covered, and the stories are indexed and committed. Every question the interactive /help-discover-this would ask is decided by the agent and tagged [auto]; anything the intent already rules is tagged [human]. Use when asked to discover, split or write stories for an autonomous run, or after /agentic-intent. Does not write code and does not spec or build (agentic-run does)."
---

# /agentic-discover

The autonomous counterpart of [`/help-discover-this`](../help-discover-this/SKILL.md): same outputs (a decomposition document and one `story.md` per slice, indexed in `OVERVIEW.md` and the `CLAUDE.md` order table), but the user is not asked anything. The intent file is the user's whole input. This session is only the orchestrator; every worker is a leaf subagent handed a path.

```
/agentic-discover <slug>        # <slug> = the intent file's slug; discover, or resume, the whole goal
```

```
docs/requirements/<slug>-intent.md
  -> decomposer        -> docs/requirements/<slug>.md          (slices, trace, order, decisions)
  -> author, per slice -> docs/features/<slice>/story.md       (one fresh subagent each, in order)
  -> reviewer          -> .run-logs/<slug>/discover-review.md  (coverage of the intent, once)
  -> commit            -> /agentic-run <slug>
```

## Hard rules

1. **No code, no dependency, no `.env`, no `AGENTS.md`.** The deliverable is documents. Never `git add -A`, `.`, or `commit -a`; stage explicit paths.
2. **Never ask the user to decide.** Where `/help-discover-this` would ask, the worker takes the simple option for this app (CLAUDE.md § Domain facts: a family business, two to three people, ceiling ten; no design for heavy concurrency, large data sets, multi-tenancy, SSO or compliance-grade audit), writes the decision down, and tags it `[auto]`. A decision the intent file already makes is tagged `[human: intent §N]` and is never overridden.
3. **The intent is the ceiling and the floor.** Every slice cites the intent line it serves and nothing is built that no line asks for; every definition-of-done line and every hard constraint is covered by at least one scenario. Non-goals are never built, even partly.
4. **Pre-approved decisions are the whole safety boundary.** A slice that needs a new dependency, environment variable name, external service or any other choice that intent §4 does not approve is **BLOCKED**: recorded in the decomposition document with what it needs, its story is not written, and so is no story that depends on it. Never approve it on the intent's behalf.
5. **A conflict with `OVERVIEW.md` §2 or §3, or with the intent's own hard constraints, stops the run.** Write what was found into the decomposition document, commit nothing else, and report. Standing context is never overridden silently.
6. **Business language only in scenarios**, as in `/help-discover-this` (no component, hook, file path, library, class, table, column or storage key in a step).
7. **Workers are handed paths, never pasted text,** and this session never reads a story. It reads only the one-line verdicts the workers return. Every worker is Sonnet (`model: "sonnet"`).
8. **One author per slice, never two slices in one context.** Authors run one after another, because they append to the same index files.
9. **Protected branches** (`develop`, `main`, `master`): never commit to them. On one, create `feat/<slug>` first.

## Procedure

### 0. Preflight

1. Read `docs/requirements/<slug>-intent.md`'s header only. If it is missing, or its `Status` is not `ready`, stop and offer `/agentic-intent <slug>` (or `edit`).
2. `git branch --show-current` must not be protected; if it is, `git checkout -b feat/<slug>`.
3. `git status --short`. Only the intent file (new or changed) and files this skill itself produced are acceptable. Any other dirty tracked file: stop and list it.
4. **Resume.** What is on disk decides where to start, never memory. If `docs/requirements/<slug>.md` exists, its `Run order` lists the slices; a slice with a `story.md` is done, and a slice marked BLOCKED is skipped. Continue from the first slice with neither.

### 1. Decompose (skip if the decomposition document exists)

Dispatch one subagent (`general-purpose`, `model: "sonnet"`) with this prompt shape and nothing pasted:

> Follow `.claude/skills/agentic-discover/references/decomposer.md`. Intent file: `docs/requirements/<slug>-intent.md`. Write `docs/requirements/<slug>.md` using `.claude/skills/agentic-discover/references/requirements-template.md`. Reply with one line: `DONE <n> slices, <b> blocked` or `STOP <reason>`.

On `STOP`, go to Report with the reason. On `DONE`, continue.

### 2. Author the stories

For each slice in `Run order`, in order, skipping BLOCKED slices and slices whose dependency is BLOCKED, dispatch one **fresh** subagent (`general-purpose`, `model: "sonnet"`):

> Follow `.claude/skills/agentic-discover/references/slice-author.md`. Intent: `docs/requirements/<slug>-intent.md`. Decomposition: `docs/requirements/<slug>.md`. Your slice: `<slice-slug>`. Write only `docs/features/<slice-slug>/story.md` and the three index edits. Reply with one line: `DONE <n> scenarios` or `BLOCKED <what is needed>` or `STOP <reason>`.

- `BLOCKED`: the worker has recorded it; mark the slice BLOCKED in the decomposition document's `Run order` and skip what depends on it.
- `STOP`: go to Report.
- Anything else, or a story file that is missing afterwards: one retry with a fresh subagent; a second failure stops the run.

### 3. Review once

Dispatch one read-only subagent (`general-purpose`, `model: "sonnet"`):

> Follow `.claude/skills/agentic-discover/references/coverage-review.md`. Intent: `docs/requirements/<slug>-intent.md`. Decomposition: `docs/requirements/<slug>.md`. Write your report to `.run-logs/<slug>/discover-review.md`. Edit nothing else. Reply with one line: `PASS` or `FINDINGS <n blocking>`.

On `FINDINGS`, hand the report path to a fresh author subagent per affected slice (the report names them), once. The authors fix only the named findings. Do not review again; record any finding still open under `Open findings` in the decomposition document (the author or this session appends them), so the pull request carries them.

### 4. Commit

Stage explicit paths only: the intent file if changed, `docs/requirements/<slug>.md`, each `docs/features/<slice>/story.md`, `docs/features/OVERVIEW.md`, `CLAUDE.md` (the order table, if changed). Commit as `docs(<slug>): add the stories and index them`. Push with a plain `git push` only if the session was started to push (the user or the brief said so); otherwise leave that to `/agentic-run`.

### 5. Report

Print at most:

- the ordered runnable slugs, the BLOCKED ones with what each needs, and any open findings;
- the count of `[auto]` decisions (`grep -rn '\[auto\]' docs/features/ docs/requirements/<slug>.md`);
- the next command: `/agentic-run <slug>`.

A run with every slice BLOCKED, or a `STOP`, has nothing to run: say so and what the user must change in the intent file.

## Red flags — stop

- Asking the user a question
- Writing a story for a BLOCKED slice, or approving a dependency, variable or service the intent did not
- A slice with no intent citation, or a definition-of-done line or hard constraint no scenario covers
- Two slices authored in one subagent, or two authors running at once
- This session opening a story or a source file
- A scenario step naming a file path, component, library, table or column
- Editing `OVERVIEW.md` §2 or an existing row of the order table (append only)
