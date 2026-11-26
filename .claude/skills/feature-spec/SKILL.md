---
name: feature-spec
description: "Analyze ONE feature story and produce a gated, ready-to-implement specification: business analysis, discovery, impact analysis, technical spec, BDD acceptance criteria, verification mapping (end-to-end tests for runtime behaviour, compiler checks for types, manual checks only where an automated test cannot observe), AC matrix, an ordered implementation plan, a contrarian review, and an independent three-reviewer round. Written to docs/features/<slug>/spec.md and impact.md — ready to implement without a separate plan. Two roles collaborate: Business Analyst (BA) and Solution Architect (SA), with a pass/fail gate between every phase. Use for feature analysis, acceptance-criteria verification, BDD generation, or specification creation. Processes exactly one feature per invocation — never opens another feature's story."
---

# /feature-spec

Turns one `docs/features/<slug>/story.md` Gherkin story into a reviewed, traceable specification at `docs/features/<slug>/spec.md` plus `docs/features/<slug>/impact.md`. Section 8 of `spec.md` is an ordered implementation plan that `/sdd` executes step by step — ready to implement without a separate plan.

This skill **analyzes and documents**. It does not write application code or test code, install packages, or commit — it specifies each end-to-end test (its `E2E-` row and the Step that writes it) and `/sdd` writes it. The two files are the whole deliverable. The one exception to "no code" is a throwaway proof script for a Phase 3 safety fact, which lives outside the repo and is never committed.

## Usage

```
/feature-spec export-report-as-csv   # target docs/features/export-report-as-csv/story.md
/feature-spec                    # infer from conversation; ask if ambiguous
```

## Hard rules

- **One feature per invocation.** Analysis quality collapses when several stories are held in context and cross-contaminate each other's requirements. Never `cat docs/features/*/story.md` or glob the directory. Never open another `docs/features/<other-slug>/story.md` "for context".
- **The only other input** is the standing context — OVERVIEW §1–3, at the path `.claude/repo-profile.md` § Feature docs gives. Skip §4, which is just an index.
- **A dependency on another feature** is read only through its `docs/features/<other-slug>/spec.md`, if one exists. If it doesn't, record the dependency as an assumption in Open Questions and move on.
- **Several features requested:** run this skill once per feature, sequentially — write one spec, report it, then start the next. Never merge two features into one analysis.
- **Never silently overwrite** an existing `spec.md` or `impact.md`. Read it and run in **revision mode**, or stop and ask.
- **Trace or omit.** Every rule, design element and AC cites its source or lives in Open Questions.

### Revision mode

When `spec.md` or `impact.md` already exists: read both in full, then amend in place. Preserve resolved Open Questions and prior contrarian outcomes; re-run only the phases whose inputs changed, plus every phase downstream of them; bump `Version` and add a Version history row. `/spec-review` follows this same procedure when it applies review findings.

## Thin-feature shortcut

A story with **≤2 Gherkin scenarios and no new storage key or module boundary** gets a short note instead of the full document: write `docs/features/<slug>/spec.md` using the thin-feature shape in `references/output-template.md` — purpose, the business rules, a module map, a short impact subsection, and a 2–4 step implementation order with a Verify command per step. No `impact.md`. `/sdd` executes the note's implementation order. Do not pad a thin feature into a 300-line document.

Never apply the shortcut to a feature that introduces a new persisted field or store, a new module boundary (e.g. a new module, service, endpoint or job in a layer that `CLAUDE.md` § Layout names), or a storage-contract change (a persisted key, column or item shape that existing data already uses).

## Roles

Every phase is owned by one role, written in that role's voice. The value of the pairing is the SA rejecting the BA's ambiguity and the BA rejecting the SA's scope creep.

| Role                        | Owns                                                                     | Speaks in terms of                                              | Must never                                               |
| --------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| **BA** — Business Analyst   | Phases 1, 5, 7 (business analysis, BDD acceptance criteria, AC matrix)   | user goals, business rules, states, edge cases, acceptance      | name a React component, hook, file path, or library      |
| **SA** — Solution Architect | Phases 3, 4, 6, 8 (impact, technical spec, verification, plan)           | data model, module boundaries, state, validation, errors, steps | introduce behaviour the BA did not derive from the story |

Phase 9 is adversarial: **each role reviews the other's artifacts**, not its own.

## Phases and gates

Run in order. Each phase ends at a gate; a failing gate does not advance (2 revision passes, then `PASSED WITH OPEN ITEMS` — protocol and every criterion are in `references/gates.md`).

| #   | Phase                   | Role  | Gate                | One-line pass condition                                                                  |
| --- | ----------------------- | ----- | ------------------- | ---------------------------------------------------------------------------------------- |
| 0   | Scope & inputs          | —     | **G0 Scope**        | One story resolved, inputs read, existing outputs handled, thin-or-full decided          |
| 1   | Business analysis       | BA    | **G1 Business**     | Every scenario → a `BR-`; every `BR-` sourced; compound rules split into clauses          |
| 2   | Discovery               | —     | **G2 Discovery**    | Compact, evidenced domain map from the Explore subagent; nothing assumed                 |
| 3   | Impact analysis         | SA    | **G3 Impact**       | Every entry classified; every `change` file verified to exist; safety facts proven or marked unproven |
| 4   | Technical specification | SA    | **G4 Design**       | Every `TS-` cites a `BR-` and an impact entry; Decisions and Do-not-touch present        |
| 5   | BDD acceptance criteria | BA    | **G5 Acceptance**   | Every AC atomic, observable, Given/When/Then; every scenario covered                     |
| 6   | Verification mapping    | SA    | **G6 Verification** | Every AC has an `E2E-` row; runtime behaviour is `e2e`; steps and assertion concrete |
| 7   | AC verification matrix  | BA    | **G7 Traceability** | BR → TS → Step → E2E traces end to end; no orphans; obligations counted                  |
| 8   | Implementation plan     | SA    | **G-Exec**          | Every `TS-` in exactly one Step; every `E2E-` written and run by a Step; ordered; 1–3 files; no open decision |
| 9   | Contrarian review       | BA↔SA | **G9 Challenge**    | ≥3 substantive challenges resolved, one aimed at Section 8                               |
| 10  | Independent review      | —     | **G10 Review**      | Three read-only reviewer agents report; every Critical/Major finding has a disposition; ≤2 rounds |

**References — read each exactly when stated:**

- `references/gates.md` — read in full **before finishing Phase 0** (G0 is judged from it); at the end of every later phase, re-check that phase's section.
- `references/output-template.md` — read **before starting Phase 3** (the `impact.md` shape) and again **before writing `spec.md`**.
- `references/blast-radius.md` — read **before the Phase 3 safety-facts pass**.
- `references/plan-step-template.md` — read **before starting Phase 8**.
- [`../spec-review/SKILL.md`](../spec-review/SKILL.md) § Round procedure and § Rounds — read **before starting Phase 10**.

### Phase 0 — Scope & inputs

1. Resolve the argument to exactly one folder: `ls docs/features/<slug>`. If no argument was given and the conversation is ambiguous, **ask** — analysing the wrong feature wastes the whole run. The slug is the folder name; never re-derive it.
2. Read `docs/features/<slug>/story.md`, then the standing context (OVERVIEW §1–3), then `.claude/repo-profile.md` § Feature docs and § Behavioral gate, then `CLAUDE.md` § Never violate and § Domain facts. If the story has any user-facing surface and the profile names a design system, also read the sections of it the story touches. The profile is the source of truth for what this repo can verify (its verification commands and its end-to-end test runner, with their file conventions). Do not re-derive it from the package manifest and do not add another test dependency.
3. Choose the domain entry point: the story's `domain:` file, else the fallback the profile names.
4. If `spec.md` or `impact.md` exists, enter revision mode (above) or stop and ask.
5. Decide thin or full, and say which.

### Phase 1 — Business analysis (BA)

Extract what the feature must _do_ and _why_, independent of how. Produce **Purpose**; **Actors & preconditions**; **Business rules** (`BR-01…`, each a single testable statement with a Source — a rule with no source is a guess, so find the source or move it to Open Questions); **Data touched**, in business terms; **Edge cases & negative paths** including ones the Gherkin doesn't state but the rules imply, each flagged `[in spec]` or `[derived]`; and **Out of scope**.

### Phase 2 — Discovery

Delegate to an **Explore** subagent (`subagent_type: Explore`, `model: sonnet`), foreground. Give it the Phase 1 business rules (not the whole story) and the domain entry point, and tell it to return **only** a compact domain map: the domain, the verified files, which exist vs. are missing, and unbuilt dependencies — one line each, with evidence (a command and its result, or `file:line`). It must not paste file contents. You use that map in Phase 3; you do not re-explore from scratch, but you do spot-check any line a later phase leans on.

### Phase 3 — Impact analysis (SA)

Write `docs/features/<slug>/impact.md` (shape in `references/output-template.md`). One entry per file or directory the feature reaches, classified `add` / `change` / `read-only` / `don't-touch`, each with callers affected, shared state, and migration risk. **Verify before you assert:** before an entry says `change`, open the tree (`git ls-files`, `git log --oneline`) and confirm the file exists; a `change` on a file that was never written sends the implementer hunting for nothing. A change to a persisted shape that existing data already uses (a stored key, column or file format) needs a migration decision, so say what happens to data already in the wild — version the key, migrate, or read the old shape tolerantly, decided here. If the feature introduces the first database, persistence or outbound email, the setup (env vars, client module, failure behaviour) is an `add` entry of its own, not a footnote.

Then run the **safety-facts pass** in `references/blast-radius.md` over every `change` entry and every `add` that writes shared state: find the one fact the plan is safe because of, look where grep stops (persisted shapes, process or trust boundaries, the repo's "Never violate" invariants, timing, library source), and prove that fact as far up the ladder as is cheap — a level-4 proof is a throwaway script outside the repo, never committed. Write the result to `impact.md` § Safety facts. A confirmed risk must reach Phase 4 as a `TS-` or a Decision, or Open Questions; an `unproven` fact must become a Step's **Stop-if** in Phase 8; each "Before merge" check becomes an `E2E-` row in Phase 6.

### Phase 4 — Technical specification (SA)

Design against the Phase 1 rules only. Produce **Approach** (3–6 sentences); **Design elements** (`TS-01…`, each citing the `BR-` it satisfies **and** the `impact.md` entry it lives in — respect CLAUDE.md § Never violate, whatever it lists for this repo); **Data model**; **Module map**; **Dependencies**, each marked built (cite the commit) or unbuilt; **Non-functional notes**; **Decisions made (do not revisit)**; and **Do not touch**. If the design touches a framework or library API you are not certain of in the version this repo pins, check the installed type definitions or the docs for that version and cite what you checked.

### Phase 5 — BDD acceptance criteria (BA)

Rewrite and _complete_ the story's Gherkin as verification-ready criteria: a `gherkin` block, each scenario preceded by an ID comment `# AC-01`; every original scenario preserved in meaning (split any scenario asserting two independent things); new scenarios for the `[derived]` edge cases; `Scenario Outline` + `Examples` where behaviour varies only by data; every step observable from outside the implementation.

### Phase 6 — Verification mapping (SA)

Map every AC to how it will actually be checked. Per `.claude/repo-profile.md` § Behavioral gate the behavioral gate is the repo's end-to-end test runner, so every `E2E-` row is exactly one of:

- **`e2e`** — any runtime behavior the runner can drive: user flows and their results, persistence across reload or restart, redirects and status codes, response headers and bodies, responsive layout, keyboard behaviour, accessible names and roles. **This is the norm.** The row becomes one test in the feature's spec file (path and naming per the profile § Behavioral gate), titled `E2E-NN: …`.
- **`compiler`** — a type shape or a pure function's contract that the type checker plus its call site already proves. Say so instead of inventing a browser step.
- **`manual`** — only what the e2e runner cannot observe: what a screen reader announces, or a visual judgement that no assertion expresses. The `Steps` cell names why the runner can't check it. A `manual` row for something an e2e assertion could check fails G6.

| E2E ID | AC ID | Method | Steps | Assertion |
| ------ | ----- | ------ | ----- | --------- |

`Steps` for `e2e` is the test's script in prose — the address or entry point (taken from wherever the repo keeps its route table, never a literal path if the repo forbids it), the fixture (sample data, browser or viewport settings), the actions by role or label. `Assertion` names the expectation: the visible text or role, the count, the final URL, the response status, the stored value after reload. `Steps` for `manual` is concrete and repeatable — the route, the input, the action. `Assertion` states the observable effect: visible text, the total shown, the URL after a redirect, the TS error code. An AC needing more than one check gets more than one row. **Every check must be able to fail:** pick probe values at which the bug under test actually manifests, check the arithmetic, and probe a boundary itself rather than a value one step away.

### Phase 7 — AC verification matrix (BA)

One row per AC: `AC | BR | TS | Step | E2E | Status`. Status is `Specified` — this document is the deliverable, not an implementation. Leave **Step** for Phase 8 to fill. Below the table list the orphan and uncovered sets named in `references/gates.md` G7; all must be empty. **Count obligations, not identifiers** — trace `BR-20a/b/c` separately when a rule is compound.

### Phase 8 — Implementation plan (SA)

Write Section 8 of `spec.md` as ordered `### Step N` blocks per `references/plan-step-template.md`, then fill the matrix's Step column and re-check G7. Each `e2e` `E2E-` row is written by the Step that makes it pass: that Step lists the feature's spec file under **Files** (`add` the first time, `change` after) and its **Verify** runs those ids with the exact single-test command from the profile § Verification commands. Steps carry contracts — exact signatures, behavior, negative constraints — not function bodies; short snippets are allowed only for boundary-prone logic (a normalisation rule, a rounding rule, a boundary comparison), never component bodies. No Step may need a design decision: if one does, the decision goes in Section 2 first.

### Phase 9 — Contrarian review (BA ↔ SA)

Attack the document; a review that finds nothing wrong has failed the gate. **SA challenges the BA's** rules and ACs (ambiguity, untestable wording, a missing negative path, an assumption dressed up as a requirement). **BA challenges the SA's** design, Steps and checks (scope creep, a design element no rule asked for, a Step hiding a decision, a check that cannot fail). Record each challenge as `# | Raised by | Challenge | Resolution | Outcome`, `Outcome` being `Accepted` (say what changed), `Rejected` (with reason) or `Open` (moved to Open Questions, with what would settle it). Aim at things that would cause the wrong software to be built.

### Phase 10 — Independent review (full specs only)

Phase 9 is a self-review, and a self-review clears itself more readily than it should. So the spec now goes to three isolated, read-only reviewer agents — `spec-traceability`, `spec-codebase-verifier`, `spec-cold-reader` — run exactly as `../spec-review/SKILL.md` § Round procedure describes (each dispatched with `model: sonnet`): a frozen packet, one dispatch message, no writer reasoning, no cross-visibility. Reconcile their findings, then apply the accepted ones yourself in revision mode (re-running the affected phases and gates). **At most 2 rounds**; anything unresolved goes to Open Questions. A thin-feature note skips this phase.

## Writing rules

- **Respect the story's boundaries.** Do not design what the Gherkin doesn't ask for. If the feature is thin, the document is short.
- **Label assumptions.** OVERVIEW §3 items are unconfirmed by definition; when you rely on one, say which number.
- **No component bodies.** Type definitions, function signatures and the short boundary-prone snippets above are specification; everything else belongs to the implementation loop.
- **Don't touch `story.md`.** The Gherkin story is the input and stays unmodified.

## Reporting back

After writing the files, report: the output paths, the gate result (e.g. `11/11 passed`, or which gates carry open items), the number of review rounds, the counts (`BR` / `TS` / `AC` / `E2E` / `Step`), and any Open Questions the user must answer. If any gate carries open items, lead with that.

## After this skill

Execute with [`/sdd`](../sdd/SKILL.md). Independent review already happened in Phase 10, so no separate review step is needed; run [`/spec-review`](../spec-review/SKILL.md) only to re-review a spec that was edited afterwards.
