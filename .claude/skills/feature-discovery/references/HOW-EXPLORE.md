# How-explore — mapping an unfamiliar subsystem

Adapted from the `how` skill in Lauren Tan's pstack (MIT, `cursor/plugins/pstack/skills/how`).
Used by `/feature-discovery` Mode A Phase 1 when the requirement reaches code that `CLAUDE.md`
§ Layout / § Domain facts and the design or architecture doc (if the profile names one) don't already explain well enough to
classify every touched module as `read` or `write`.

**Skip it when those docs already answer the question.** Most requirements won't need
it. Running it to look thorough is the failure mode; running it because a Phase 1 claim would
otherwise be a guess is the point.

## The question

Phrase one question about the existing code, tied to the requirement:

- "How does a report row get from the filter form into the export, and what stores the filters?"
- "Where should CSV serialisation live, and which layer owns download responses?"

Placement and ownership questions ("where should this live", "which module owns this") are in
scope; they feed the slice split in Phase 2.

## 1. Assess complexity

- **Simple** — one module, one component, one narrow question. Spawn **one** subagent that
  explores and explains in one pass, using the explainer prompt below with the "Explorer
  findings" section removed. Go to step 4.
- **Complex** — a flow spanning several files or layers (for example filter form → report →
  export → download). Go to step 2.

When in doubt, take the simple path.

## 2. Explore (complex only)

Split the question into **2–3 angles**, each a distinct slice (e.g. "data and queries", "client state and storage", "routes and server actions" — named after the layers in `CLAUDE.md` § Layout).
Spawn all explorers in **one message**, each an `Agent` call with `subagent_type: "Explore"`,
foreground, built from the explorer prompt below. Tell each one not to edit files.

## 3. Synthesize (complex only)

Once every explorer has returned, spawn **one** `general-purpose` subagent, foreground, with the
explainer prompt and every explorer's findings pasted in. Tell it not to edit files.

## 4. Use the result

Do not paste the explanation into the requirements document. Use it to fill Phase 1's **Touched
modules**, **New surface** and **Migration risk** with `file:line` evidence, and keep its
**Open questions** — they go into the requirements document's open questions, not into a guess.

---

## Explorer prompt

```
Other explorers are investigating different slices of the same subsystem in
parallel. Don't try to cover everything. Focus on your assigned angle and go
deep. Read only — do not create, edit or delete any file.

QUESTION
{{the question}}

YOUR ANGLE
{{the angle}}

Report:
- Components found — each key type, function, component or module: name,
  file path, one sentence on what it does.
- Flow — the execution flow step by step: what runs, in which file, what it
  does, what it calls next, and the data passed between steps.
- Files read — every file you opened.
- Boundaries — where this slice connects to the rest of the codebase; inputs
  and outputs.
- Non-obvious things — anything surprising or easy to get wrong.
- Open questions — anything you couldn't trace. Be honest about gaps.
```

## Explainer prompt

```
You are writing an architectural explanation for a senior engineer about to
plan a change. Read only — do not create, edit or delete any file.

QUESTION
{{the question}}

EXPLORER FINDINGS
{{every explorer's report, verbatim — omit this section on the simple path,
  and explore the code yourself instead}}

The explorers' findings may overlap or contradict. Reconcile them, checking
the code yourself where they disagree. Use Read, Grep and Glob as needed.

Write, dropping any section that doesn't apply:
- Overview — 1–2 paragraphs: what this is and what it does.
- Key concepts — the types, modules or abstractions needed to follow the rest.
- How it works — the flow step by step, in prose, naming real files and
  functions. A small diagram only if it clarifies.
- Where things live — the files someone would need to start working here.
- Gotchas — non-obvious behaviour and pitfalls.
- Open questions — what couldn't be confirmed.

Use concrete language: "`FilterStore` writes the `report.filters.v1` key on every
change", not "the store handles persistence".
```
