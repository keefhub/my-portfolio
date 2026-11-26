# Interview guide

How `/agentic-intent` draws the intent out of the owner. The owner is a business person: ask in
business words, one theme at a time, never in code terms. Questions are for what only the owner can
decide; anything the repo or the standing docs already answer is checked first and stated back
("the panel already has roles and permissions; I will assume this respects them, correct me").

## Before the first question: read, briefly

Read only what you need to ask well, and never `.env`:

- `docs/features/OVERVIEW.md` §§1–3, `CLAUDE.md` § Domain facts, `git log --oneline --grep="^feat("`;
- the dependency names in `package.json` (names only), `CLAUDE.md` § Invariants, and `git grep` for
  anything the goal touches;
- the other intent files in `docs/requirements/` (for overlap).

Then draft, privately, the **stop predictions**: every decision this goal would force that the pipeline
would halt on, so the interview can close them. Look for:

| Prediction | Triggered by |
| --- | --- |
| New dependency | a capability the installed libraries do not give (an outside service's client, a parser, a payment, a map) |
| New environment variable | any outside service, key, URL or feature switch |
| External service or provider | any data leaving the app, any model, mailer, storage or payment provider |
| Data store, sign-in or hosting change | a new kind of stored data, a different login, a file store, a scheduled job, a new runtime |
| Permission ruling | who may see or do the new thing, and whether it needs its own permission |
| Stored-data ruling | what is kept, for how long, who may read it, what is shown back |
| Cost or limit ruling | per-use cost, volume, size or time limits |

## Business themes, in this order

Cover each, in the owner's words. One round of at most four questions per theme; multiple choice with
your recommended option first wherever the options are knowable, open questions otherwise.

1. **The problem.** What do people do today? What does it cost (time, errors, money, risk)? What
   happens if nothing is built? If nothing exists today, what is the opportunity?
2. **Why now and success.** What changed? What would you notice in a month if it worked? Can that be a
   number, or at least a plain sign anyone could point to?
3. **People.** Who uses it, when, how often, with what at stake? Who is affected without using it?
   Who must not be able to use it?
4. **Rules.** What policies, approvals, limits or records does the business require? What is private?
   What is the business obliged to do or never allowed to do?
5. **What must never happen.** The worst outcome, in the owner's words. A wrong answer? A leak? A
   bill? A lost record? These become hard constraints.
6. **Scope.** What would you be surprised, or unhappy, to find built? What is related but not wanted
   now? (These are the non-goals.)
7. **Done.** If you sat in front of it, what would you do to be satisfied? Turn each answer into one
   observable sentence; read each back.
8. **What only you can do.** Secrets, accounts, approvals, judgement calls the agent must not make.

## Technical themes: only the significant ones

Only when a stop prediction fired. Ask in business terms, then record in §4:

- "This needs <capability>. The panel does not have it. Options: <A>, <B>. I recommend <A> because
  <business reason>. Approve it?"
- Why it is needed, what it changes for the business, what was ruled out and why, the cost or risk
  accepted. The owner decides; do not decide for them and do not approve on their behalf.
- Never ask about structure, files, components, naming or how to build it. That is the agent's.

## Technique

- **Probe vague answers.** "Better", "fast", "secure", "easy" each get "how would you tell?" and a
  testable rewrite offered for acceptance.
- **Reflect, then ask.** Restate what you heard in one line before the next theme, so a misread is
  caught early.
- **Surface conflicts.** When an answer contradicts the standing docs, an earlier answer, or an existing
  intent, say so and ask which wins. Standing context is not overridden silently.
- **Propose, don't dictate.** Offer constraints the standing context implies (permissions, privacy,
  cost) as a short list to accept, edit or drop.
- **Size for this app** (CLAUDE.md § Domain facts: a family business, two to three people, ceiling
  ten). Do not interrogate about concurrency, scale, multi-tenancy, compliance or the like; decide the
  simple way and note it under §8.
- **Stop asking when a theme is closed.** A theme with nothing to add is recorded as "None" with the
  owner's say-so, not skipped.

## The read-back

Before `ready`, write a plain-language summary of the whole intent, at most twelve lines, in the
owner's words: the problem, the people, the rules, what must never happen, the non-goals, what is
approved to be added, and the definition of done in one line each. Ask: "Is this what you mean, and is
anything missing or wrong?" Apply corrections and read back again. `ready` is only the owner's explicit
yes.
