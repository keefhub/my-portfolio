# Edge-case taxonomy — candidate prompts

The ten categories `/feature-discovery` Mode B Phase 2 sweeps, with generic candidate prompts, plus
a **Repo-specific prompts** section at the end that the repo owner fills in with the realities of
*this* product (its domain objects, quantity or pricing rules, storage, platform promises,
accessibility target). Read both before sweeping.

**How to use this file.** Per category, pick the 2–4 prompts that plausibly apply to the feature in
hand, rewrite each as a concrete user-visible question about *this* feature, and put them to the user
as **in scope / out of scope / defer**. These are prompts, not a checklist to paste — a prompt that
cannot apply is evidence for the category's `N/A — <reason>` close, not a scenario to invent.

Every category gets closed. Scenarios, or `N/A — <reason>`. Never silence.

---

## 1. Empty & zero state

What the user sees before any data exists, and whether zero differs from absent.

- First ever visit — nothing stored, nothing created. What does the screen show, and what is the
  next step it offers?
- A search or filter combination matches nothing. Does the empty state name the query and suggest
  how to widen it?
- Zero versus absent versus unknown (for example a count of `0`, a missing value, and a value that
  has never been set). Do these read differently?
- An optional section has no content — is it hidden, or replaced by an explanatory message?
- An optional field left blank — omitted from what the recipient receives, or shown as empty?

## 2. Boundaries & precision

The first, the last, the largest, the smallest, and what rounding does.

- A numeric input below the minimum, exactly at it, and one above; the same at the maximum.
- A quantity that is not a multiple of the allowed step — what does the interface say and offer, and
  does it ever round silently?
- The boundary of a tiered rule (a price tier, a plan limit, a rate band) — which tier applies at
  the boundary itself, inclusive or exclusive?
- Very large values — number grouping, no overflow in inputs, tables or totals.
- Values with more precision than the display shows — how many decimals are shown, and is anything
  rounded only at display?
- The longest name, description, or free-text note a user can produce — and what the layout does.
- The most items or lines the feature accepts (list size, rows per import, results per page).

## 3. Invalid & malformed input

What the user can enter that must be refused, and how the refusal appears.

- Non-numeric, negative, zero, decimal, or empty numbers; a lone `-`, `.`, or `e`.
- Identifiers with odd spacing, case or punctuation — normalised the same way search normalises
  them, or refused?
- An identifier that does not exist — accepted as free text, or refused?
- Whitespace-only required fields; an email that does not look like an email.
- Is validation on submit, on blur, or live? Errors say what is wrong and how to fix it, without
  apologising. Does a refused submit keep everything the user typed?
- Client validation passes but the server rejects it (the server is the source of truth) — where
  does that message appear?

## 4. Duplicates & collisions

Two things that want the same identity.

- Adding something already present — replace, add to it, or ask?
- Two inputs that normalise to the same identity — one record or two?
- The same item entered through two different routes.
- Submitting twice in quick succession, or resubmitting after success — one record, or two
  references?
- Two sources with the same identifier — how does the user tell them apart?

## 5. State & lifecycle conflicts

The record exists, but the state around it has moved.

- A stored item is later retired, deprecated or removed — what does the user see, and can they still
  act on it?
- A value saved with the item (price, stock, status) is stale against the source of truth — refreshed
  on load, or shown as saved?
- A rule changes after the item was saved, so the saved value is now invalid.
- A mode or configuration switch that is planned (for example one commercial model replaced by
  another) — does every new label and flow survive it?
- A page reached through an old or pre-migration address — does it resolve or redirect?

## 6. Persistence failure

Two stores, two failure modes — never skip this category for a feature that writes to either.

**Client-side storage (browser storage, local files, caches):**
- Storage blocked or disabled — does the feature still work in memory for the session?
- Stored data is corrupt or hand-edited — does it start empty, and is that acceptable here?
- Data written by an older version with a different shape — what happens when it is read?
- Quota exceeded on write — silent, or does the user learn it will not survive a reload?

**Server-side (actions, endpoints, jobs, anything that later persists or sends):**
- The call throws or the network fails mid-submit — does the user keep their input and see a clear
  error?
- Persistence or a downstream notification fails after validation passed — does the user still get
  a confirmation, and is the request lost?
- A read from the data source fails — the page should fail loudly with an error page, not show an
  empty state that looks like "no results".

## 7. Navigation & interruption

Whatever the user does that is not finishing the flow.

- Refresh mid-form with unsaved input — kept or lost?
- Browser back after applying filters — does every search and filter state have a URL, so back
  restores it?
- Deep link to a record that does not exist (or was mistyped) — a proper not-found page with a way
  back?
- An overlay or drawer open while navigating to another page — closes, or follows?
- Double tap on a primary action.
- Where the user lands after finishing, and whether in-progress state is cleared.

## 8. Offline & time

Network dependency and time.

- The platform promises the repo makes (for example core flows working without client script) —
  does this feature have a path that honours them, and what is it?
- Offline after the page loaded — which interactions fail, and does the main task still work on
  submit?
- A date in the past, today, or far future; the time zone of a date shown back to the user.
- Data that looks like a clock but is really data (a last-updated stamp, a lead time) — confirm
  `N/A` unless the feature computes a date.

## 9. Presentation & scale

Phone-first or desktop-first as the repo decides; design-doc tokens and components only.

- Phone width — tables reflow with no sideways scroll; controls fold behind a toggle. Does this
  feature's layout do the same?
- A long list — pagination with real URLs, or scroll? How many before it needs help?
- Text too long for its container — a long identifier, description or name.
- Keyboard-only and screen-reader use — focus order, visible focus, live-region announcements for
  counts and messages; status never by colour alone.
- Numbers, currencies, units and ranges formatted the way the repo's voice rules say.
- Ordering and tie-breaking when two items share a sort key.
- Reduced motion — any new animation collapses under `prefers-reduced-motion`.

## 10. Multi-actor & permissions

State it rather than skip it, even when the product has no accounts.

- Two browser tabs, or two users, working on the same record. One writes; does the other notice or
  silently overwrite on its next write?
- Does anything here assume a known, logged-in user, or a particular role?
- Anything shared or sent out — a link, a URL, an email, a request to staff. What does it contain,
  and could it expose another user's data (for example a guessable reference number)?
- Anything a third party (a partner, a regulator, another team) must approve?

If none of these apply: `N/A — no multi-user or permissions dimension for this feature.` That close
is expected when genuinely true; an unmentioned category is not.

---

## Repo-specific prompts

> **Fill this in when you adopt the pipeline.** Add the prompts that only make sense for this
> product, grouped under the category numbers above. Examples of what belongs here: the
> domain objects and identifiers users type (and how they are normalised), the quantity, pricing
> or unit rules, the storage keys and their migration story, the promises about degraded
> environments, the target accessibility standard, the planned mode or platform switches, and any
> partner or approval constraints. Remove this note once the section is written.

| Category | Prompt specific to this repo |
| --- | --- |
| 1 | _e.g. what the first-visit screen shows when nothing is stored_ |
| 4 | _e.g. two identifiers that normalise to the same string_ |
| 6 | _e.g. the persisted key, and what a stale shape does_ |
