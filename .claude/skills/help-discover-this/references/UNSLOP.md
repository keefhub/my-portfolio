# Unslop — the prose pass

Adapted from the `unslop` skill in Lauren Tan's pstack (MIT, `cursor/plugins/pstack/skills/unslop`).
`/help-discover-this` runs this pass over its own prose immediately before writing a file
(Mode A Phase 5, Mode B Phase 4). `/spec-this` treats those files as input, so vague or padded
wording here becomes a guessed requirement later.

## What it applies to

| Applies | Exempt |
| --- | --- |
| Requirements document prose: restatement, impact notes, rejected splits, open questions | The `gherkin` block — its wording follows `FEATURE-FILE-TEMPLATE.md` and the user approved it at gate B3; never reword an approved scenario |
| Story `## Assumptions`, `## Out of Scope`, `## Deferred` | The `# Title` line — Title Case, per the template |
| Table cells that are sentences | The `<item> — <reason>` separator in Deferred and Out of Scope bullets, which the template uses |
| | Interface wording quoted from the product (button labels, status words) |

The pass edits wording only. It never adds, removes or changes the meaning of an assumption, a
scope item, or an open question. If a sentence can't be made concrete without deciding something,
leave the decision to the user — move it to open questions instead of inventing an answer.

## Rules

Rule numbers are pstack's own, kept so they match upstream; gaps are rules pstack retired.

### Content

3. **Superficial -ing phrases.** "highlighting…", "ensuring…", "reflecting…". Delete, or say the
   concrete thing.
5. **Vague attributions.** "Buyers generally expect…", "Industry practice suggests…". Name the
   source (a Gherkin line, an OVERVIEW bullet, the user's ruling in the sweep) or delete.

### Language

7. **AI vocabulary.** Additionally, crucial, delve, enhance, fostering, garner, interplay,
   intricate, landscape, pivotal, robust, seamless, showcase, testament, underscore, vibrant.
   Replace with plain words.
8. **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Say "is" or "has".
9. **"Not just X, but Y."** State the point directly.
10. **Rule of three.** Use the natural number of items, not three for rhythm.
11. **Synonym cycling.** Pick one name per thing and repeat it: "report", not "report",
    "dashboard", "sheet" in one paragraph. Use the names the product's own interface uses.
12. **False ranges.** "from X to Y" where X and Y aren't on a scale. List the items.

### Style

13. **Em dash overuse.** In free prose, prefer a full stop or a comma. Keep em dashes only where
    the template puts them (see the exempt column).
14. **Colon overuse.** Colons before a list or example are fine; not as mid-sentence connectors.
15. **Boldface overuse.** Don't bold every term.
16. **Inline-header lists.** "**Storage:** Storage is…" restates itself. A bold lead-in that names
    the item and is followed by new detail is fine.
17. **Headings in sentence case**, except the template-fixed `# Title`.
18. **Decorative emojis.** Remove.
19. **Curly quotes.** Use straight quotes.

### Communication artifacts

20. **Chatbot phrases.** "I hope this helps", "Let me know if…", "Certainly". Remove.
22. **Sycophantic tone.** Remove.

### Filler

23. **Filler phrases.** "In order to" → "To". "Due to the fact that" → "Because". Delete "It is
    important to note that".
24. **Excessive hedging.** "could potentially possibly" → "may". An assumption is stated plainly;
    its uncertainty is that it sits under Assumptions.
25. **Generic conclusions.** Cut them, or state the specific fact.

### Jargon

26. **Abstract metaphor nouns.** Substrate, wedge, vector, locus, nexus, primitive (noun), surface
    (as in "API surface"), bedrock, scaffolding, paradigm, north star, flywheel. Use the concrete
    word.

### Plain speech

27. **Say what it does, not how it feels.** "A smoother quoting experience" says nothing; "the
    buyer sends one request for every part in the list" does. If a sentence could appear unchanged
    in another project's docs, it says nothing about this one. Cut it.
28. **One idea per sentence.** Split a sentence the reader has to re-read.
29. **Active voice.** "The cart is cleared" → "Placing the order clears the cart".
    Passive only when the actor genuinely doesn't matter.
30. **Cut adverbs**, or use the number. "Loads quickly" → the measured time, or delete.
31. **Prefer the plain word.** utilize/leverage → use, facilitate → help, numerous → many, in the
    event that → if.
32. **Mannered prose.** Aphorisms, personified code, figurative verbs. Say it literally.
33. **Over-compression.** No dropped articles, arrows or symbol-speak in prose: "qty < min → error"
    becomes "A quantity below the minimum shows an error." Tables may stay terse.
