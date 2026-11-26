# Implementation plan — Step template

Section 8 of `spec.md`. It replaces a separate `plan.md`: `/sdd` executes it directly, one Step at
a time. Gate criteria are in [gates.md](gates.md) (G-Exec).

## Step block

```markdown
### Step 3 — <outcome in one line>

- **Satisfies:** TS-04, TS-05
- **Depends on:** Step 1, Step 2   <!-- or "none" -->
- **Files:**
  - add `<path/to/new-module>`
  - change `<path/to/existing-module>`
  - change `<path/to/<slug>.spec>`   <!-- the feature's e2e spec file -->
- **Change:**
  - `<path/to/new-module>` exports `parseThing(input: string): ThingLine[]` —
    <behavior in one or two sentences, including edge cases and what it must NOT do>.
  - `<path/to/existing-module>`: `ListState` gains `addMany(lines: ThingLine[]): void`, which
    reuses `add` per line. It must not change `STORAGE_KEY` or the stored `Item` shape.
  - `<path/to/<slug>.spec>` gains `E2E-03` and `E2E-04` as written in Section 4.
- **Verify:**
  - `<typecheck command>` → exits 0, no output
  - `<lint command>` → exits 0
  - `<single-test e2e command> "E2E-03|E2E-04"` → 2 passed.
    E2E-03: open the import page, paste `A-100, 500` and `NOPE-123, 10`, submit → the list
    shows `A-100` × 500 and the page lists `NOPE-123` as not found
  <!-- the commands come from `.claude/repo-profile.md` § Verification commands -->
- **Stop-if:** the typecheck reports an error outside the files listed above; or `ListState` has no
  `add` method (the spec's premise is wrong) — stop and report, do not improvise.
```

## Rules

- **One Step, about 1–3 files.** More than three means the Step is two Steps.
- **Satisfies** lists `TS-` ids. Across all Steps each `TS-` appears exactly once.
- **Depends on** names only earlier Steps. Order the Steps so the list reads top to bottom.
- **Files** says `add` or `change` per path. Every `change` path must already exist; the Step
  never touches a path `impact.md` classifies `don't-touch` or `read-only`.
- **Change** gives exact exported signatures, behavior, edge cases and negative constraints.
  Short snippets are allowed only for boundary-prone logic — a normalisation rule, a
  rounding rule, a boundary comparison, a regex. No component bodies and no whole function bodies: the
  implementer writes the code so the review gates review work they did not author.
- **Verify** is an exact command plus its expected result, or a `manual` step with the route,
  input, and expected observation. Cite the `E2E-` id it runs. Every `E2E-` id is run by some Step.
  Each Step ends with the typecheck and lint commands unless it touches only docs; a Step
  touching what the profile marks as build-affecting also ends with the build command
  (`.claude/repo-profile.md` § Verification commands).
- **E2E tests are written in the Step that makes them pass.** That Step lists
  the feature's e2e spec file under **Files** (`add` in the first Step that writes one, `change` after;
  it does not count toward the 1–3 files), names the `E2E-` ids it adds under **Change**, and runs
  them in **Verify** with the single-test e2e command from the profile.
  The test's steps and assertion are the Section 4 row — the Step does not restate test code.
- **Stop-if** names the observable conditions under which the implementer stops and reports
  instead of deciding. A premise the Step relies on (a function exists, a guard is present) is the
  usual one.
- **No design decision hides in a Step.** If writing the Change needs a choice, the choice belongs
  in Section 2 under "Decisions made (do not revisit)" and the Step cites it.
