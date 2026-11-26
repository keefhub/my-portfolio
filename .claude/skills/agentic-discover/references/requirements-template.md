# Decomposition document shape

What the decomposer writes to `docs/requirements/<slug>.md`. Later stages read `Run order`; the pull
request carries `Decisions`, `Human-only` and `Open findings`. Keep every heading; an empty section is
written `None.`.

````markdown
# <Goal name>: decomposition

- **Intent:** `docs/requirements/<slug>-intent.md`
- **Date:** <YYYY-MM-DD>

## Restatement

<One sentence, checked against intent §1.>

## Impact analysis

### Touched modules

| Path | read / write | Why |
| --- | --- | --- |

### New surface

<New storage keys, columns, files, modules, endpoints, screens. Name what is persisted today.>

### Migration risk

<What happens to data already stored, or None.>

### What already covers part of this

<Built features that already do part of it, or None.>

## Slices

| Slug | Title | User goal | Intent lines served | Scenarios (est.) | Depends on | Needs (intent §4) |
| --- | --- | --- | --- | --- | --- | --- |

## Run order

Dependency order, earliest first. Status is one of `pending`, `written`, `BLOCKED: <what it needs>`.

| # | Slug | Why here | Status |
| --- | --- | --- | --- |

## Coverage of the intent

| Intent line (§5 constraint or §6 definition of done) | Slice(s) |
| --- | --- |

## Decisions

Each question the interactive discovery would have asked, and what was taken. Tag `[auto]` for the
agent's own, `[human: intent §N]` when the intent rules it.

1. [auto] <decision>: <option taken>. Why: <one line>.

## Human-only

<Intent §7 items, copied verbatim. Nothing attempts them.>

## Rejected splits

<Splits considered and why they were dropped, or None.>

## Open findings

<Gaps, conflicts or review findings still unresolved, each naming the intent line, or None.>
````
