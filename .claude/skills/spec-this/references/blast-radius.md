# Blast radius — Phase 3 safety facts

Adapted from the `blast-radius` skill in Lauren Tan's pstack (MIT,
`cursor/plugins/pstack/skills/blast-radius`), with the code-anchor step and evidence rules it
borrows from pstack's `why`. Upstream reviews a diff that already exists; here it runs **before**
any code is written, against the change the spec is about to plan. `/spec-this` Phase 3 runs it
after the impact entries are classified, and writes the result into `impact.md` § Safety facts.

Listing callers is not the job — Phase 2 and the impact table already did that, and grep does it
in a second. The job is the breakage grep won't show, and proving the one fact the plan depends on.

## Scope

Run it over every `change` entry in `impact.md`, plus any `add` entry that writes shared state (a
new persisted key or column, a new field in a stored item, a new endpoint or action, a new export from
a shared module). Skip a pure `add` that nothing else reads yet, and say so in one line.

## Don't trust your own writeup

A safety argument that sounds right reads exactly as convincing whether or not it is true. For each
fact the plan's safety depends on, get it as far down this ladder as is cheap, and record where it
stopped:

1. **Asserted.** You said so. Worth nothing on its own.
2. **Cited.** A real `file:line` in this repo, or the library's own source in the installed dependency directory.
3. **Walked.** You traced the failure case step by step and showed it can't be reached.
4. **Ran.** A throwaway script that imports the real code and fails loudly if you are wrong.
5. **Reproduced.** Observed in the running app (the dev command in `.claude/repo-profile.md`).

Level 4 is usually one small script. **Write it under the session scratchpad (or `/tmp`), never
inside the repo, and never commit it** — `/spec-this` writes no application code. Run it with
the repo's own script runner when one is available; if it isn't and installing it would change
the package manifest, stop at level 3 and say so. Paste the command and its output.

## Steps

1. **Anchor.** For each file in scope, record what the planned change does to it, including the
   part the plan won't spell out. Pull history the way pstack's `why` does:
   `git log --oneline -20 -- <file>`, `git blame -L <start>,<end> <file>` on the lines the change
   touches, `git log -1 --format=%B <commit>` for any commit that looks deliberate. A `(#123)` PR
   number in a subject can be read with `gh pr view` when the session has `gh`; otherwise note the
   number and move on.
2. **Find the one fact.** Most changes that look risky are safe because of a single fact — e.g.
   "`CartStore` is the only writer of the `cart.v1` key", or "`searchItems` is only called
   from server code, so adding a field to its query type can't reach the client bundle". Find
   that fact. If it holds, most of the risky cases clear at once. Spend the effort here, not on a
   long list of maybes.
3. **Look where grep stops.** Typical places, to be adapted to this repo's stack and to the
   invariants in `CLAUDE.md` § Never violate:
   - **Persisted shapes** — data already stored by earlier versions (a browser store, a database
     row, a file) and read back without validation. What does the new code do with the old shape?
   - **Process and trust boundaries** — what crosses between server and client, service and
     service, or user input and storage, and whether it survives serialisation.
   - **Degraded paths** — a flow that must keep working when a client script never loads, a
     cache is cold, or a dependency is down, if the repo promises that.
   - **Repo invariants** — every rule in `CLAUDE.md` § Never violate (shared vocabularies, route
     tables, stable function signatures) that the changed code might bypass.
   - **Timing** — initialisation order, first render before data loads, retries, effects or jobs
     that run twice.
   - **Library source** — read the pinned version's code in the installed dependency directory
     when the plan relies on its behaviour, rather than recalling it.
4. **Be honest about each risk.** Give it a real likelihood and a real cost. Keep confirmed risks.
   List the ones you checked and cleared separately. Cite a real `file:line`; a search that finds
   nothing is still an answer — record the search. Never invent a caller or an API.
5. **Prove the one fact** to level 4 when it is cheap. When it isn't, stop at the highest level
   reached and mark it `unproven` — a later Step's **Stop-if** must then name the observation that
   would falsify it.

## What goes into `impact.md` § Safety facts

Per file or change in scope:

| Change | Safety fact | Level reached | Proof |
| --- | --- | --- | --- |

`Proof` is the `file:line`, the walk, or the script command and its pasted output. Then:

- **Risks** — each: how it breaks, `file:line`, likelihood × cost, and how to check. A confirmed
  risk must reach Phase 4 as a `TS-` element or a Decision, or Open Questions with what it blocks.
- **Cleared** — what was checked and why it's fine, one line each.
- **Before merge** — the cheapest check that would catch the real bug, an e2e test wherever
  one can observe it; Phase 6 turns it into an `E2E-` row.
