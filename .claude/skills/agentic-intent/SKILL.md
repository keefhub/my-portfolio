---
name: agentic-intent
description: "Interview the owner and write the intent file that starts an autonomous run: docs/requirements/<slug>-intent.md, created from the reference template. It captures the goal thoroughly from the business point of view (the problem and its cost, why now and what success looks like, the users, the business rules, what must never go wrong), the non-goals, the hard constraints and an observable definition of done, and records technical decisions only when the goal needs a significant dependency or infrastructure change (those become the pre-approved decisions that let the later run proceed without asking). Ends with a read-back the owner must confirm before the file is marked ready. Use when asked to start an autonomous or hands-off feature, define goals and a definition of done, or write or refine an intent file. Does not decompose the goal into features (agentic-discover), does not write code, and never commits."
---

# /agentic-intent

The one conversation in an autonomous run. The owner is asked here so that nobody is asked later: everything the pipeline would otherwise stop and ask about is either settled in the intent file or becomes a draft pull request. The file is feature-agnostic; the interview is an interview, not a form.

```
/agentic-intent <slug>      # interview the owner and write docs/requirements/<slug>-intent.md
/agentic-intent <slug> edit # refine an existing intent file, and read it back again
```

## Procedure

1. **Slug.** Kebab-case, names the goal, never changes. If `docs/requirements/<slug>-intent.md` exists and the user did not say `edit`, stop and offer `edit`.
2. **Create the file** by copying [references/INTENT-TEMPLATE.md](references/INTENT-TEMPLATE.md) verbatim to `docs/requirements/<slug>-intent.md`, every section present. Never write an intent file free-hand.
3. **Prepare.** Follow [references/INTERVIEW-GUIDE.md](references/INTERVIEW-GUIDE.md) § Before the first question: read the standing docs and the repo briefly, and draft the stop predictions. Do not read `.env`.
4. **Interview** the owner theme by theme, in the guide's order, in business words. Use `AskUserQuestion` for choices (recommended option first); ask open questions in plain chat. Write each section as its theme closes, from the owner's own answers: record what they said, tightened, never invented. Reflect each theme back in one line before the next.
5. **Close the stop predictions.** Every prediction that fired is asked about in business terms and recorded in §4 (approved, with reason, alternatives ruled out, cost or risk accepted), or ruled out in §3 or §5, or left to the agent with the owner's explicit say-so.
6. **Check** the file against [references/INTENT-TEMPLATE.md](references/INTENT-TEMPLATE.md) § Quality bar, items 1–9. A failed check goes back to the owner as a question, never fixed silently.
7. **Read back** the whole intent in at most twelve lines and ask whether it is what they mean and whether anything is missing or wrong. Apply corrections and read back again. Only the owner's explicit yes sets `Status: ready`.
8. **Report** the file path, any section marked `TODO`, the stop predictions closed, and the next command: `/agentic-discover <slug>`.

## Rules

- **Business first.** §1 and §2 capture the problem, why now, the people, the rules and what must never happen, in business words, thoroughly. A vague answer is probed until it is observable; do not move on with "better" or "secure".
- **Technical only where it is significant.** Technical content lives in §4 alone and only for a significant change to dependencies or infrastructure (a new library, service, data store, sign-in or hosting change). Never ask or record design, files, components, screens or how to build it.
- **Goal level only.** The file never lists features, slices, screens or tasks, and the interview never brainstorms scenarios or edge cases; that is `/agentic-discover`'s, autonomously.
- **Pre-approved decisions are the safety boundary.** Whatever the pipeline would otherwise stop on is allowed only if the owner approved it here, in §4. Never add, widen or infer an entry; never approve on the owner's behalf. Anything not listed still stops the run.
- **Secrets are never in the file.** Only names and where the owner sets them; the values are the owner's, and are §7 human-only items.
- **Every definition-of-done line is observable from outside** and testable without reading the code; a line that is not is rewritten with the owner or moved to §7.
- **Size questions for this app** (CLAUDE.md § Domain facts). Ask the owner only what changes what is stored, who may see or do something, what a person sees, what it costs, or what is approved to be added. Decide scale concerns the simple way and note them in §8.
- **Standing context is not overridden.** A conflict with `docs/features/OVERVIEW.md` §2 or §3, with an earlier answer, or with another intent file is raised and ruled on by the owner.
- Writes one file. Never touches `CLAUDE.md`, `.env`, the story or spec folders, and never runs `git add` or `git commit`.
