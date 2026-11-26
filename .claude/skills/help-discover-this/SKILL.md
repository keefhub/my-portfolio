---
name: help-discover-this
description: "Use when a requirement arrives as plain prose rather than a spec — a layman ask, a one-line feature request, a stakeholder sentence, 'users should be able to X', 'can we add Y' — and it needs impact analysis against this codebase, splitting into right-sized features, and Gherkin scenarios whose edge cases were brainstormed with the user rather than guessed. Also use when a request is too big for one feature file, or when adding any new docs/features/<slug>/story.md. Not for analysing a story that already exists — that is /spec-this."
---

# /help-discover-this

Turns one plain-language requirement into the input the rest of the pipeline needs: an impact analysis, a decomposition into right-sized features, and — one invocation per feature — a `docs/features/<slug>/story.md` whose Gherkin scenarios were **confirmed by the user**, not inferred.

This skill is **stage 0** of the workflow in [CLAUDE.md](../../../CLAUDE.md) § AI Agent Implementation Workflow:

```
layman requirement -> /help-discover-this -> docs/features/<slug>/story.md
                                         -> /run-this (/spec-this -> /do-this -> pull request)
```

It writes requirement documents and feature files. That is the entire deliverable.

## Usage

```
/help-discover-this "users should be able to export a report as CSV"   # Mode A — decompose
/help-discover-this export-report-as-csv                            # Mode B — author one feature
/help-discover-this                                                       # ask which
```

| Argument              | Mode                       | Deliverable                                              |
| --------------------- | -------------------------- | -------------------------------------------------------- |
| Prose (a phrase/para) | **A — Decompose**          | `docs/requirements/<requirement-slug>.md`, then **stop** |
| A bare feature slug   | **B — Author** one feature | `docs/features/<slug>/story.md` + index updates          |
| None                  | —                          | Ask which mode; never guess                              |

Mode A never writes a story. Mode B never handles two features. A requirement that yields four features therefore costs one Mode A run and four Mode B runs — that separation is the point, not an inefficiency to optimise away.

## Hard rules

1. **No code.** No application code, no `package.json` change, no dependency, no commit. If the requirement seems trivial enough to just implement, that is still not this skill's job.
2. **One feature per Mode B invocation.** Inherited from `/spec-this`: analysis quality collapses when several specs are held in context at once.
3. **No story file until the user has confirmed the scenario list.** Not a summary of it — the list.
4. **No batch-reading `docs/features/`.** Mode A may open at most **3 named existing story files** it has identified as direct collisions. Everything else comes from `OVERVIEW.md`, `CLAUDE.md`, the design-system doc if the profile names one, `git log`, and the real file tree.
5. **Every taxonomy category is closed explicitly** — with scenarios, or with `N/A — <reason>`. Skipping one silently is the failure this skill exists to prevent.
6. **Business language only in scenarios.** A `Scenario:` step never names a React component, hook, file path, library, CSS class, database table/column, or storage key. Assert what the user sees or what survives a refresh.
7. **A conflict with `OVERVIEW.md` §2 or §3 stops the run and asks.** Standing context is not overridden silently.
8. **Size every question for this application.** It is an internal admin panel used by at most five people for now (`CLAUDE.md` § Domain facts); it will be scaled when more people use it. A candidate that only matters at enterprise scale is **yours to decide, not the user's to answer**: heavy concurrency and simultaneous edits, very long lists and their performance, multi-tenancy, SSO, compliance-grade audit trails, rate limits beyond what is built, internationalisation, offline use, bulk operations nobody asked for. Take the simple option, and write it into `## Assumptions`, `## Out of Scope` or `## Deferred` with one line of why. Ask the user only what changes what is stored, who may see or change it, or what a person using the panel actually sees.

## Mode A — impact analysis and decomposition

Six phases, each ending at a gate. A gate that fails does not advance.

| #   | Phase                | Gate              | Passes when                                                                                    |
| --- | -------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| 0   | Intake               | **A0 Understood** | The user has confirmed a one-sentence restatement of the requirement                           |
| 1   | Impact analysis      | **A1 Verified**   | Every claim about existing code was checked against the tree (how-explore run, or skipped with the reason); conflicts surfaced, not resolved |
| 2   | Vertical-slice split | **A2 Split**      | Every slice has one user goal and is independently demonstrable in the running app             |
| 3   | Sizing               | **A3 Sized**      | Every slice passes all four sizing tests, or was re-split until it does                        |
| 4   | Slugs & order        | **A4 Placed**     | Each slice has a unique slug, a build position, and a one-line rationale                       |
| 5   | Approval & write     | **A5 Approved**   | The user approved the breakdown; the prose pass ran; the document is written; the run has stopped |

### Phase 0 — Intake (gate A0)

Restate the requirement in **one sentence** and ask whether that is what they mean. Do not analyse first. A misread requirement wastes every phase after it.

If the requirement is genuinely one small change to behaviour that already exists, say so and offer the alternative: amend the existing `docs/features/<slug>/story.md` instead of creating a new one. Creating a feature for a clause that belongs in an existing file fragments the acceptance criteria.

### Phase 1 — Impact analysis (gate A1)

Read, in this order — and stop as soon as you have what the analysis needs:

- `git log --oneline --grep="^feat("` — what is **actually built**, as opposed to specified.
- `docs/features/OVERVIEW.md` §§1–4 — standing context, plus the §4 index, which gives you every existing feature's title without opening any of them.
- `CLAUDE.md` § Layout and § Domain facts.
- The design-system or architecture doc, if `.claude/repo-profile.md` § Feature docs names one — the existing building blocks a slice can reuse.
- The real tree: `git ls-files`.
- At most **3** existing `docs/features/<slug>/story.md` you have named as direct collisions.

**Unmapped subsystem → how-explore.** If the requirement reaches code those docs don't explain well enough to mark a module `read` or `write` with evidence, run the procedure in [references/HOW-EXPLORE.md](references/HOW-EXPLORE.md) before writing the analysis: one read-only subagent for a narrow question, 2–3 parallel explorers plus one explainer for a flow that crosses layers. Skip it when the docs already answer the question, and say which.

Then produce:

- **Touched modules** — a table of existing files or directories this requirement reaches, each with the reason. Mark every row `read` or `write`.
- **New surface** — new persisted keys, columns or files, or a change to the shape of data already stored; new fields on the domain types; new modules, services, endpoints or jobs; new screens or components. A new storage key, persisted field, or module boundary is the strongest signal that a slice is its own feature.
- **Migration risk** — does existing persisted data need a shape change? Name what is persisted today (`CLAUDE.md` § Domain facts) and whether the repo has a migration mechanism — say what happens to data already in the wild. If the slice introduces the first database, a persisted record the system did not keep before, or an outbound message such as email, call that out as new infrastructure (check OVERVIEW §3 assumptions), not a detail.
- **Standing-context conflicts** — anything contradicting `OVERVIEW.md` §2 Confirmed Requirements or §3 Assumptions. **Surface these to the user and stop.** Do not pick a side.
- **What already covers part of this** — if a built feature already does some of it, say which part, so the decomposition does not re-specify it.

**Verify before you assert.** Marking a file "changed" when it does not exist, or claiming a dependency has landed when no `feat()` commit says so, sends the whole downstream chain after something that was never written. Check, then write what you found.

### Phase 2 — Vertical-slice split (gate A2)

Split by **user goal**, never by layer. Each slice must be a thing a user can do.

| Split this way                                                  | Not this way                                       |
| --------------------------------------------------------------- | -------------------------------------------------- |
| "Export a report as CSV" / "Choose which columns the CSV includes" | "Add a CSV serialiser module" / "Build the export button" |
| One CRUD step per slice, when each step is separately useful    | All of create+read+update+delete in one slice      |
| A read-only view separated from the editing flow                | A slice that only writes data nothing reads yet    |

A slice that produces no user-observable behaviour is not a feature — it is a task, and `/spec-this` will create it as a Step of the feature that needs it. Never emit a "foundation" feature whose scenarios a user could not act out.

### Phase 3 — Sizing (gate A3)

Every slice passes **all four**:

1. **One primary user goal** — expressible as a single `As a … I want … So that …`.
2. **≤ ~7 scenarios estimated**, including the edge cases Mode B will find.
3. **Independently demonstrable** in the running app once built.
4. **At most one new storage key, database table/column, or module boundary.**

Fail any test → re-split. Two slices that each fail test 3 on their own usually want merging; one slice failing tests 2 and 4 wants splitting.

### Phase 4 — Slugs and build order (gate A4)

- Slug = kebab-case of the feature title. It must be free: `ls docs/features/<slug>` must find nothing. The slug is the feature's permanent identity — folder name, commit scope, and `/spec-this` argument — so pick it once.
- **Build position** — where each slice lands in the order table in [CLAUDE.md](../../../CLAUDE.md), with one line of why. Dependencies may only point at already-built features or earlier-placed new slices. A cycle means Phase 2 split wrongly.

### Phase 5 — Approval and write (gate A5)

Present the breakdown — one line per slice: slug, title, user goal, scenario-count estimate, dependencies, build position. Get approval. Run the prose pass in [references/UNSLOP.md](references/UNSLOP.md) over the document. Then write `docs/requirements/<requirement-slug>.md` (no date in the name; put the date in the header) containing the confirmed restatement, the impact analysis, the slice table, the rejected splits and why, and the open questions.

Then **stop**, and print the next commands:

```
/help-discover-this export-report-as-csv         # Export a report as CSV
/help-discover-this choose-csv-columns            # Choose which columns the CSV includes
```

Do not continue into Mode B in the same run, even if asked to "just keep going" — a sweep run against a context already full of decomposition reasoning is the shallow sweep this skill exists to avoid. Offer instead to stop here so the next run starts clean.

## Mode B — brainstorm and author one feature

| #   | Phase          | Gate             | Passes when                                                                         |
| --- | -------------- | ---------------- | ----------------------------------------------------------------------------------- |
| 0   | Load           | **B0 Loaded**    | The slice entry and standing context are loaded; no other raw feature file was read |
| 1   | Happy path     | **B1 Confirmed** | The user confirmed the goal and the primary scenario                                |
| 2   | Taxonomy sweep | **B2 Swept**     | All 10 categories closed with scenarios or `N/A — <reason>`                          |
| 3   | Draft review   | **B3 Reviewed**  | The user reviewed the full scenario list, in Gherkin, and approved it                |
| 4   | Write          | **B4 Written**   | Prose pass ran; `docs/features/<slug>/story.md` matches the output recipe exactly    |
| 5   | Index updates  | **B5 Indexed**   | `OVERVIEW.md` §4 and §2 and the `CLAUDE.md` order table all updated                  |

### Phase 0 — Load (gate B0)

Read the slice's entry in its `docs/requirements/` document, plus `docs/features/OVERVIEW.md` §§1–3. If no decomposition document lists this slug, ask whether to run Mode A first — authoring a feature with no impact analysis behind it is guessing.

Do not open another `docs/features/<other-slug>/story.md`. If a neighbour is a dependency, read its `docs/features/<other-slug>/spec.md` if one exists; otherwise record the dependency as an assumption.

### Phase 1 — Happy path first (gate B1)

Present, and get confirmed, before touching edge cases:

- the one user goal, as `As a … I want … So that …`
- the **primary scenario** in Given/When/Then
- the data it reads and writes, in business terms

Edge cases brainstormed against an unconfirmed happy path get thrown away.

### Phase 2 — Taxonomy sweep (gate B2)

**The core of this skill.** Walk all ten categories in [references/EDGE-CASE-TAXONOMY.md](references/EDGE-CASE-TAXONOMY.md) — that file carries generic candidate prompts plus a section for this repo's own domain prompts, which the repo owner fills in. Read it before sweeping.

| #   | Category                    | The question it forces                                            |
| --- | --------------------------- | ----------------------------------------------------------------- |
| 1   | Empty & zero state          | What shows before any data exists? Is zero different from absent? |
| 2   | Boundaries & precision      | Min, max, first, last, longest, rounding                          |
| 3   | Invalid & malformed input   | What can the user type that must be refused, and how?             |
| 4   | Duplicates & collisions     | Same record twice, spelling variants, request sent twice          |
| 5   | State & lifecycle conflicts | Record retired or changed underneath the user, mode switches      |
| 6   | Persistence failure         | Storage blocked, corrupt data, older shape, a server call fails   |
| 7   | Navigation & interruption   | Refresh, back, unsaved input, deep link to a deleted record       |
| 8   | Offline & time              | Offline after load, time zones, deadlines, stale data             |
| 9   | Presentation & scale        | Long lists, phone vs desktop, long values, keyboard & screen reader |
| 10  | Multi-actor & permissions   | Two tabs or users, roles, anything shared or sent to someone else |

For each category, work out **2–4 concrete candidates**, then sort them:

- **Decide it yourself** when the answer is clear for a five-person internal tool (hard rule 8), when the standing context or an earlier feature already settles it, or when one option is plainly the simple, safe one. Mark it in scope, out of scope or deferred, with one line of why.
- **Ask the user** only when the candidate changes what is stored, who may see or change something, or what the user sees, and the requirement and standing context do not settle it.

Put everything you ask into **one batch for the whole sweep**, as multiple-choice questions with your recommended option first. Aim for no more than about five questions per feature; a sweep that needs none is fine. Do not ask category by category.

Then show the user what you decided on their behalf, as a short list they can overrule in one reply. A decision they do not object to stands.

Close every category. `N/A — this feature persists nothing, so there is no failure mode` is a perfectly good close; leaving category 6 unmentioned is not.

### Phase 3 — Draft review (gate B3)

Write the full Gherkin — happy path plus one `Scenario:` per in-scope edge case — and show it. Use `Scenario Outline` + `Examples` where behaviour varies only by data. Get explicit approval for the scenario list before writing anything into `docs/features/`.

### Phase 4 — Write the file (gate B4)

The file is these parts, in this order, and nothing else:

1. `# Title` — title in Title Case.
2. One fenced `gherkin` block: the `Feature:` line, the `As a / I want / So that` three-liner, then every `Scenario:` — happy path first, edge cases after, in taxonomy order.
3. `## Assumptions` — numbered. Anything decided during the sweep that the requirement did not state.
4. `## Out of Scope` — bulleted. What a reader would reasonably expect that this feature does not do.
5. `## Deferred` — bulleted. Deferred candidates, each with the reason it was deferred.

An empty section is written as `None.` — never deleted. A missing section reads as an unasked question. See [references/FEATURE-FILE-TEMPLATE.md](references/FEATURE-FILE-TEMPLATE.md) for the exact shape.

Before writing, run the prose pass in [references/UNSLOP.md](references/UNSLOP.md) over Assumptions, Out of Scope and Deferred. It never touches the approved Gherkin block and never changes what an item means.

### Phase 5 — Index updates (gate B5)

Three edits, all required:

| File                      | Edit                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `docs/features/OVERVIEW.md` §4 | Append the row: title, link to the new story file                                                   |
| `docs/features/OVERVIEW.md` §2 | Append decisions confirmed in the sweep that later features must inherit as standing context             |
| `CLAUDE.md`               | Insert the row in the implementation-order table, with its "why it goes here"                            |

Append to §2 only what is genuinely standing context — a decision later features would otherwise re-litigate. Feature-local detail belongs in the feature file, not in §2.

Then report the path and offer the next stage. `/run-this` takes the story through spec, build and pull request with this session as the orchestrator, handing each stage the path of the last one's output. Start it only when the user says to: they vet the story first.

```
/run-this export-report-as-csv
```

## Rationalization table

| Excuse                                                      | Reality                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| "This requirement is small, one feature file is fine"       | Run the sizing tests. If it passes all four as one slice, Mode A says so in one line and you have lost nothing.                    |
| "I can decompose and write all four files in this run"      | Rule 2. The fourth sweep on a full context is the shallow sweep this skill exists to prevent.                                      |
| "The edge cases are obvious, I'll write them in"            | The user's app, the user's call. Propose; let them rule.                                                                            |
| "Category 6 doesn't really apply here"                      | Then write `N/A — <reason>`. That takes four words and is auditable.                                                                |
| "The user said just write it"                               | Confirm the scenario list first — it is one message. Then write it.                                                                 |
| "I'll note the storage key or column name in the scenario so it's clear" | Rule 6. Those are `/spec-this` output, not acceptance criteria.                                                     |
| "This conflicts with OVERVIEW §2, but my version is better" | Rule 7. Surface it and stop. Changing standing context is the user's decision.                                                       |
| "It's faster to implement this than to specify it"          | Rule 1. This skill's output is the specification.                                                                                    |

## Red flags — stop

- About to write a story file without an approved scenario list
- About to open a fourth existing story
- A taxonomy category with no scenarios and no `N/A` line
- A proposed slice whose scenarios a user could not act out in the app
- A `Scenario:` step containing a file path, component name, hook, storage key, or database column/table
- Continuing from Mode A into Mode B in one run
- Writing app code, installing anything, or committing
- The prose pass rewording an approved `Scenario:` or changing what an assumption says

## Common mistakes

- **Layer slices.** "Add the data model" is a plan task, not a feature. Split by what the user can do.
- **Sweeping before confirming the happy path.** Everything after it gets rewritten.
- **One mega-scenario.** A scenario asserting three independent things cannot fail informatively — split it.
- **Padding a thin feature.** Three genuine scenarios beat nine ceremonial ones; `/spec-this` has a thin-feature shortcut for exactly this case.
- **Encoding build order in the slug.** Slugs name the feature; build position lives only in the CLAUDE.md order table.
- **Silently answering your own questions.** The value here is the user's ruling, not your guess.
