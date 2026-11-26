# Implementation plan — Step template

Section 8 of `spec.md`. `/do-this` executes it directly, one Step at a time. Gate criteria are in
[gates.md](gates.md) (G-Exec).

**Write every Step for a capable implementer (Sonnet) who sees only that Step.** It is handed the
step packet (`scripts/step-packet.sh`: the Step, Section 2's Approach, Decisions and Do-not-touch,
and the `E2E-` rows the Step names) and the repo. Fix what must not vary: what the user sees, what is
stored, who may do what, and the names other code depends on. Leave the rest to the implementer:
internal names, private helpers, how a function is structured. A Step that dictates every line is
slower to write, slower to review and no safer, because the tests are what hold the implementer to
the behaviour.

## Phases

Group the Steps under `## Phase A — <name>`, `## Phase B — <name>`, … A phase ends where something
coherent works (data and domain; then actions; then screens). Under each heading put one line:

```markdown
## Phase A — Data and domain

**Delivers:** TS-01, TS-02, TS-03; E2E-01, E2E-02, E2E-04
```

Phases order the work and tell the feature review what each part was meant to deliver. Every Step
sits in exactly one phase; every `TS-` and `E2E-` id is delivered by exactly one phase. A spec of up
to four Steps is one phase.

## Step block

```markdown
### Step 2 — <outcome in one line>

- **Satisfies:** TS-04, TS-05
- **Depends on:** Step 1   <!-- or "none" -->
- **Files:**
  - add `<path/to/new-module>`
  - change `<path/to/existing-module>`
  - change `<path/to/<slug>.spec>`   <!-- the feature's e2e spec file -->
- **Reuse:** `<path/to/helper>` → `existingHelper(arg: Type): Result`; `<path/to/result-module>` →
  `ok()`, `fail()`, `MESSAGES.invalidForm`   <!-- or "none" -->
- **Change:**
  - `<path/to/new-module>` exports `parseThing(input: string): ThingLine[]`: one line per
    `code, quantity` pair; a line with no quantity is skipped, never an error. Must NOT trim the
    code or log the input.
  - `<path/to/existing-module>`: `ListState` gains `addMany(lines: ThingLine[]): void`. It must not
    change `STORAGE_KEY` or the stored `Item` shape.
  - `<path/to/<slug>.spec>` gains `E2E-03` and `E2E-04` as written in Section 4.
- **Risk:** low — <one-line reason>
  <!-- or: high — implements the "<safety fact>" of impact.md -->
- **Verify:**
  - `<single-test e2e command> "E2E-03|E2E-04"` → 2 passed
- **Stop-if:** `ListState` has no `add` method (the spec's premise is wrong).
```

## Rules

- **A Step is one coherent slice**, usually 2–6 non-test files (`npm run check:spec` fails above
  six). Prefer fewer, larger Steps: each Step costs a test author, an implementer and a gate run, so
  three Steps of one file each are worse than one Step of three. Split where a later Step genuinely
  depends on an earlier one being finished, or where a `high` Risk part can be isolated.
- **Satisfies** lists `TS-` ids. Across all Steps each `TS-` appears exactly once.
- **Depends on** names only earlier Steps.
- **Files** says `add` or `change` per path. Every `change` path must already exist; the Step never
  touches a path `impact.md` classifies `don't-touch` or `read-only`. The mechanical gate fails a
  diff that leaves this list, so list every file the Step may need.
- **Change** states the contract, not the code. For every file give what other code or the user
  depends on:
  - exported names and their signatures (parameter and return types);
  - the behaviour per kind of input, and the result at each edge the tests do not already pin;
  - how each failure is reported (which `ActionResult` / `MESSAGES` key, or what is thrown);
  - any persisted name or shape (column, key, cookie);
  - negative constraints ("must not …").

  Copy in any value the Step depends on (a limit, a message key, a column name): the implementer
  does not see the rest of the spec. Do not write function bodies or component bodies, and do not
  name private helpers or local variables. A short snippet is allowed only for boundary-prone logic:
  a normalisation rule, a rounding rule, a boundary comparison, a regex.
- **Risk** is `high` or `low`, then a reason. `high` when the Step implements a safety fact from
  `impact.md` or a rule about who may see or change data. `low` otherwise. A `high` Step gets one
  independent review before it is committed; a `low` Step is covered by the mechanical gate and the
  feature review. Do not mark a Step `high` because it is large or touches a shared file.
- **Reuse** names the existing symbols the Step must call rather than re-implement, with path and
  signature. "none" when nothing applies.
- **Tests are written before the Step runs.** `/do-this` has a test author write the failing tests
  for the Step's `E2E-` rows and locks them; the implementer makes them pass without editing them.
  The Step lists the test file under **Files** (`add` in the first Step that writes one, `change`
  after) and names the ids under **Change**, but never describes test code: the Section 4 row is
  the test.
- **Verify** is the exact single-test command for the Step's `E2E-` ids, with the expected result,
  or a `manual` step with the route, input and expected observation. Every `E2E-` id is run by some
  Step. Do not list lint or build: the mechanical gate runs them on every task, and a browser
  command carries no `npm run build &&` in front (the profile's row has the form: `npx playwright
  test <file> -g "<ids>"`). A Step that writes no test verifies with `npm run typecheck`.
- **Every Step has** **Risk**, **Verify** and **Stop-if** (`npm run check:spec -- <slug>` checks it).
- **Stop-if** names the premises the Step relies on (a function exists, a guard is present). If one
  is false the spec is wrong and the implementer stops instead of working around it.
- **Product decisions are made in the spec, not by the implementer.** What the user sees, what is
  stored and who may do what are settled in Section 2 "Decisions made (do not revisit)" and restated
  in the Step that needs them. An implementation choice the Step leaves open is the implementer's to
  make, and it reports the ones worth knowing under `Decisions:`.
