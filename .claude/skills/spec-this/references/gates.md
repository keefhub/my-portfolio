# Gate criteria

The pass condition for every `/spec-this` gate. `/spec-this` Phase 10, `/enhance-this-spec` and the three reviewer agents in
[`.claude/agents/`](../../../agents/) use this same file — a criterion changes here or nowhere.

## Failure protocol

A gate that fails does not advance. Fix that phase's output and re-check, up to **2 revision
passes** per gate. If it still fails, write the unresolved item into **Open Questions & Risks** in
`spec.md`, mark the gate `PASSED WITH OPEN ITEMS`, and continue. Never mark a gate passed when it
is not; never invent an answer to make a gate pass.

## G0 Scope — Phase 0

- Exactly one story resolved: `ls docs/features/<slug>` finds the folder and its `story.md`.
- `story.md`, the standing context named in `.claude/repo-profile.md` § Feature docs (OVERVIEW
  §1–3 only), and that profile's § Behavioral gate are read.
- Existing `spec.md` / `impact.md` handled: revision mode, or stopped and asked. Never overwritten
  silently.
- The domain entry point is chosen (the story's `domain:` file, else the fallback the profile names).
- Full spec or thin note is decided and stated.

## G1 Business — Phase 1 (BA)

- Every Gherkin scenario maps to at least one `BR-` rule.
- Every `BR-` cites its source: a Gherkin line, an OVERVIEW bullet, or an assumption number. A rule
  with no source moves to Open Questions.
- A compound rule is split into lettered clauses (`BR-20a`, `BR-20b`, `BR-20c`), one testable
  statement each.
- Every derived edge case is flagged `[derived]`; every stated one `[in spec]`.

## G2 Discovery — Phase 2

- The Explore subagent returned only the compact domain map: domain, verified files, exists vs.
  missing, unbuilt dependencies. No file dumps.
- Every line of the map carries evidence (a `find` query, a command and its result, or `file:line`).
- Every file the later phases will name is marked `exists` or `missing`; nothing is `assumed`.
- Each dependency on another feature is marked built (cite the commit) or unbuilt.

## G3 Impact — Phase 3 (SA)

- Every entry in `impact.md` is classified exactly one of `add` / `change` / `read-only` /
  `don't-touch`. Nothing is unclassified.
- Every `change` and `read-only` entry names a file verified to exist (`git ls-files` or opened).
- Every entry states callers affected, shared state, and migration risk — or `none — <reason>`.
- Every file the Phase 2 map marked relevant appears in `impact.md`.
- `impact.md` § Safety facts covers every `change` entry and every `add` that writes shared state
  (or says in one line why an entry was skipped). Each safety fact states the ladder level it
  reached (1–5 per `references/blast-radius.md`) with its proof, or is marked `unproven`. Level 1
  alone is `unproven`.
- Every confirmed risk is carried forward: a `TS-`, a Decision, or an Open Question. Every
  `unproven` fact is named in some Step's **Stop-if** once Phase 8 runs; every "Before merge"
  check has an `E2E-` row once Phase 6 runs.

## G4 Design — Phase 4 (SA)

- Every `BR-` clause has at least one `TS-` element; no `TS-` element lacks a `BR-`.
- Every `TS-` cites a `BR-` id **and** an `impact.md` entry (by file path).
- "Decisions made (do not revisit)" and "Do not touch" sections exist; "Do not touch" includes
  every `don't-touch` entry from `impact.md`.
- The design respects every rule in `CLAUDE.md` § Never violate.

## G5 Acceptance — Phase 5 (BA)

- Every AC is atomic, observable from outside the implementation, and Given/When/Then-shaped.
- Every original scenario is covered; every `[derived]` edge case has an AC or a stated reason it
  does not.
- No AC asserts an implementation detail (a hook's return value, a file path, a column name).

## G6 Verification — Phase 6 (SA)

- Every AC has at least one `E2E-` row.
- Every `E2E-` row has method `e2e`, `compiler` or `manual` — nothing else — with concrete
  steps and a concrete assertion. The bare word "manual" or "e2e" is a failure.
- Every runtime behaviour is `e2e`. A `manual` row names what the e2e runner cannot observe (a
  screen-reader announcement, a visual judgement); a `manual` row an e2e assertion could
  check fails.
- An `e2e` row's steps name the entry point (from the repo's route table, if it has one), the
  fixture data and the actions by role or label; its assertion names the expectation. No
  literal address the repo's rules forbid hard-coding.
- Every check can fail: probe values are chosen where the bug under test manifests, and boundary
  cases probe the boundary itself.
- **Every `e2e` row is test-ready.** A test author who has read only the row and the conventions
  can write the test without a design choice: `Steps` gives literal fixture values and the actions
  in order, `Assertion` gives literal expected values (text, count, URL, status, stored value). A
  row that says "an invalid email", "a long name" or "an error message" without the value fails.

## G7 Traceability — Phase 7 (BA), completed in Phase 8

Evaluated twice: after Phase 7 with every column but **Step** filled, then again once Phase 8 has
filled Step.

- The matrix has one row per AC with columns AC | BR | TS | Step | E2E | Status. No empty cell
  once Step is filled.
- All of these lists are empty: orphan `BR-` clauses (no AC); orphan `TS-` ids (no AC); uncovered
  scenarios; uncovered `[derived]` edge cases; unverifiable ACs; `TS-` ids in no Step; `E2E-` ids
  run by no Step.
- **Count obligations, not identifiers.** A rule that says three things is three clauses, and an AC
  exercising one of them does not cover the rule. A report that every id appears somewhere in the
  matrix is not a pass.

## G-Exec — Phase 8 (SA)

- Every `TS-` id appears in exactly one Step's **Satisfies**.
- Every `E2E-` id is run by some Step's **Verify** (a command, or a manual step citing the id).
- Every `e2e` `E2E-` id is written by exactly one Step: that Step's **Files** lists
  the feature's e2e spec file, its **Change** names the `E2E-` ids it adds, and its **Verify** runs them
  with the single-test command in `.claude/repo-profile.md` § Verification commands. A Step never runs
  an id a later Step writes.
- Steps are dependency-ordered: each **Depends on** names only earlier Steps.
- Each Step is one coherent slice of at most 6 non-test files. A plan of many one-file Steps fails:
  merge them.
- No Step leaves a product decision open: what the user sees, what is stored, who may do what. A
  Step that says "choose", "decide", "or similar", "as appropriate" or "TBD" about one of those, or
  whose **Change** omits the signature of an exported symbol, fails. Implementation choices
  (internal names, private helpers, structure) are the implementer's and are not specified.
- **Every Step is self-contained for an implementer that sees only that Step.** Its **Change**
  gives, per file, the contract: exported signatures, behaviour per kind of input, how each failure
  is reported, any persisted name or shape, and any value it depends on copied in (not "see Section
  2"). Its **Reuse** line names the existing symbols to call. It does not contain function bodies,
  component bodies or private names.
- Every Step is in exactly one `## Phase`; each phase has a **Delivers** line; every `TS-` and
  `E2E-` id is delivered by exactly one phase (a spec of up to four Steps is one phase).
- Every Step has a **Verify** (exact command + expected result) and a **Stop-if**.
- Every Step has a **Risk** line, `high` or `low` with a one-line reason, that follows
  `.claude/repo-profile.md` § Gate risk tiers: `high` when the Step implements a safety fact from
  `impact.md` or a rule about who may see or change data, and `low` otherwise.
- `npm run check:spec -- <slug>` (`scripts/check-spec.sh`) checks the bookkeeping items of this gate
  mechanically — TS- and E2E- coverage, phases and Delivers, the six-file limit, open-decision
  wording, path existence, and Risk / Verify / Stop-if on every Step. It must print
  `SPEC-LINT: PASS` before the review packet is frozen; its warnings are read, not ignored.

## G9 Challenge — Phase 9 (BA ↔ SA)

- At least 3 substantive challenges, each resolved `Accepted`, `Rejected` (with reason) or `Open`.
- At least one challenge attacks Section 8: a step that hides a decision, an unordered dependency,
  a Verify that cannot fail.
- A review that finds nothing has failed the gate. Wording nits are not challenges.

## G10 Review — Phase 10

- Two artifacts (`spec-codebase-verifier`, `spec-cold-reader`) validated against the same frozen packet. `spec-traceability` is not part of the pipeline's round: `npm run check:spec` covers the id bookkeeping. `/enhance-this-spec` still runs all three when a human asks for a deeper review.
- Every Critical and Major finding has a disposition: **Applied**, **Documented** (risk, assumption or open question) or **Rejected with evidence**. Silence is not a disposition.
- Every applied revision has real replacement text, and the affected gates above were re-checked after it.
- One round. Anything still unresolved is decided by the writer and recorded as an `[auto]` Decision, or is in Open Questions if it is a stop condition.
- The packet files did not change between freeze and the reviewers returning (re-hash after the round).

## Reviewer mapping

| Reviewer agent | Re-checks | Gates |
| --- | --- | --- |
| `spec-traceability` | The matrix, counted independently — compound-rule clauses and orphans | G1, G4, G7, G-Exec |
| `spec-codebase-verifier` | Every "change / extend / already landed" claim and every cited safety-fact proof against the real repo | G2, G3, G4 |
| `spec-cold-reader` | Section 8 read as the implementer, with no other context | G-Exec |
