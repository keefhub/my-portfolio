---
name: agentic-accept
description: "Check that what an autonomous run built delivers the goal, not just each slice: turn the intent file's definition of done into Playwright acceptance tests and each hard constraint into a negative test, have an independent reviewer check the tests are not vacuous, build once, run them, and commit them only when they all pass. Anything no automated test can observe is listed as a manual check and never claimed as passed. Runs once, after the last slice of /agentic-run, and writes docs/requirements/<slug>-acceptance.md. Use when asked to accept, verify or check an autonomous goal against its intent. Never edits production code and never asks the user."
---

# /agentic-accept

Each slice already passed its own story's tests. This skill checks the thing those cannot: that the slices **together** do what the intent file asked, and that its hard constraints hold. It is the last stage of [`/agentic-run`](../agentic-run/SKILL.md), and can be run on its own.

```
/agentic-accept <slug>        # <slug> = the intent file's slug
```

```
docs/requirements/<slug>-intent.md (§5 constraints, §6 definition of done)
  -> author   -> e2e/<slug>-acceptance.spec.ts      (one fresh subagent)
  -> reviewer -> .run-logs/<slug>/acceptance-review.md   (once: are the tests real?)
  -> build, typecheck, lint, run the spec           (npm run -s verify -- …)
  -> docs/requirements/<slug>-acceptance.md + commit   (only if all pass)
```

## Hard rules

1. **Tests only.** Never edit production code, a story, a spec, another test, or a slice's locked tests. The only files written are `e2e/<slug>-acceptance.spec.ts`, a helper under `e2e/support/` if a new one is truly needed (reuse the existing ones first), and the acceptance document.
2. **Never ask the user.** A problem is a `STOP` that `/agentic-run` turns into a draft pull request.
3. **Every definition-of-done line (intent §6) gets at least one test that asserts it from the outside, and every hard constraint (§5) gets at least one negative test** that tries the forbidden thing and asserts what the person sees instead.
4. **Never loosen a test to pass.** A failing acceptance test is a finding about the product, not a thing to adjust. The one permitted change is fixing a test that is wrong about the intent (wrong selector, wrong precondition), once, with the reason written down.
5. **`manual` is the exception.** Only an outcome no automated check can observe (screen-reader output, visual judgement) or a human-only item (intent §7) may be `manual`. It is listed in the acceptance document and never reported as passed. An outcome that needs a real external service the tests cannot reach is `manual` with that reason; never add production code or a mock seam to make it testable.
6. **Run commands through `npm run -s verify -- <command>`** and read the 90-line digest, never the raw output. Never touch `.env`.
7. This session is the orchestrator and reads no test or source file. Workers are handed paths and are Sonnet (`model: "sonnet"`).

## Procedure

### 0. Preflight

1. The intent file must exist with `Status: ready`, and so must `docs/requirements/<slug>.md`. Every runnable slice in its `Run order` must have its `docs(<slice>): mark implementation complete` commit (`git log --oneline --grep`). If not: stop and say which slice is incomplete; `/agentic-accept` runs after the build, not instead of it.
2. Not on a protected branch. Clean tree, apart from files this skill produced.
3. **Resume.** If `docs/requirements/<slug>-acceptance.md` exists and is committed, the work is done: report it. If `e2e/<slug>-acceptance.spec.ts` exists uncommitted, skip the author and go to step 2.

### 1. Author

Dispatch one subagent (`general-purpose`, `model: "sonnet"`):

> Follow `.claude/skills/agentic-accept/references/acceptance-author.md`. Intent: `docs/requirements/<slug>-intent.md`. Decomposition: `docs/requirements/<slug>.md`. Write `e2e/<slug>-acceptance.spec.ts` and `docs/requirements/<slug>-acceptance.md`. Reply with one line: `DONE <n> tests, <m> manual` or `STOP <reason>`.

### 2. Review once

Dispatch one read-only subagent (`general-purpose`, `model: "sonnet"`):

> Follow `.claude/skills/agentic-accept/references/acceptance-review.md`. Intent: `docs/requirements/<slug>-intent.md`. Acceptance document: `docs/requirements/<slug>-acceptance.md`. Spec: `e2e/<slug>-acceptance.spec.ts`. Write the report to `.run-logs/<slug>/acceptance-review.md`; edit nothing else. Reply with one line: `PASS` or `FINDINGS <n blocking>`.

On `FINDINGS`, hand the report path to a fresh author subagent (same brief, plus the report path) once, to fix only the named findings. Do not review again; record any finding still open in the acceptance document under `Open findings`.

### 3. Run

In this order, each through `npm run -s verify --`, stopping at the first failure:

1. `npm run typecheck`, then `npm run lint`.
2. `npm run build` (the Playwright config refuses a stale build).
3. `npx playwright test e2e/<slug>-acceptance.spec.ts`.

### 4. Judge

- **All pass.** Commit with explicit paths: the spec, any helper and the acceptance document. Message: `feat(<slug>): add the intent acceptance tests`. Report `PASS <n> tests, <m> manual`.
- **A test fails.** Give a fresh author subagent the digest path (`.run-logs/…`, from the `LOG` line) and allow it **one** round: it may fix a test only when the digest shows the test is wrong about the intent, and it states why in the acceptance document. Re-run step 3 once.
- **Still failing.** Do not commit the spec. Write `.run-logs/<slug>/acceptance-failures.md`: each failing test id, the intent line (§5 or §6) it asserts, and the digest path. Report `STOP <n> failing: <intent lines>`. `/agentic-run` ends as a draft pull request carrying this.

## Report

`PASS` or `STOP`, the counts, the manual checks by id and reason, and any open findings. Nothing else.

## Red flags — stop

- Editing production code, a story, a spec or another test
- A test that passes without the outcome (asserts only that a page loads, or that a button exists)
- A negative test that never attempts the forbidden thing
- Marking something `manual` because it is hard to test
- Committing a failing spec, or reporting a `manual` check as passed
- Adding a mock seam or a production switch so a real external service can be tested
- Asking the user anything
