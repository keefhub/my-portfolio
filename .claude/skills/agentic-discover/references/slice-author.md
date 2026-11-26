# Slice author brief

You are handed the path of an intent file, the path of its decomposition document, and one slice slug.
You write exactly one story, `docs/features/<slice-slug>/story.md`, make the three index edits, and
reply with one line. No code, no commit, no dependency, no other story. You never ask a question.

## Load

Read the intent file, the decomposition document (your slice's row and its intent citations, the
`Decisions` that touch it, and `Run order`), `docs/features/OVERVIEW.md` §§1–3, and `CLAUDE.md`
§ Domain facts. Do not open another `docs/features/<other-slug>/story.md`; for a dependency read its
`spec.md` if one exists, else record it as an assumption.

If your slice, or a slice it depends on, is marked BLOCKED, or you find it needs something intent §4
does not approve, reply `BLOCKED <what is needed>` after adding that to the decomposition document
under the slice's row. Write no story.

## Write the story

Follow [help-discover-this Mode B](../../help-discover-this/SKILL.md) from phase 1, with these changes:

- **The happy path** comes from the slice's goal and the intent lines it cites. There is no user to
  confirm it; check it against those lines instead.
- **Sweep all ten categories** of
  [EDGE-CASE-TAXONOMY.md](../../help-discover-this/references/EDGE-CASE-TAXONOMY.md). Close every one
  with scenarios or `N/A — <reason>`. You may not leave one unmentioned.
- **Every candidate you would have asked the user about, you decide.** Take the simple, safe option for
  this app (CLAUDE.md § Domain facts, rule 8 of `/help-discover-this`). Record it as a numbered
  `## Assumptions` line ending `[auto]`, or `[human: intent §N]` when the intent already rules it.
  Never override a `[human]` decision, and never a hard constraint.
- **Cover the intent.** Every definition-of-done line the slice serves has at least one scenario that
  asserts it from the outside. Every hard constraint that applies has at least one **negative**
  scenario (the thing that must not happen, and what the person sees instead).
- **Respect the non-goals.** Anything the intent lists as a non-goal goes under `## Out of Scope`.
- **Size** the story by the four tests of `/help-discover-this` Mode A phase 3. A story that needs more
  than about seven scenarios or more than one new storage key or module boundary means the
  decomposition is wrong: reply `STOP slice too large: <why>`.
- **Scenarios are business language only**, exactly as in
  [FEATURE-FILE-TEMPLATE.md](../../help-discover-this/references/FEATURE-FILE-TEMPLATE.md): no
  component, hook, file path, library, class, table, column or storage key; use the interface's own
  words from `Reference.md`.
- **Output shape** is that template to the letter: title, one `gherkin` block, `## Assumptions`,
  `## Out of Scope`, `## Deferred`; an empty section is `None.`. Run the prose pass of
  [UNSLOP.md](../../help-discover-this/references/UNSLOP.md) over the three sections, never the Gherkin.

## Index edits (append only)

| File | Edit |
| --- | --- |
| `docs/features/OVERVIEW.md` §4 | Append the row: title, link to the story |
| `CLAUDE.md` | Append the row to the implementation-order table, at the end, with its "why it goes here" from the decomposition document |
| `docs/features/OVERVIEW.md` §2 | Only a decision that the intent itself rules and later features must inherit, as `[human: intent §N]`. Never an `[auto]` decision. |

Never edit or reorder an existing row.

## Reply

One line: `DONE <n> scenarios`, `BLOCKED <what is needed>`, or `STOP <reason>`.
