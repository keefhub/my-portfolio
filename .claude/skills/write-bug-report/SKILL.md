---
name: write-bug-report
description: "Turns incomplete bug observations into an accurate, concise, actionable bug report for a developer or the `/bugfix` skill. Use when: filing a bug, writing up a defect from a rough description, screenshot, video description, log, console output, stack trace, network error, or pasted support/customer report, or preparing input for `/bugfix`. Does not diagnose root cause, propose fixes, or plan features — escalates to `/bugfix` or `user-story-creator` instead of absorbing their scope."
---

# Write Bug Report Skill

## Purpose

`/write-bug-report` turns an incomplete bug observation into an accurate, concise, actionable bug report for a developer or for the `/bugfix` skill. It is a reporting and clarification skill, not a bug-fixing, feature-planning, or architecture skill. It never asserts an unverified root cause and never invents reproduction steps, expected behavior, environment details, severity, priority, test data, affected users, or evidence — missing information is marked `Unknown`, `Not provided`, or `Needs confirmation`.

## When to Use

Use for: a rough description ("the nav highlights the wrong section", "dark mode flashes on load"), reproduction steps, screenshots/video descriptions, logs, browser console output, stack traces, build or deploy errors, or a pasted report from someone who visited the site.

Do not use for: diagnosing root cause, writing or changing code, or deciding how to fix something — hand off to `/bugfix` (see Routing Rule). Do not use for new-feature requests or requirement gathering — hand off to `user-story-creator`.

## Tracker Convention

This repository has no issue tracker integration (no `.github/ISSUE_TEMPLATE`, no Linear/Jira references) and no existing bug-report directory. This skill's standard output location is **`bug-reports/<kebab-case-title>.md`**, a new top-level directory matching the repo's existing flat `requirement/` and `spec/` convention of one markdown artifact per unit of work. Files are written there only on explicit confirmation (see Final Interaction Behavior) — never proactively.

## Mandatory Working Order

1. Read the relevant section(s) of `Reference.md` for the affected area — use it only to identify correct terminology (component names, design tokens, theme/`localStorage` behavior, static export, blog pipeline), not to diagnose the bug. Check its **Known Limitations** table before writing anything up as a defect.
2. Parse the supplied report into known facts, assumptions, and missing information.
3. Search `bug-reports/`, `requirement/`, `spec/`, and recent `git log` for likely duplicates or known limitations — read-only, no side effects.
4. Ask concise clarification questions (see Clarification Policy) before finalizing, when critical information is missing.
5. Produce the report only once facts are sufficiently clear, or explicitly label it an unverified investigation report.

## Clarification Policy

Ask only questions that materially improve reproducibility, triage, or safety. Do not ask something already answered by the user's input or by repository documentation. Priority order:

1. Exact observed outcome vs. expected outcome
2. Smallest reproducible steps from a clear starting point
3. Environment: `npm run dev` / local static build of `out/` / deployed site (`thegoldenpothos.dev`), commit, OS, browser/device, viewport width, light or dark theme
4. Deterministic, intermittent, or observed once
5. User/business impact
6. Evidence available: screenshot, recording, logs, request/response, stack trace, failing test
7. Known workaround

If the user cannot supply everything, produce the best report possible and list what's missing under **Missing information** — never block filing on incomplete input.

## Safety and Confidentiality

- Treat Firebase tokens and project credentials, API keys, `.firebaserc`/CI secrets, and any personal contact data beyond what the site already publishes as sensitive. Redact with `[REDACTED]`.
- This is a public static site with no auth, no database, and no server-side logic, so classic account/payment vulnerabilities do not apply. If a report does involve credential exposure or hosting misconfiguration: label it `Sensitive — do not file publicly`, minimize reproduction detail, and note that this repository has no documented private security-reporting process, so confirm with the user before any wider distribution.
- Never place a secret or raw production credential in the report, including inside quoted logs or request/response evidence — redact first.

## Report Rules

- One defect per report. If the input describes multiple independent symptoms, split into separate draft reports and state why.
- Write observed facts, not blame or speculative diagnosis.
- Title format: `[Component] <trigger> causes <symptom>` — use this repo's component names (Header, Hero, AboutMe, ExperienceTimeline, Projects, TechStack, Certifications, Blog, Footer, ThemeProvider, Build/Export, Hosting), e.g. `[Header] Scrolling past the hero leaves the wrong nav item highlighted`.
- Steps are numbered, atomic, and start from a known initial state — include the route, viewport width, and theme when they matter.
- Severity (technical/user impact) and Priority (urgency relative to other work) are separate fields. Suggest values only when the evidence supports them; otherwise `Needs triage`.
- Never claim reproducibility unless the user supplied verified steps or a failing automated check — this repo has no test runner, so "failing test" here typically means a manual procedure, a failing `npm run build`, or a `npx tsc --noEmit` error, not a suite.
- Check `Reference.md` §Known Limitations first. If the symptom is listed there (unoptimized images, no loading/error boundaries, no sitemap, no page transitions, etc.), say so in the report rather than filing it as a new defect.
- Never claim an issue is a duplicate without clear local evidence; use `Potentially related to: ...` instead.

## Required Markdown Output

Produce the report in this exact format:

```markdown
# Bug Report: <title>

## Summary
<One or two factual sentences describing the defect and impacted workflow.>

## Severity and Priority
- **Severity:** Critical | High | Medium | Low | Needs triage
- **Priority:** P1 | P2 | P3 | P4 | Needs triage
- **Impact:** <who is affected, what they cannot do, scope/frequency if known>

## Environment
- **Deployment:** `npm run dev` | Local static build (`out/`) | Deployed (Firebase Hosting) | Unknown
- **Application version / commit:** <value or Unknown>
- **OS:** <value or Unknown>
- **Browser / device:** <value or Unknown>
- **Viewport / breakpoint:** <e.g. 375px mobile, 1440px desktop, or Unknown>
- **Theme:** Light | Dark | Both | Unknown
- **Relevant content or configuration:** <e.g. blog post slug, front-matter, next.config.ts, firebase.json — or Unknown>

## Preconditions
<List only conditions required before reproduction, or "None known.">

## Steps to Reproduce
1. <atomic step>
2. <atomic step>
3. <atomic step>

## Expected Result
<Specific intended result.>

## Actual Result
<Specific observed result; include exact error text where available.>

## Reproducibility
- **Status:** Confirmed reproducible | Reported but unverified | Intermittent | Unknown
- **Frequency:** Always | Often | Sometimes | Once | Unknown

## Evidence
- **Screenshots / recording:** <attachment name, link, or Not provided>
- **Browser console / stack trace:** <sanitized excerpt, attachment reference, or Not provided>
- **Build / deploy output:** <sanitized excerpt from `npm run build`, `npx tsc --noEmit`, `npm run lint`, or `firebase deploy` — or Not provided>
- **Failing command:** <command and output summary, or Not provided>

## Workaround
<Temporary workaround, or "None known.">

## Scope and Related Context
- **Affected component(s):** <known component names>
- **Potentially related issues/changes:** <references, or "None identified">
- **Possible duplicate:** <reference, or "No clear duplicate identified">

## Open Questions
- <Only unresolved facts that block or materially affect diagnosis and validation.>
- If none: `None.`

## Handoff to `/bugfix`
<One concise paragraph stating what the bugfix skill should reproduce and which evidence it should start with. Do not prescribe a solution or guess root cause.>
```

## Final Interaction Behavior

After generating a report:

1. Show the completed Markdown report.
2. Show a short **Missing information** list, only if applicable.
3. Ask whether to:
   - save it to `bug-reports/<kebab-case-title>.md`, or
   - pass the report directly into `/bugfix`.

Never save the file, create a ticket, or invoke `/bugfix` without explicit confirmation.

## Routing Rule

This skill never diagnoses root cause, edits code, or invokes `/bugfix` on its own. It also never absorbs feature-planning or requirements work. Escalate instead of proceeding when:

- The user wants the defect investigated or fixed now → hand off to `/bugfix` only after explicit confirmation (Final Interaction Behavior).
- The report actually describes new functionality or a changed business rule rather than a defect → point to `user-story-creator` instead of writing a bug report.

## Implementation Constraints (always)

- Read-only against the codebase: no edits, no commits, no branches, no destructive commands.
- No creating tickets or posting to any external tracker — this repo has none configured, and none should be invented.
- No `git add -A` / `git add .` / `git commit -a` if a save is confirmed — stage the single new report file explicitly.
