
# Spec writer procedure

The procedure the `pipeline-spec-writer` agent follows. [`/spec-this`](../SKILL.md) dispatches that agent with the path of a story; the agent runs Phases 0–9 here and writes the two files. Phase 10 (the independent review) is dispatched by the orchestrator, because a subagent cannot spawn the reviewers.

Turns one `docs/features/<slug>/story.md` Gherkin story into a reviewed, traceable specification at `docs/features/<slug>/spec.md` plus `docs/features/<slug>/impact.md`. Section 8 of `spec.md` is an ordered implementation plan that `/do-this` executes step by step — ready to implement without a separate plan.

This skill **analyzes and documents**. It does not write application code or test code, install packages, or commit — it specifies each end-to-end test (its `E2E-` row and the Step that writes it) and `/do-this` has a test author write it before an implementer starts. Write the spec for that implementer: it is handed one Step and the `E2E-` rows that Step names (the step packet, `scripts/step-packet.sh`), not the whole spec, and it makes no design decisions. So every Step must be self-contained and every `E2E-` row must be precise enough to turn into a test without a choice. The two files are the whole deliverable. The one exception to "no code" is a throwaway proof script for a Phase 3 safety fact, which lives outside the repo and is never committed.

## Input

The dispatch message gives you the path of one `story.md` (its folder name is the slug) and a mode: `MODE: write`, or `MODE: revise` with either the paths of review reports or a ruling to record.

## Decide, do not ask

You cannot ask the user anything, and the pipeline is meant to run without them. Wherever this procedure says to ask, or a gate or a reviewer raises a question, **decide it yourself**:

1. Take the smaller option that still satisfies every scenario in `story.md`, and record it in Section 2 "Decisions made (do not revisit)" tagged `[auto]`, with one line on what was decided and why. A human audits these afterwards by searching for `[auto]`, so make each one findable.
2. **Size the answer for this application:** an internal admin panel used by at most five people (`CLAUDE.md` § Domain facts). A question that only matters at enterprise scale (heavy concurrency, very large data sets, multi-tenancy, SSO, compliance-grade audit, internationalisation) gets the simple answer and an `[auto]` line, never a design for scale.
3. **Never rule against the story.** A decision may not drop, weaken or add a scenario.

Stop instead (`STATUS: BLOCKED`, § Reporting back) only when:

- the story conflicts with `OVERVIEW.md` §2 or §3, or with a `CLAUDE.md` "Never violate" rule;
- it needs a new runtime dependency, a new environment variable or a secret;
- two readings of a scenario would store different data or grant different permissions, and the story and standing context do not settle which;
- the story is missing a scenario the spec cannot do without.

## Hard rules

- **One feature per invocation.** Analysis quality collapses when several stories are held in context and cross-contaminate each other's requirements. Never `cat docs/features/*/story.md` or glob the directory. Never open another `docs/features/<other-slug>/story.md` "for context".
- **The only other input** is the standing context — OVERVIEW §1–3, at the path `.claude/repo-profile.md` § Feature docs gives. Skip §4, which is just an index.
- **A dependency on another feature** is read only through its `docs/features/<other-slug>/spec.md`, if one exists. If it doesn't, record the dependency as an assumption in Open Questions and move on.
- **Several features requested:** run this skill once per feature, sequentially — write one spec, report it, then start the next. Never merge two features into one analysis.
- **Never silently overwrite** an existing `spec.md` or `impact.md`. Read it and run in **revision mode**, or stop and ask.
- **Trace or omit.** Every rule, design element and AC cites its source or lives in Open Questions.

### Revision mode

When `spec.md` or `impact.md` already exists: read both in full, then amend in place. Preserve resolved Open Questions and prior contrarian outcomes; re-run only the phases whose inputs changed, plus every phase downstream of them; bump `Version` and add a Version history row. `/enhance-this-spec` follows this same procedure when it applies review findings.

## Thin-feature shortcut

A story with **≤2 Gherkin scenarios and no new storage key or module boundary** gets a short note instead of the full document: write `docs/features/<slug>/spec.md` using the thin-feature shape in `output-template.md` — purpose, the business rules, a module map, a short impact subsection, and a 2–4 step implementation order with a Verify command per step. No `impact.md`. `/do-this` executes the note's implementation order. Do not pad a thin feature into a 300-line document.

Never apply the shortcut to a feature that introduces a new persisted field or store, a new module boundary (e.g. a new module, service, endpoint or job in a layer that `CLAUDE.md` § Layout names), or a storage-contract change (a persisted key, column or item shape that existing data already uses).

## Roles

Every phase is owned by one role, written in that role's voice. The value of the pairing is the SA rejecting the BA's ambiguity and the BA rejecting the SA's scope creep.

| Role                        | Owns                                                                     | Speaks in terms of                                              | Must never                                               |
| --------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| **BA** — Business Analyst   | Phases 1, 5, 7 (business analysis, BDD acceptance criteria, AC matrix)   | user goals, business rules, states, edge cases, acceptance      | name a React component, hook, file path, or library      |
| **SA** — Solution Architect | Phases 3, 4, 6, 8 (impact, technical spec, verification, plan)           | data model, module boundaries, state, validation, errors, steps | introduce behaviour the BA did not derive from the story |

Phase 9 is adversarial: **each role reviews the other's artifacts**, not its own.

## Phases and gates

Run in order. Each phase ends at a gate; a failing gate does not advance (2 revision passes, then `PASSED WITH OPEN ITEMS` — protocol and every criterion are in `gates.md`).

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
| 8   | Implementation plan     | SA    | **G-Exec**          | Every `TS-` in exactly one Step; every `E2E-` written and run by a Step; ordered; ≤6 files; no open product decision; a `Risk:` line on every Step |
| 9   | Contrarian review       | BA↔SA | **G9 Challenge**    | ≥3 substantive challenges resolved, one aimed at Section 8                               |
| 10  | Independent review      | —     | **G10 Review**      | Two read-only reviewer agents report; every Critical/Major finding has a disposition; one round |

**References — read each exactly when stated:**

- `gates.md` — read in full **before finishing Phase 0** (G0 is judged from it); at the end of every later phase, re-check that phase's section.
- `output-template.md` — read **before starting Phase 3** (the `impact.md` shape) and again **before writing `spec.md`**.
- `blast-radius.md` — read **before the Phase 3 safety-facts pass**.
- `plan-step-template.md` — read **before starting Phase 8**.
- [`../../enhance-this-spec/SKILL.md`](../../enhance-this-spec/SKILL.md) § Round procedure and § Rounds — read **before starting Phase 10**.

### Phase 0 — Scope & inputs

1. Resolve the argument to exactly one folder: `ls docs/features/<slug>`. If no argument was given and the conversation is ambiguous, **ask** — analysing the wrong feature wastes the whole run. The slug is the folder name; never re-derive it.
2. Read `docs/features/<slug>/story.md`, then the standing context (OVERVIEW §1–3), then `.claude/repo-profile.md` § Feature docs and § Behavioral gate, then `CLAUDE.md` § Never violate and § Domain facts. If the story has any user-facing surface and the profile names a design system, also read the sections of it the story touches. The profile is the source of truth for what this repo can verify (its verification commands and its end-to-end test runner, with their file conventions). Do not re-derive it from the package manifest and do not add another test dependency.
3. Choose the domain entry point: the story's `domain:` file, else the fallback the profile names.
4. If `spec.md` or `impact.md` exists, enter revision mode (above) or stop and ask.
5. Decide thin or full, and say which.

### Phase 1 — Business analysis (BA)

Extract what the feature must _do_ and _why_, independent of how. Produce **Purpose**; **Actors & preconditions**; **Business rules** (`BR-01…`, each a single testable statement with a Source — a rule with no source is a guess, so find the source or move it to Open Questions); **Data touched**, in business terms; **Edge cases & negative paths** including ones the Gherkin doesn't state but the rules imply, each flagged `[in spec]` or `[derived]`; and **Out of scope**.

### Phase 2 — Discovery

Look facts up with `git ls-files`, `git grep`, `Grep` and by opening the file; this repo has no codebase index. Start from the domain entry point and the Phase 1 business rules, and build a compact domain map: the domain, the verified files, which exist vs. are missing, and unbuilt dependencies — one line each, citing `file:line` or the command it came from. You use that map in Phase 3.

- **A fact is never written from memory.** That covers whether a file exists, a signature, a caller, a route, a line number and the state of a dependency. Take it from `git`, `Grep` or an opened file. Another feature's `spec.md` describes the repo as it was then; use it for that feature's Decisions, never as proof of what the code is now.
- **Entry files have no importers by design.** A Next.js `page`, `layout`, `route` or metadata route (`sitemap.ts`, `robots.ts`) is loaded by the framework, so an empty `Grep` for its importers is not evidence that nothing depends on it. Open the file and cite `file:line`.
- **Open a file for a behaviour you rely on, or a signature you are about to quote in full.** Quote nothing from memory.
- **Facts only.** Looking things up does not decide anything. Judgements and Decisions stay yours, under § Decide, do not ask.

### Phase 3 — Impact analysis (SA)

Write `docs/features/<slug>/impact.md` (shape in `output-template.md`). One entry per file or directory the feature reaches, classified `add` / `change` / `read-only` / `don't-touch`, each with callers affected, shared state, and migration risk. **Verify before you assert:** before an entry says `change`, confirm the file exists (`git ls-files <path>`); a `change` on a file that was never written sends the implementer hunting for nothing. Fill each entry's "Callers affected" from `git grep` for the file's import path (and for `e2e/` specs that load the page it renders): name every importer it finds, or say in the cell why a group of them is unaffected. A caller the feature leaves alone belongs in a `don't-touch` row. Cite files by full path, because a bare name shared by two files cannot be checked. A change to a persisted shape that existing data already uses (a stored key, column or file format) needs a migration decision, so say what happens to data already in the wild — version the key, migrate, or read the old shape tolerantly, decided here. If the feature introduces the first database, persistence or outbound email, the setup (env vars, client module, failure behaviour) is an `add` entry of its own, not a footnote.

Then run the **safety-facts pass** in `blast-radius.md` over every `change` entry and every `add` that writes shared state: find the one fact the plan is safe because of, look where grep stops (persisted shapes, process or trust boundaries, the repo's "Never violate" invariants, timing, library source), and prove that fact as far up the ladder as is cheap — a level-4 proof is a throwaway script outside the repo, never committed. Write the result to `impact.md` § Safety facts. A confirmed risk must reach Phase 4 as a `TS-` or a Decision, or Open Questions; an `unproven` fact must become a Step's **Stop-if** in Phase 8; each "Before merge" check becomes an `E2E-` row in Phase 6.

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

`Steps` for `e2e` is the test's script in prose — the address or entry point (taken from wherever the repo keeps its route table, never a literal path if the repo forbids it), the fixture (sample data, browser or viewport settings), the actions by role or label. `Assertion` names the expectation: the visible text or role, the count, the final URL, the response status, the stored value after reload. `Steps` for `manual` is concrete and repeatable — the route, the input, the action. `Assertion` states the observable effect: visible text, the total shown, the URL after a redirect, the TS error code. An AC needing more than one check gets more than one row. **Write each `e2e` row so a test author could turn it into a test with no design choice:** literal fixture values in `Steps` (the exact email, quantity, string), literal expected values in `Assertion` (the exact message, count, URL). These rows are the acceptance criteria the implementer is held to, so vagueness here becomes wrong software later. **Every check must be able to fail:** pick probe values at which the bug under test actually manifests, check the arithmetic, and probe a boundary itself rather than a value one step away.

### Phase 7 — AC verification matrix (BA)

One row per AC: `AC | BR | TS | Step | E2E | Status`. Status is `Specified` — this document is the deliverable, not an implementation. Leave **Step** for Phase 8 to fill. Below the table list the orphan and uncovered sets named in `gates.md` G7; all must be empty. **Count obligations, not identifiers** — trace `BR-20a/b/c` separately when a rule is compound.

### Phase 8 — Implementation plan (SA)

Write Section 8 of `spec.md` as ordered `### Step N` blocks per `plan-step-template.md`, grouped under `## Phase` headings that each carry a **Delivers** line, then fill the matrix's Step column and re-check G7. The implementer is Sonnet and sees only its own Step (the step packet), so write each Step as a contract, not as dictation: the files, the exported signatures, the behaviour, how failures are reported, any persisted name, the existing symbols to reuse and the negative constraints. Leave internal names, private helpers and structure to the implementer. **Prefer fewer, larger Steps**: a Step is one coherent slice of up to six non-test files, and each Step costs a test author, an implementer and a gate run. Each `e2e` `E2E-` row is written by the Step that makes it pass: that Step lists the feature's spec file under **Files** (`add` the first time, `change` after) and its **Verify** runs those ids with the exact single-test command from the profile § Verification commands. Set the **Risk** line of every Step: `high` when the Step implements a safety fact from `impact.md` or a rule about who may see or change data, `low` otherwise, with a one-line reason. `/do-this` reviews a `high` Step independently before it commits; a `low` Step is covered by the mechanical gate and the feature review. No Step may leave a product decision open (what the user sees, what is stored, who may do what): if one does, the decision goes in Section 2 first.

### Phase 9 — Contrarian review (BA ↔ SA)

Attack the document; a review that finds nothing wrong has failed the gate. **SA challenges the BA's** rules and ACs (ambiguity, untestable wording, a missing negative path, an assumption dressed up as a requirement). **BA challenges the SA's** design, Steps and checks (scope creep, a design element no rule asked for, a Step hiding a decision, a check that cannot fail). Record each challenge as `# | Raised by | Challenge | Resolution | Outcome`, `Outcome` being `Accepted` (say what changed), `Rejected` (with reason) or `Open` (moved to Open Questions, with what would settle it). Aim at things that would cause the wrong software to be built.

### Phase 10 — Independent review (full specs only; run by the orchestrator, applied by you)

Phase 9 is a self-review, and a self-review clears itself more readily than it should. So the spec goes once to two isolated, read-only reviewer agents: `spec-codebase-verifier` (are the claims about the repo true?) and `spec-cold-reader` (can Section 8 be built as written?). **You do not dispatch them**: a subagent cannot. Your part is on either side of the review:

- **Before it:** run `npm run check:spec -- <slug>` and fix every `FAIL` it prints (id bookkeeping, phases, file counts, open-decision wording, paths, Risk lines), so the reviewers spend the round on meaning. Report `SPEC-LINT: PASS` or the lines you could not clear.
- **After it:** the orchestrator dispatches you again in `MODE: revise` with the paths of the two reports. Reconcile and apply them as [`../../enhance-this-spec/SKILL.md`](../../enhance-this-spec/SKILL.md) § Round procedure steps 4 and 5 describe: one row per distinct finding, a disposition for every Critical and Major one, accepted revisions applied inline in revision mode with the affected phases and gates re-run, then `npm run check:spec -- <slug>` again. A finding that would change scope or cost is decided by § Decide, do not ask, not sent to the user.

**One round.** There is no second review: what the round did not settle, you settle. A thin-feature note skips this phase.

## Writing rules

- **Respect the story's boundaries.** Do not design what the Gherkin doesn't ask for. If the feature is thin, the document is short.
- **Label assumptions.** OVERVIEW §3 items are unconfirmed by definition; when you rely on one, say which number.
- **No component bodies.** Type definitions, function signatures and the short boundary-prone snippets above are specification; everything else belongs to the implementation loop.
- **Don't touch `story.md`.** The Gherkin story is the input and stays unmodified.

## Reporting back

Your final message is read by an orchestrator that keeps its context small. Keep it to this shape and nothing else:

```
STATUS: DONE | BLOCKED
Spec: docs/features/<slug>/spec.md (Version <n>)      Impact: docs/features/<slug>/impact.md | none (thin)
Kind: full | thin
Gates: <e.g. 10/10 passed, or the gates that carry open items>
SPEC-LINT: PASS | <the FAIL lines left>
Counts: BR <n> / TS <n> / AC <n> / E2E <n> / Step <n>
Applied this round: <n> Critical, <n> Major, <n> Minor      (MODE: revise only)
Auto decisions: <n> recorded as [auto] in Section 2 (<one short line each>)
Blocked on: <for BLOCKED: which stop condition, the evidence and the options; else none>
```

`BLOCKED` is only for the stop conditions in § Decide, do not ask. Say which one holds, and keep whatever you have written so far.
