# Decomposer brief

You are handed the path of one intent file. You write one document, `docs/requirements/<slug>.md`, in
the shape of [requirements-template.md](requirements-template.md). You write no story, no code and no
other file, and you never commit. You never ask a question: decide, and record the decision.

## Read, in this order, and stop as soon as you have what you need

1. The intent file, all of it.
2. `git log --oneline --grep="^feat("` (what is built, as opposed to specified).
3. `docs/features/OVERVIEW.md` §§1–4, and `CLAUDE.md` § Layout and § Domain facts.
4. `Reference.md` headings only (component tree, token catalog), to know what building blocks exist.
5. `git ls-files` and `git grep` for any
   claim about existing code. At most 3 existing `docs/features/<slug>/story.md`, only direct collisions.

Follow [help-discover-this Mode A](../../help-discover-this/SKILL.md) phases 1–4 (impact analysis,
vertical-slice split, the four sizing tests, slugs and order) as written there, with these changes:

- **No user gates.** Where a phase ends at a gate the user confirms, you confirm it against the intent
  file instead: restate the goal in one sentence and check it matches intent §1; check the split
  against the intent's non-goals and hard constraints.
- **Verify before you assert**, as there: check every claim about existing code against the tree.
- **Decide, don't ask.** Every question you would have raised becomes a line in `Decisions`, tagged
  `[auto]` with the option you took and one line of why, or `[human: intent §N]` when the intent already
  rules it. Size every decision for this app (CLAUDE.md § Domain facts); take the simple option.
- **Trace every slice to the intent.** A slice cites the intent lines it serves (goal, users,
  definition-of-done lines, hard constraints). A slice that serves none is dropped. A
  definition-of-done line or hard constraint that no slice serves is a gap: add the slice or put the
  line under `Open findings`.
- **Non-goals are walls.** If serving a line would need a non-goal, put the line under `Open findings`.
- **Check pre-approved decisions (intent §4) per slice.** List each slice's needs: new dependency, new
  environment variable name, external service, other guessed choice. A need that §4 does not approve
  marks the slice `BLOCKED: <what it needs>`, and so every slice that depends on it.
- **Human-only items (intent §7)** are listed under `Human-only`; no slice attempts them.
- **Order** is dependency order, earliest dependency first, one line of why each. A cycle means the
  split is wrong. Slices are placed after the last existing row of the `CLAUDE.md` order table; never
  between or before existing rows.
- Slugs are free (`ls docs/features/<slug>` finds nothing), kebab-case, and never encode order.

## Stop instead of writing

Reply `STOP <reason>` (after writing what you found into the document's `Open findings`, if it exists)
when:

- the intent contradicts `OVERVIEW.md` §2 or §3, or contradicts itself;
- the goal cannot be split without a layer-only "foundation" slice nobody could act out in the app;
- no slice is runnable (every one BLOCKED).

## Reply

One line: `DONE <n> slices, <b> blocked`, or `STOP <reason>`.
