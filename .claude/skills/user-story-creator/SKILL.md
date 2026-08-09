---
name: user-story-creator
description: "Convert rough feature requests into concise user stories with acceptance criteria. Use when: creating user stories, writing acceptance criteria, defining product requirements, backlog grooming, feature planning, or normalizing requirements. Outputs to requirement/ after user confirmation."
---

# Requirements to User Stories Skill

## Purpose

Use this skill to convert a rough product statement such as "build a login feature" into concise, high-quality user stories with production-grade acceptance criteria. This skill is intended for the first stage of a spec-driven workflow, where messy human intent is normalized into a clean requirement artifact that can later be consumed by a spec agent, planner, and execution agent.

This skill should produce output that is concise at the story level, detailed at the acceptance-criteria level, and suitable for backlog grooming, requirement review, and downstream spec generation.

**Important:** The output markdown file is saved to `requirement/` only after the user explicitly confirms the draft. Never create the file on the first pass — always present the draft for review first.

## When to Use

Use this skill when:

- The input is a short or messy feature request.
- The user wants user stories in "As a / I want / so that" format.
- The user wants detailed acceptance criteria.
- The requirement needs to be normalized before spec writing.
- The work is still at the product or BA stage, not yet architecture or implementation.

Do not use this skill when:

- The user already provided complete user stories and only wants rewriting.
- The task is to produce architecture, technical design, database schema, API contracts, or implementation tasks.
- The task is a bugfix or code refactor with no meaningful user-facing behavior.

## Determine Project Mode

Before doing anything else, classify the request:

- **Greenfield** — no existing implementation materially relevant to the request. Skip straight to Core Behavior; codebase exploration is not required.
- **Brownfield** — a feature or change to an existing application. Existing Architecture Discovery (below) is mandatory before writing user stories.
- **Unclear** — not enough information to tell. Ask one concise question before proceeding, e.g. "Is this a new application or a change to the existing repository?"

## Core Behavior

You are acting as a senior business analyst and product manager.

Your job is to:

1. Read a rough feature request.
2. Determine project mode: Greenfield, Brownfield, or Unclear (see above).
3. For Brownfield requests, read authoritative context and perform read-only Existing Architecture Discovery before drafting anything (see below).
4. Infer the real user outcome — grounded in the requested business/user outcome, not in the existing implementation.
5. **Derive a file name** from the feature, following this repo's existing `requirement/` naming (`blog.curation.requirement.md`, `blog.dev.requirement.md`): `<area>.<facet>.requirement.md`, or `<area>.requirement.md` when there is no facet — e.g. `projects.filtering.requirement.md`, `contact-form.requirement.md`.
6. Split the request into the minimum number of meaningful stories.
7. Keep each story concise and value-focused.
8. Write detailed, testable acceptance criteria, including constraints to preserve identified during discovery.
9. Surface scope boundaries, assumptions, and open questions — including any conflicts or ambiguity surfaced during discovery.
10. If discovery surfaces a material ambiguity, duplicate capability, or conflict with existing behavior, ask a concise clarification question and wait for the answer before drafting the story.
11. **Present the complete draft in the chat for review.** Do not save it to disk yet. For Brownfield requests, present the Existing Architecture Context brief immediately before the user stories.
12. **Wait for explicit user confirmation** before writing the file.
13. Once confirmed, save the markdown artifact to `requirement/<derived-name>.requirement.md`.

## Quality Standard

The output must be better than an average Jira ticket.

That means:

- User stories are short, clear, and specific.
- Acceptance criteria are rich, testable, and cover happy path, validation, failure paths, redirects, state handling, and user-visible outcomes.
- Stories do not contain implementation detail.
- The requirement is sliced well enough for a spec agent to consume without guessing.
- Scope is explicit.
- Ambiguity is surfaced rather than hidden.

## Existing Architecture Discovery (Brownfield Only)

This phase is read-only. It exists to avoid proposing duplicate functionality, to use the project's existing terminology, and to surface constraints and conflicts — not to design a solution.

### 1. Read authoritative context first

In order:

1. The user's request and any provided requirements.
2. `Reference.md` — the authoritative agent reference for this project (architecture, component tree, navigation flow, state, design tokens, extension points, conventions, deployment, known limitations). Read only the sections relevant to the request.
3. `README.md`, existing requirements in `requirement/`, and existing design/UX specs in `spec/`.
4. Existing content under `content/blog/` when the request touches the blog.
5. Relevant code paths only — `src/app/**`, `src/lib/**`, `src/app/globals.css`.

Treat business-approved requirements as the source of desired behavior. Treat docs and code as evidence of *current* behavior and constraints — not as proof that behavior is correct.

If sources conflict, do not silently pick one: record the conflict under Open Questions, and ask for clarification before finalizing if it affects scope, acceptance criteria, or expected behavior.

### 2. Trace only the relevant code

Starting from the requested capability, trace only what's relevant. For this project that means: entry points (`src/app/page.tsx`, `src/app/blog/**`); existing components under `src/app/components/**` and how they are composed and navigated; the data constants embedded in those components (`projects[]`, `experienceData[]`, `techStack[]`, `certifications[]`, `socialLinks[]`); the blog pipeline in `src/lib/blog/**` and the `content/blog/` front-matter contract; design tokens, utility classes, and keyframes in `src/app/globals.css`; theme and `localStorage` handling in `ThemeProvider`; accessibility patterns; and the static-export/hosting constraints in `next.config.ts` and `firebase.json`. Consult git history only when it materially clarifies current behavior.

Note the standing platform constraint: this site is a **static export** with no backend, database, auth, or API routes. Any story implying server-side behavior must surface that as a scope question rather than silently assume it is possible.

- Do not read, summarize, or index the whole repository — this is targeted tracing, not an audit.
- Do not guess file paths, system behavior, or architecture.
- Stop once you understand current behavior, relevant boundaries, reuse opportunities, and constraints.
- Do not prescribe implementation details (exact classes, tables, endpoints, libraries, algorithms) in the resulting user story unless the user explicitly asked for a technical constraint.

### 3. Produce the brief before drafting stories

For every Brownfield request, output this brief immediately before the user stories:

```md
## Existing Architecture Context
- **Relevant current behavior:** <facts observed from docs/code; no speculation>
- **Relevant areas identified:** <modules/components/services/entities/interfaces, named at an appropriate abstraction level>
- **Existing flows or capabilities to reuse:** <if found>
- **Constraints to preserve:** <authorization, validation, API/data compatibility, business invariants, UX conventions, integrations, etc.>
- **Unknowns / assumptions:** <clearly marked>
- **Potential overlap or conflict:** <existing feature/behavior that may duplicate or conflict with the request, if any>
```

Keep it proportional: 5–10 concise bullets for a small focused change; concise grouped bullets (no full codebase summary) for a larger cross-module feature. In the acceptance criteria and notes below, reference this brief rather than repeating its detail.

### 4. Clarify before authoring

If discovery exposes a material ambiguity, missing product decision, duplicate capability, conflict with existing behavior, or insufficient information for testable acceptance criteria: ask concise, decision-oriented questions and do not finalize the story until answered. Do not invent a resolution.

Example: "The blog already renders Markdown from `content/blog/` at build time. Should this request extend that pipeline, or is a separate content source intended?"

## Guardrails

- Read code to understand the current state; do not let code define product intent.
- Existing behavior may be incorrect — never treat it as an unchallenged requirement.
- Do not write implementation plans, task lists, file-edit instructions, or architecture designs as part of user-story creation.
- Do not invoke feature brainstorming, writing-plans, developer, or bugfix workflows by default.
- If the request is a defect rather than a new capability, recommend the `/write-bug-report` or `/bugfix` skill instead of creating a feature user story.
- If discovery shows the request is only a tiny copy/style/configuration adjustment with no business-rule change, say so and ask whether a full user story is even needed instead of drafting one.
- No repository changes are permitted during discovery: no code, config, test, dependency, or documentation writes at any point in this skill.

## Story Writing Rules

Follow these rules strictly:

### 1. Keep stories concise

- Each user story must be exactly one sentence.
- Use this format only:
  - As a [specific actor], I want to [goal], so that [value].
- Do not include implementation details inside the story.
- Do not write vague actors like "user" when a better actor exists.

### 2. Slice correctly

- Split into multiple stories only when there are clearly different user outcomes.
- Prefer 2 to 4 strong stories over 1 bloated story.
- Do not split frontend and backend into separate stories.
- Do not split technical work into separate user stories unless the outcome is user-meaningful.
- Separate these when relevant:
  - basic access
  - error handling
  - recovery flow
  - session persistence
  - account state handling
  - admin or permission-specific flows

### 3. Acceptance criteria must be testable

For each story, provide:

- A checklist section beginning with "It’s done when:"
- A Given / When / Then section
- Happy path coverage
- Validation rules
- Error conditions
- Edge cases
- Redirect or state behavior where relevant
- User-visible result after action

### 4. Think beyond the happy path

Include where relevant:

- Empty or missing fields
- Invalid input
- Duplicate submission
- Loading state
- Retry behavior
- Expired session
- Locked, inactive, or unverified account
- Permission denial
- Accessibility considerations
- Security-sensitive messaging

### 5. Be strict on scope

Always include:

- In Scope
- Out of Scope
- Assumptions
- Open Questions

## Output Format

Always return markdown in this exact structure. For Brownfield requests, insert the `## Existing Architecture Context` brief (see Existing Architecture Discovery) directly after `# Feature Summary` and before `# User Stories`.

```md
# Feature

[feature name]

# Feature Summary

[2-4 sentence summary]

# User Stories

## Story 1

**User story**  
As a ...

**Acceptance criteria (checklist)**  
It’s done when:

- ...
- ...

**Acceptance criteria (Given / When / Then)**

- Given ...
- When ...
- Then ...

**Notes**

- Risks, edge cases, security, accessibility, or account-state notes only if relevant

## Story 2

...

# In Scope

- ...

# Out of Scope

- ...

# Assumptions

- ...

# Open Questions

- ...
```

## Working Method

Before writing the final output, silently determine:

- the project mode: Greenfield, Brownfield, or Unclear
- for Brownfield, what discovery is needed and what belongs in the Existing Architecture Context brief
- the primary actor
- the primary business outcome
- whether this should be one story or multiple stories
- which concerns belong in acceptance criteria rather than the story
- what should be excluded from MVP
- what ambiguity must be surfaced as questions, and whether any of it blocks drafting until clarified
- **the kebab-case file name derived from the feature**

For Brownfield requests, complete Existing Architecture Discovery and resolve any blocking clarification questions before drafting. Then generate the draft markdown and present it for review. Only save to `requirement/` after user confirmation.

## Anti-Patterns

Avoid these mistakes:

- Writing mini-specs as user stories
- Writing stories that include UI or technical implementation details
- Writing only one thin happy-path acceptance criterion
- Repeating the same criterion in different wording
- Mixing technical tasks into user stories
- Over-splitting into many trivial stories
- Hiding ambiguity instead of calling it out
- Producing architecture or implementation design at this stage
- Inferring product requirements solely from code, on a Brownfield request
- Treating existing implementation as proof that its behavior is correct
- Skipping Existing Architecture Discovery on a Brownfield request
- Prescribing implementation details (specific files, classes, tables, endpoints, libraries) in a story unless the user explicitly asked for that constraint
- Writing implementation plans, task breakdowns, or architecture designs as part of this skill

## Good Example

### Input

```text
I want to build a login feature.
```

### Output

```md
# Feature

Login

# Feature Summary

This feature allows registered users to authenticate and access the application securely. It covers the core login path, credential validation, authenticated-state handling, and user-visible error behavior. It does not automatically imply registration, password reset, or MFA unless those are explicitly requested.

# User Stories

## Story 1

**User story**  
As a registered user, I want to log in with my email and password, so that I can securely access my account.

**Acceptance criteria (checklist)**  
It’s done when:

- A registered user can submit a valid email and password and successfully access the application.
- Invalid credentials return a generic error message without revealing whether the email exists.
- Required fields are validated before submission.
- An already authenticated user who opens the login page is redirected away from it.

**Acceptance criteria (Given / When / Then)**

- Given a registered user is on the login page, when they enter a valid email and password and submit, then they are authenticated and redirected to the dashboard.
- Given a user enters invalid credentials, when they submit the form, then they remain on the login page and see a generic authentication error.
- Given one or more required fields are empty, when the user submits the form, then inline validation messages are shown.
- Given a user is already authenticated, when they navigate to the login page, then they are redirected to the dashboard.

**Notes**

- Password values should never be exposed in logs or UI.
- Error messages should avoid user enumeration.

# In Scope

- Email/password authentication
- Field validation
- Authenticated redirect behavior
- Error messaging for failed login

# Out of Scope

- Registration
- Forgot password
- Multi-factor authentication
- Social login

# Assumptions

- The application already has registered users.
- Successful authentication leads to a dashboard or protected landing page.

# Open Questions

- Should the session persist across browser restarts?
- Is account lockout required after repeated failed attempts?
- Is forgot password expected in the same release?
```

## Brownfield Example

### Input

```text
Let visitors filter the projects section by technology.
```

### Discovery (read-only, before drafting)

Reading the repo shows the projects section renders a fixed `projects[]` array embedded in `project.tsx` as flip cards, with no filtering or search; the tech stack is presented separately as static categories in `techstack.tsx`. `Reference.md` §Known Limitations already records "No search / filtering on projects" as accepted today. Neither component shares a canonical technology vocabulary. That is a potential-overlap signal, not enough on its own to draft acceptance criteria against.

### Output (partial — brief, then the clarification it forces)

```md
## Existing Architecture Context
- **Relevant current behavior:** Projects render from a fixed in-component array as flip cards with no filtering; tech stack is a separate static, non-interactive section.
- **Relevant areas identified:** Projects section; tech stack section; the embedded project data model.
- **Existing flows or capabilities to reuse:** The existing project data could carry technology tags rather than introducing a second source of truth.
- **Constraints to preserve:** Static export (no server-side filtering); existing flip-card interaction and its keyboard/`prefers-reduced-motion` behavior; design tokens and both light and dark themes.
- **Unknowns / assumptions:** Whether filter labels must match the tech stack section's existing categories.
- **Potential overlap or conflict:** A separate technology vocabulary for filtering would diverge from the tech stack section already shown on the page.
```

Before drafting stories, the skill asks: "The tech stack section already defines technology categories. Should project filters reuse that vocabulary, or is an independent tag set intended?" — and waits for an answer rather than guessing.

## Reusable Prompt

Use this prompt when invoking the skill:

```text
Convert the following feature request into concise, high-quality user stories with detailed acceptance criteria.

Rules:
- If this is a change to an existing application, first complete read-only Existing Architecture Discovery and present the Existing Architecture Context brief before the stories; ask clarifying questions if discovery surfaces a conflict or gap before drafting.
- Keep each user story to exactly one sentence.
- Use the format: As a [actor], I want to [goal], so that [value].
- Do not include technical implementation detail inside the story.
- Provide detailed acceptance criteria in both checklist and Given / When / Then formats.
- Include validation, error states, edge cases, redirects, permissions, and security-sensitive behavior where relevant.
- Include In Scope, Out of Scope, Assumptions, and Open Questions.
- Output valid markdown using the skill format.

Important — File output workflow:
1. Derive a file name from the feature following the `requirement/` convention (e.g., `projects.filtering`, `contact-form`).
2. Present the draft in the chat for review. Do NOT create the file yet.
3. Ask the user: "Shall I save this to requirement/<name>.requirement.md?"
4. Only create the file at requirement/<name>.requirement.md after explicit confirmation.

Feature request:
[PASTE REQUEST]

Additional context:
[PASTE CONTEXT]

Constraints:
[PASTE CONSTRAINTS]
```

## Intended Handoff

This skill is designed to feed the next stages of a spec-driven pipeline:

- Stage 1: raw requirement -> normalized user stories and acceptance criteria
- Stage 2: normalized requirement -> product/system spec
- Stage 3: spec -> implementation plan
- Stage 4: plan -> execution

The downstream spec agent should consume this artifact as the source of business intent, scope boundaries, and observable success conditions.
