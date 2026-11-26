# Intent template

Copy this file verbatim to `docs/requirements/<slug>-intent.md`, then replace every `TODO` and every
angle-bracket prompt. Keep every heading and its number (other skills cite `§N`), even if the section
says "None". Delete these instructions and the prompts once a section is filled in.

Write from the **business** point of view: what should be true for the people and the business when it
is done, and why. Technical content appears in only one place, §4, and only when the goal needs a
**significant change to dependencies or infrastructure** (a new library, service, data store, sign-in
or hosting change). No design, no file, component or screen talk anywhere. The agent splits the goal
into features and decides how to build them itself.

---

# Intent: <name of the goal>

- **Slug:** `<slug>`
- **Owner:** <who rules on questions the run could not settle>
- **Status:** draft | ready (a run starts only from `ready`, and only after the owner confirmed the read-back)

## 1. Goal

<One short paragraph in plain language: what should exist when this is done, and why it is wanted.>

TODO

## 2. Business context

### 2.1 The problem today

<What people do now, what it costs them (time, errors, money, risk), and why that is not good enough.
Write "Nothing exists today" if that is the case.>

TODO

### 2.2 Why now, and what success looks like

<What makes this worth doing now. The change you would notice in the business if it worked, with a
number or a plain observable sign where you can.>

TODO

### 2.3 Users and their situation

<Who uses it, in which part of the product, in what situation, and how often. Include anyone it
affects without using it directly.>

TODO

### 2.4 Business rules

<The policies and limits the feature must respect: who may do what, what must be approved or
recorded, what amounts, counts or time limits apply, what is private, what the business is obliged to
do. One line each, in business words.>

- TODO

### 2.5 What happens when it goes wrong

<The cost of a wrong, missing or leaked result for the business and the people, and what must never
happen. This is where the owner's biggest worries go.>

TODO

## 3. Non-goals

<What must not be built, even if it looks related. One line each. Write "None" only if you mean it.>

- TODO

## 4. Pre-approved decisions

An explicit yes for anything the pipeline would otherwise stop and ask about. Only what is listed here
is allowed; anything else still stops the run. This is the one technical section: fill it only for a
significant change to dependencies or infrastructure, and say in business terms why it is needed and
what it changes. Write "None" if nothing applies.

| Kind | What is approved | Why it is needed, and what it changes | Alternatives ruled out, and why | Cost or risk accepted |
| --- | --- | --- | --- | --- |
| New dependency | TODO | | | |
| New environment variable | TODO | Name only; you set the value yourself | | |
| External service or provider | TODO | | | |
| Data store, sign-in or hosting change | TODO | | | |
| Other choice the agent would otherwise guess | TODO | | | |

## 5. Hard constraints

<Rules that always hold, whatever is built: who may do what, what data may be stored, shown or sent
outside the business, cost or time limits, what must not change. One line each, each checkable. Every
rule in §2.4 and every worry in §2.5 that must always hold belongs here too.>

- TODO

## 6. Definition of done

Each line is an outcome someone can observe from the outside and test without reading the code. The
final acceptance check turns each line into a test and each hard constraint into a negative test.

- [ ] TODO

## 7. Human-only items

Things the agent cannot or must not do. It reports them in the pull request and never attempts them.
Examples of the kind: entering a real secret, a judgement only a person can make, a manual check.
Write "None" if nothing applies.

- TODO

## 8. Notes for the agent (optional)

<Anything else that should shape decisions: precedent in the codebase to follow, known pitfalls,
what "good" looks like. Leave empty if nothing.>

---

## Quality bar

`/agentic-intent` checks these before it asks the owner to confirm. Each failure is raised to the owner.

1. Every section is present and none still holds `TODO` or an unfilled prompt (a deliberate "None" is fine).
2. The goal fits one paragraph and names no feature list, screen or task.
3. §2 answers all five of its questions in business words: the problem and its cost, why now with an observable sign of success, the users and their situation, the rules, and what must never go wrong.
4. Every §2.4 rule and every §2.5 worry that must always hold has a matching line in §5 or §3; none is left only as prose.
5. Every non-goal, constraint and definition-of-done line is one checkable sentence.
6. Every definition-of-done line is observable from outside; none says "works well", "is fast" or "is secure" without a measurable test.
7. Every hard constraint can be turned into a test that fails if it is broken.
8. **Stop predictions are closed.** The interview checked the goal against the codebase and standing docs for every dependency, environment variable, external service, stored-data, permission and sign-in decision it implies, and each one is either in §4, ruled out in §3 or §5, or deliberately left to the agent with the owner's say-so.
9. §4 lists only decisions the owner stated, each with its reason in business terms; no entry holds a secret value; there is no design detail outside §4.
10. The owner confirmed a plain-language read-back of the whole intent. Status is `ready` only then, and only when 1–9 pass.
