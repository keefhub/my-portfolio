---
name: bugfix
description: "Disciplined maintenance workflow for defects, regressions, errors, and broken existing functionality in this codebase. Use when: fixing a bug, diagnosing an error or stack trace, investigating unexpected behavior, chasing a regression, or triaging a broken feature. Does not run brainstorming, user-story creation, or architecture/feature planning — escalates to those explicitly instead of absorbing their scope."
---

# Bugfix Skill

## Purpose

`/bugfix` handles defects in the existing **my-portfolio** codebase — a statically exported Next.js 16 (App Router) + React 19 portfolio site with a build-time Markdown blog, deployed to Firebase Hosting. It covers errors, regressions, broken functionality, and incorrect output. It behaves as a careful maintenance engineer making the smallest defensible change — not as a feature builder. It never silently invokes brainstorming, `user-story-creator`, or open-ended architecture/implementation planning.

## When to Use

Use for: exceptions, stack traces, hydration errors, wrong output, broken flows, regressions since a recent change, intermittent failures. Typical areas: header scrollspy / mobile drawer, dark-mode theme toggle and `localStorage` persistence, Framer Motion animations and `whileInView` triggers, project/experience flip cards, blog Markdown parsing and `[slug]` routing, RSS generation, responsive layout and design tokens in `globals.css`, static-export or Firebase Hosting routing failures.

Do not use for: new features, new user journeys, product-requirement changes, or "fixes" that actually change accepted business rules — see **Routing Rule** below.

## Required Input

Extract from the user's report, or ask for what's missing (see Clarification Rule):
- Observed behavior vs. expected behavior
- Reproduction steps
- Exact error / stack trace / console output / screenshot / failing command, if available
- Environment or data conditions (route, viewport size, light/dark theme, browser, dev server vs. static build vs. deployed site) when relevant
- Deterministic or intermittent
- Severity / user impact, if known

## Clarification Rule

Ask only when the bug cannot be reproduced or bounded from what's given. If there's enough to investigate, investigate. If the report is ambiguous, state the assumption explicitly and get confirmation before a broad or risky change — don't block on things you can verify yourself by reading code.

## Workflow

### 1. Intake and classification

Classify the report against **Required Input** above. Note anything missing.

### 2. Read-only investigation and reproduction (before touching any file)

Read project context first, scoped to the affected area — don't summarize the whole repo:

- `Reference.md` is the authoritative agent reference for this project. Read only the matching section(s) rather than the whole file: **Architecture** / **Data Flow** for cross-component bugs, **Frontend / UI** (component tree, navigation flow, user interactions) for UI defects, **State & Data** for state, `localStorage`, or data-model issues, **CSS / Styling Architecture** for token, utility-class, or animation problems, **Accessibility Features**, **Deployment** for build/export/hosting failures, and **Known Limitations** — check this last one before treating anything as a defect.
- Check `README.md`, `requirement/` (feature requirements, e.g. the blog requirements), and `spec/` (design/UX specs) when the bug is about intended behavior rather than a crash.
- Orient with `git status --short && git log --oneline -10`, and skim recent commits touching the suspect files.

Then:
- Locate entry points and trace the render/data chain to the suspected fault — typically `src/app/page.tsx` or `src/app/blog/**` → `src/app/components/**` → `src/lib/**` (blog parsing helpers), plus `src/app/globals.css` for token- and animation-driven symptoms.
- Run the supplied reproduction command or documented steps as-is, without editing source first.
- **Windows shell hazard:** this repo is developed on Windows. Search patterns containing `/`, `=`, or quote characters can silently return zero matches in both Git Bash and PowerShell. A clean "no matches" during investigation is not proof of absence — rephrase the pattern before concluding a string doesn't exist.
- **Reproduce at the right layer:** `npm run dev` (Turbopack) does not exercise static export. If the symptom involves routing, `[slug]` pages, images, or only appears on the deployed site, reproduce with `npm run build` and serve `out/` — the Firebase `**` → `/index.html` rewrite in `firebase.json` can mask or cause route-level bugs that never appear in dev.
- If it can't be reproduced: report exactly what was attempted, the actual result, and the smallest next diagnostic step. Do not guess a fix.

### 3. Root-cause analysis

Do not patch symptoms. Before editing, produce a **bugfix brief**:

- Bug statement
- Reproduction status: reproduced / not reproduced / blocked
- Actual vs. expected behavior
- Relevant files and execution path
- Root-cause hypothesis with evidence
- Alternative hypotheses, if meaningful
- Proposed minimal change
- Explicit non-goals — behavior that must stay unchanged
- Test and verification plan

Keep the brief short for a low-risk single-file fix.

**Stop after the brief and ask for approval before editing** when the fix is multi-file, or touches: `next.config.ts` (especially `output: "export"` / `images.unoptimized`), `firebase.json` or `.firebaserc` hosting config, `src/app/layout.tsx` or `ThemeProvider` (theme flash / hydration), the design-token blocks in `src/app/globals.css`, the blog content pipeline in `src/lib/blog/**` or the `content/blog/` front-matter contract, `public/rss.xml` generation, or anything that changes published URLs.

### 4. Regression test design

There is no test runner in this repo (`package.json` defines only `dev`, `build`, `start`, `lint`) — don't add one without asking. So "test-first" here means the strongest feasible deterministic check, in priority order:
1. A minimal reproduction that fails before the fix for the correct reason — a `node`/`npx tsx` script against the pure logic in `src/lib/**`, a `npm run build` failure, or a `npx tsc --noEmit` error. Confirm it fails first.
2. If no scriptable repro is practical (true for most animation, layout, scrollspy, and theme bugs), a precise manual verification procedure written down before the fix — exact route, viewport, theme, and steps, with expected vs. actual — then re-run after.

State which one you're using and why.

### 5. Minimal fix

- Smallest defensible patch. Preserve public contracts, data shape, and existing conventions unless the bug requires a documented change.
- No unrelated refactors, renames, reformatting, dependency upgrades, or architecture changes.
- Don't modify `package-lock.json` unless truly required — explain why if you do.
- Don't add dependencies unless essential — ask first.
- Never introduce anything that breaks the static export: no API routes, no server-only runtime, no `dynamic`/ISR/middleware features unsupported by `output: "export"`, no `next/image` optimization assumptions (`images.unoptimized` is on).
- Follow existing conventions (`Reference.md` §Conventions): kebab-case component files, `export default function ComponentName()`, `"use client"` where needed, `@/*` path alias, Tailwind utilities plus CSS custom properties for design tokens, mobile-first breakpoints.
- Fix colors through the existing design tokens in `globals.css` — never hard-code a hex that only works in one theme. Verify both light and dark.

### 6. Verification

Run the narrowest checks first, then what's practical repo-wide:
- Original reproduction command/scenario — confirm it no longer fails
- The regression check from step 4
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build` — the build *is* the static export, so run it for any change that could affect routing, data loading, or the blog pipeline
- Check the fix in both light and dark theme, and at mobile plus desktop widths, whenever the change is user-visible
- No end-to-end/integration suite exists — skip and say so

Don't claim the bug is fixed unless the original failure no longer reproduces or the approved manual procedure passes. If a check can't run, state which one, why, what was verified instead, and remaining risk.

### 7. Handoff summary

End every run with exactly this structure:

```
# Bugfix Summary
- **Status:** Fixed | Not fixed | Blocked | Needs clarification
- **Bug:** <one-sentence description>
- **Root cause:** <evidence-backed explanation, or "not confirmed">
- **Changed files:** <file list and one-line purpose per file>
- **Regression coverage:** <check added/updated, or why not feasible>
- **Verification:** <commands run and results>
- **Behavior preserved:** <key non-regression constraints>
- **Remaining risk / follow-up:** <explicit risks, monitoring, or next steps>
- **No unrelated changes:** Yes | No, with explanation
```

## Implementation Constraints (always)

- No unrequested commits, branches, pushes, PRs, or deploys. Never run `firebase deploy` — deployment is the user's call.
- No `git add -A` / `git add .` / `git commit -a` — stage explicit paths.
- Don't commit build output (`out/`, `.next/`, `.firebase/`) as part of a fix.
- Treat build/export config, hosting config, and anything that changes published URLs as high-risk: ask before changing them.

## Routing Rule

This skill never invokes brainstorming, `user-story-creator`, or broad architecture/implementation planning by default. Escalate to that workflow instead — stopping and stating exactly why — only if investigation shows:

- The behavior is intentional and the requested outcome is genuinely new functionality;
- The fix needs a new section, page, or content type, a change to the site's information architecture, or a cross-cutting change such as moving off static export;
- The requested "fix" is really a design or content decision (copy, visual direction, which projects or certifications appear) rather than a defect — those belong to `user-story-creator`, `design-taste-frontend`, or `redesign-existing-projects`;
- The symptom is already documented under `Reference.md` §Known Limitations, meaning it is accepted behavior rather than a bug.
