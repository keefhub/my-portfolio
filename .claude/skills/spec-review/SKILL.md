---
name: spec-review
description: "Review an existing /feature-spec output (spec.md plus impact.md) through a diamond fan-out: one frozen packet, three isolated read-only reviewer agents in parallel (spec-traceability, spec-codebase-verifier, spec-cold-reader), one reconciliation, then an in-place rewrite of spec.md — at most 2 rounds. Phase 10 of /feature-spec already runs this procedure, so invoke it directly only to re-review a spec that was edited afterwards or written before Phase 10 existed. Not for creating a spec from scratch."
---

# /spec-review

One diamond: a single divergence point (the frozen packet), three isolated parallel reviewers, one convergence point (you). Everything below serves two properties:

- **Comparability** — all reviewers diverge from the same immutable packet, so their findings describe the same document and their disagreements are meaningful.
- **Independence** — reviewers never see the writer's reasoning or each other's output, and none of them edits anything. A reviewer who reads another's critique is anchored by it, silently turning three reviews into one review with two echoes.

Creating a spec is [`/feature-spec`](../feature-spec/SKILL.md)'s job, and its Phase 10 runs the round procedure below automatically — so you do **not** run `/spec-review` after `/feature-spec`. Invoke this skill directly only to re-review a spec that was edited afterwards, or one written before Phase 10 existed. Every criterion a reviewer applies is in [`../feature-spec/references/gates.md`](../feature-spec/references/gates.md) — it is the single source, so a criterion changes there or nowhere.

## Usage

```
/spec-review export-report-as-csv   # reviews docs/features/export-report-as-csv/spec.md
/spec-review                       # infer from conversation; ask if ambiguous
```

Resolve the slug with `ls docs/features/<slug>`. **If `spec.md` does not exist, stop and say so** — offer `/feature-spec`; never generate one to have something to review. **If `impact.md` is missing**, stop. Either the spec is a thin-feature note — it has no Section 8 to cold-read and no impact entries to verify, and the review costs more than the feature — or it is a full spec written before `impact.md` existed, in which case run `/feature-spec <slug>` in revision mode first.

## Reviewers

| Agent | Model | Reads | Checks |
| --- | --- | --- | --- |
| `spec-traceability` | sonnet | the full packet | the matrix, rebuilt independently; compound-rule clauses and orphans counted |
| `spec-codebase-verifier` | sonnet | the full packet + the repo (git read-only) | every change / extend / already-landed claim against the real repo |
| `spec-cold-reader` | sonnet | `spec.md` only + the repo | Section 8 as the implementer with no other context |

Models are fixed in the agent definitions in [`.claude/agents/`](../../agents/). Every subagent is Sonnet (see `.claude/repo-profile.md` § Models); do not pass a higher `model` at dispatch. All three are read-only.

## Round procedure

### 1. Freeze the packet

1. Read `spec.md` in full; do not edit it yet.
2. The packet is `docs/features/<slug>/spec.md`, `impact.md`, `story.md`, and the standing context (OVERVIEW §1–3, at the path `.claude/repo-profile.md` § Feature docs gives).
3. Compute `sha256sum` of each file and note it with the spec's `Version` and `Date`. The packet is these paths plus hashes; there is no copy and no scratch directory — run state never leaves the feature folder.
4. **Do not touch any packet file until the round's reviewers have returned.**

### 2. Fan out

Dispatch all three reviewers in **one message** as blocking foreground `Agent` calls (`subagent_type` = the agent name, `model: sonnet`). Do not background them and do not end your turn while one is running. Do not stagger: prompting one reviewer after seeing another's output leaks conclusions.

Each prompt contains only: the packet paths, their hashes, the spec's `Version` and `Date`, the repository root, and one line naming its role. The cold reader gets only the `spec.md` path, its hash, and its `Version` and `Date`. **No writer reasoning** — no phase notes, no summary of what the spec "is trying to do", no hint about known weak spots — and **no output from another reviewer**.

If parallel subagents are unavailable, run them sequentially with the same untouched packet and disclose the degradation in the report. Never merge the three into one pass.

### 3. Validate

Bind results by agent name, never by completion order. Reject an artifact that is missing, truncated, names the wrong role, echoes different hashes or a different spec version, lacks its findings table, or lacks its **Checked and sound** list. Retry only the failed reviewer, one tier up if it failed on capability, from the **original** packet. Then re-run `sha256sum` on the packet files: any change means the round is void — refreeze and start the round again.

### 4. Reconcile before you rewrite

Build this table in the conversation **before** touching the spec:

| # | Finding | Severity | Raised by | Spec quote | Agreed? | Resolution | Confidence | Target section |

One row per distinct finding. Merge duplicates raised by more than one reviewer and note the agreement — a strong signal. Keep contradictions between reviewers as separate rows. Resolve by this ladder:

1. Verified code (`file:line`) outranks anything the spec asserts about the code.
2. A concrete failure scenario outranks a general worry.
3. Two reviewers disagreeing becomes a **named open question** — never a blended middle.
4. Every Critical and Major finding gets a disposition: **Applied**, **Documented** (a risk, assumption or open question) or **Rejected with evidence**. Silence is not a disposition. Minor findings may be batched but not dropped silently.
5. A finding that would change the feature's scope or cost is **surfaced to the user as a question**, not absorbed. State what it blocks.

A finding and its suggested fix are separable. Accepting that a gap is real does not oblige you to accept prose that invents an answer the story does not support — record the gap as an open question and say so.

### 5. Apply — rewrite `spec.md` in place

Reviewers only report. You apply accepted revisions by following `/feature-spec`'s **Revision mode**, the one procedure for amending these files: read both files, amend in place, preserve resolved Open Questions and contrarian outcomes, re-run the affected phases and every phase downstream of them, and re-check each affected gate in `references/gates.md`. Do not edit before all of these hold:

- three artifacts validated against the same packet;
- every Critical and Major finding has a disposition;
- every applied revision has actual replacement text, not a note that something should change;
- every remaining claim about existing code carries a `file:line` citation;
- no `TBD` or unresolved placeholder is introduced.

Then rewrite: preserve section order and any `<!-- MANUAL -->` blocks verbatim; apply revisions **inline in the sections they belong to** — never append a list of corrections; update `impact.md` too when a finding lands there; bump the minor `Version` and add a Version history row; keep requirements sections technology-agnostic. Append two tables to `spec.md`: **Review Findings** (Finding | Severity | Raised by | Disposition | Evidence | Where applied) and **Open Questions** (Question | What it blocks | Who decides). Where a reviewer *confirmed* claims as accurate, say so in Review Findings — a review that records only defects misrepresents the document.

## Rounds

**At most 2 rounds.** If round 1 applied any Critical or Major revision, run round 2: refreeze the *new* packet and dispatch three fresh reviewers (new `Agent` calls, `model: sonnet` — they have no memory and must not be told what round 1 found). If round 1 applied none, one round is enough. After round 2, anything still unresolved goes to **Open Questions** with who decides; do not start a third round.

## Report

In chat: what changed at the section level; findings rejected and why; any reviewer disagreement preserved rather than resolved; the number of rounds; whether execution degraded to sequential; anything surfaced as a scope or cost question.

## Constraints

- Reviewers are read-only. You edit only `spec.md` (and `impact.md` when a finding lands there) — no code changes, no other files, no commits, no scratch directory.
- Do not weaken a requirement to make a finding go away.
- If the spec is already sound in some dimension, say so plainly rather than inventing findings.
- Do not create the spec you were asked to review.
