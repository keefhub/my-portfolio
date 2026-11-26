---
name: spec-this
description: "Turn ONE feature story into a ready-to-implement specification (docs/features/<slug>/spec.md and impact.md), with this chat session as the orchestrator: it hands the path of story.md to a spec-writer subagent, dispatches two read-only reviewers once, hands their reports back to the writer, and commits the result. The orchestrator passes paths and never reads the story or the spec. The writer decides open questions itself and records them as [auto]; the user is asked only when the story cannot be specified. Use for feature analysis, specification creation, or revising a spec. Processes exactly one feature per invocation."
---

# /spec-this

Produces `docs/features/<slug>/spec.md` and `impact.md` from `docs/features/<slug>/story.md`. Section 8 of `spec.md` is the implementation plan that [`/do-this`](../do-this/SKILL.md) executes.

**This session is the orchestrator.** It does not read `story.md` or write the spec. It dispatches leaf subagents, every one with `model: "sonnet"` (never raise it), passes each one paths, and reads only their short reports. The procedure the writer follows (the BA and SA roles, the phases, the gates, and how it decides instead of asking) is in [`references/writer.md`](references/writer.md); the orchestrator does not need to load it.

## Usage

```
/spec-this export-report-as-csv            # docs/features/export-report-as-csv/story.md
/spec-this export-report-as-csv revise     # record a ruling, or re-review a spec edited by hand
/spec-this                                 # infer the slug from the conversation; ask if ambiguous
```

One feature per invocation. Several features: run it once per feature, in order.

## Workers

| Agent | Does | Is given |
| --- | --- | --- |
| `pipeline-spec-writer` | Phases 0–9, the spec lint, and applying review findings | the story path and a mode |
| `spec-codebase-verifier`, `spec-cold-reader` | The independent review, read-only, once | the packet paths and hashes |

`spec-traceability` is not part of this round: `npm run check:spec` covers the id bookkeeping it used to count. [`/enhance-this-spec`](../enhance-this-spec/SKILL.md) still runs all three reviewers when you ask for a deeper review by hand.

## Procedure

### 1. Check the inputs

`ls docs/features/<slug>`. No `story.md`: stop and offer `/help-discover-this <slug>`; never write a story here. If the current branch is `develop`, `main` or `master`, create `feat/<slug>` and work there. If `spec.md` already exists and this is not a revision, the feature is already specified: say so and go on to `/do-this`; never overwrite it silently.

The writer looks facts up with `git ls-files`, `git grep`, `Grep` and by opening files; this repo has no codebase index, so every fact is read from the tree or from git.

### 2. Write

Dispatch `pipeline-spec-writer` (foreground):

```
Story: docs/features/<slug>/story.md
MODE: write
```

Read its report:

- `STATUS: BLOCKED` → one of the writer's stop conditions holds. Put its `Blocked on:` line to the user and stop. This is the only question this stage asks.
- `Kind: thin` → skip to step 5. A thin note has no review.
- `SPEC-LINT:` not `PASS` → dispatch the writer once more in `MODE: revise` with `Ruling: clear the spec lint` and the lines quoted. Still failing: carry on and name the lines in the report; the reviewers will see them.

### 3. Review, once

No script checks `impact.md`; the verifier checks every path, `file:line` citation, symbol and caller itself.

Freeze the packet: `sha256sum` of `spec.md`, `impact.md`, `story.md` and the standing context, plus the spec's `Version` and `Date` (`head -n 12 spec.md`). Dispatch `spec-codebase-verifier` and `spec-cold-reader` in **one message**, each with only the packet paths, the hashes, the version and its role, as [`../enhance-this-spec/SKILL.md`](../enhance-this-spec/SKILL.md) § Round procedure steps 2 and 3 describe (no writer reasoning, no cross-visibility; reject a report that echoes the wrong hashes).

Write each report, exactly as returned, to `.run-logs/<slug>/review-<agent>.md` (git-ignored). Do not reconcile them yourself: that needs the spec in context, and the writer already has it.

### 4. Apply

Dispatch a fresh `pipeline-spec-writer`:

```
Story: docs/features/<slug>/story.md
MODE: revise
Reports: .run-logs/<slug>/review-spec-codebase-verifier.md, .run-logs/<slug>/review-spec-cold-reader.md
```

There is no second round. What the review did not settle, the writer settles and records as `[auto]`.

### 5. Commit

`git add docs/features/<slug>/spec.md docs/features/<slug>/impact.md` (explicit paths; `impact.md` only if it exists) and commit as `docs(<slug>): add the spec and impact analysis`, or `docs(<slug>): revise the spec` for a revision.

## Revision

`/spec-this <slug> revise`. Dispatch the writer in `MODE: revise` with `Ruling:` carrying the user's answer, quoted; it records it as a `[human]` Decision. For a spec the user edited by hand, run steps 3 and 4 over it instead. Commit as in step 5. Steps that are already committed are never renumbered. (`/do-this` dispatches the writer itself when a task is blocked; that path does not come through here.)

## Report

To the user, in a few lines: the two paths, the gate result, the counts, each `[auto]` decision in one line (they are the user's to audit, not to approve), any open item a gate still carries, and what comes next (`/do-this <slug>`).
