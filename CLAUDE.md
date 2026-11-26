# CLAUDE.md

Personal portfolio + blog for Keith Lim — `https://thegoldenpothos.dev`.

Next.js 16.2.6 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
Framer Motion · **statically exported** to `out/` and served by Firebase Hosting.

Import alias: `@/*` → `./src/*`.

For deep architecture — component tree, state flow, CSS token catalog, extension
points — read [Reference.md](Reference.md). This file is the always-loaded
summary; that one is the on-demand detail.

---

## Commands

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Dev server (Turbopack)                               |
| `npm run build`     | Production build **and static export** → `out/`      |
| `npm run typecheck` | `tsc --noEmit`                                       |
| `npm run lint`      | `eslint .`                                           |
| `npm run test:e2e`  | Build, then Playwright specs in `e2e/` against `out/` |

**`npm run build` is the real verification gate.** It is the only step that runs
the export, so it is the only step that catches server/client boundary
violations, `generateStaticParams` gaps, and anything else that is legal
TypeScript but illegal in a static export. `typecheck` passing does not mean the
site builds.

> **Known pre-existing lint failure:** `ThemeProvider.tsx:25` trips
> `react-hooks/set-state-in-effect`. It predates this config and is unrelated to
> most changes — do not treat it as caused by your edit, and do not "fix" it as a
> drive-by. `npm run lint` currently exits 1 because of it.

---

## Routes

Every route is prerendered at build time. There is no server at runtime.

| URL             | Source                                                       |
| --------------- | ------------------------------------------------------------ |
| `/`             | [src/app/page.tsx](src/app/page.tsx) — single-page scroll     |
| `/blog/`        | [src/app/blog/page.tsx](src/app/blog/page.tsx)                |
| `/blog/<slug>/` | [src/app/blog/[slug]/page.tsx](src/app/blog/[slug]/page.tsx)  |
| `/rss.xml`      | [src/app/rss.xml/route.ts](src/app/rss.xml/route.ts)          |
| `/sitemap.xml`  | [src/app/sitemap.ts](src/app/sitemap.ts)                      |
| `/robots.txt`   | [src/app/robots.ts](src/app/robots.ts)                        |

The landing page (`/`) is a multi-section scroll with anchor nav — Hero, About,
Experience, TechStack, Projects, Certifications. It is not routed; the sections
are components on one page.

---

## Invariants — breaking these breaks the site

**1. Static export. No server exists at runtime.**
`output: "export"` in [next.config.ts](next.config.ts). No API routes, no
middleware, no ISR, no `cookies()`/`headers()`, no request-time rendering. Every
dynamic route needs `generateStaticParams`. Route handlers must be
`export const dynamic = "force-static"`.

**2. `trailingSlash: true` is load-bearing in three places.**
[next.config.ts](next.config.ts), [firebase.json](firebase.json), and
`absoluteUrl()` in [src/lib/site.ts](src/lib/site.ts) must agree. It makes each
route emit `out/blog/<slug>/index.html` instead of `out/blog/<slug>.html`.
Firebase Hosting only serves exact-match files, so flipping this leaves every
blog URL unmatched and falling through to the SPA rewrite. Do not change it in
one file alone.

**3. Never import the blog barrel from a client component.**
[src/lib/blog/posts.ts](src/lib/blog/posts.ts) is `import "server-only"` and
reads the filesystem. The barrel [src/lib/blog/index.ts](src/lib/blog/index.ts)
re-exports it.

- Client components import types from `@/lib/blog/types` — **that path only**.
- Server components may use `@/lib/blog`.

Importing `@/lib/blog` from a `"use client"` file pulls `fs` into the browser
bundle and fails the build.

**4. Format dates with `timeZone: "UTC"`.**
Use `formatDate()` from [src/lib/blog/types.ts](src/lib/blog/types.ts). `"2026-05-15"`
parses as UTC midnight, so formatting in a local zone renders a different day on
either side of UTC — the HTML baked at build time then disagrees with the client
re-render and React reports a hydration mismatch.

**5. The origin lives in one constant.**
`SITE_URL` in [src/lib/site.ts](src/lib/site.ts). Build absolute URLs with
`absoluteUrl()`. Never hardcode `https://thegoldenpothos.dev` in a page or
component.

**6. Images are unoptimized.**
`images.unoptimized: true` is required by static export. No WebP/AVIF
conversion, no responsive `srcset`. Size and compress assets before committing.

---

## Conventions

**Server-first components.** 9 of 17 components are server components. Add
`"use client"` only when the file needs state, effects, event handlers, or
browser APIs. Blog components ([src/app/components/blog/](src/app/components/blog/))
are server components — keep them that way.

**Theming is CSS custom properties, not Tailwind dark variants.** Tokens are
defined on `:root` and overridden under `[data-theme="dark"]` in
[src/app/globals.css](src/app/globals.css) — `--background`, `--foreground`,
`--surface`, `--accent-blue`, `--accent-rose`, `--border`, `--shadow-*`. Style
against these tokens. An inline script in
[src/app/layout.tsx](src/app/layout.tsx) sets `data-theme` before paint to
prevent FOUC; `<html>` carries `suppressHydrationWarning` for that reason.

**Metadata** is centralized in [src/app/layout.tsx](src/app/layout.tsx) with a
`%s | thegoldenpothos` title template. Blog posts add their own via
`generateMetadata`.

---

## Blog authoring

Posts are `content/blog/<slug>.md`, loaded and validated at build time.

Required frontmatter — `title`, `excerpt`, `date` (`YYYY-MM-DD`), `slug`.
Optional — `updated`, `tags`, `draft`, `featured`, `coverImage`, `coverAlt`,
`readingTime`.

The build **fails loudly** on a missing/empty required field, an unparseable
date, or a duplicate slug. `readingTime` is computed from the body when omitted —
prefer omitting it so it cannot drift. `draft: true` hides a post from listings,
detail pages, RSS, and the sitemap.

Markdown runs through unified: remark-parse → remark-gfm → remark-rehype →
rehype-raw → rehype-slug → rehype-autolink-headings → rehype-highlight
([src/lib/blog/markdown.ts](src/lib/blog/markdown.ts)). Raw HTML in posts is
parsed as real elements and **is trusted** — content is authored in this repo.
If untrusted markdown is ever rendered, add `rehype-sanitize` after
`rehype-raw`.

---

## Which skill to use

Skills auto-activate from the prompt. This table is the tiebreaker when two look
plausible.

| Situation                                                                | Skill                        |
| ------------------------------------------------------------------------ | ---------------------------- |
| Something that used to work is broken; an error, stack trace, regression | `bugfix`                     |
| Capturing a defect observation before anyone diagnoses it                | `write-bug-report`           |
| A rough feature idea that needs stories + acceptance criteria            | `user-story-creator`         |
| **Existing** UI looks generic/dated and should be upgraded               | `redesign-existing-projects` |
| A **new** section/page/component being designed from scratch             | `design-taste-frontend`      |

The design pair splits on existing vs. new: reworking what is already on the
page is `redesign-existing-projects`; adding something that does not exist yet is
`design-taste-frontend`.

Requirement docs land in [requirement/](requirement/), specs in [spec/](spec/).
Those two folders are `user-story-creator` output. The feature pipeline below
uses `docs/` instead and never touches them.

| Situation                                                                | Skill                        |
| ------------------------------------------------------------------------ | ---------------------------- |
| A plain-language feature ask that must be split and given edge cases      | `feature-discovery`          |
| One story → gated spec + implementation plan                              | `feature-spec`               |
| Spec edited by hand, or written before the reviewer round existed          | `spec-review`                |
| Execute a spec's plan step by step with review gates and commits           | `sdd`                        |
| Optional read-only audit of a branch (bugs + security; maintainability)    | `thermos`                    |

---

## Never violate (feature pipeline reviewers enforce these)

- The six **Invariants** above — static export, `trailingSlash` in three places, no `@/lib/blog` barrel in client components, UTC date formatting, one `SITE_URL`, unoptimized images.
- **Style against the CSS tokens in `globals.css`.** No raw colour values, no Tailwind `dark:` variants.
- **Never `git add -A`, `git add .`, or `git commit -a`.** Stage explicit paths.
- **Playwright is the only test runner.** Specs live in `e2e/` and run against the built `out/`. Don't add Vitest, Jest or another runner without asking.
- **Never push to `master`.** It deploys the live site; work lands on `develop`.

---

# AI Agent Implementation Workflow

Features are implemented one at a time from stories in [docs/features/](docs/features/),
driven by an AI coding agent. Follow this loop for any task that says "implement the next
feature," "continue implementation," or similar. A one-off bug fix, content edit or unrelated
request is not part of the loop — just make the change (`bugfix` for defects) and commit it.

## Source of truth

- This file is the orientation map. Read it before searching the repo; [Reference.md](Reference.md) is the on-demand deep detail.
- [docs/features/OVERVIEW.md](docs/features/OVERVIEW.md) §1–3 (Product Overview, Confirmed Requirements, Assumptions to Confirm) are standing context — re-read them before implementing any feature.
- The design system is the token set in [src/app/globals.css](src/app/globals.css), described in `Reference.md`.
- Each `docs/features/<slug>/story.md` is one unit of work; its Gherkin scenarios are the acceptance criteria.
- [.claude/repo-profile.md](.claude/repo-profile.md) holds the pipeline's repo facts — verification commands, behavioral gate, layers, known-dirty paths, gate risk tiers.

## Pipeline

```
plain-language requirement
  → /feature-discovery "<requirement>"   impact analysis + feature split → docs/requirements/<slug>.md
  → /feature-discovery <feature-slug>    edge cases brainstormed with the user → docs/features/<slug>/story.md
  → /feature-spec <feature-slug>         gated BA/SA spec + impact.md; §8 is the implementation plan;
                                         three read-only reviewer agents harden it (≤2 rounds)
  → /sdd <feature-slug>                  executes §8 via fresh subagents, review gates, commits per step
```

- **`/feature-discovery`** is the only way a new `story.md` gets written. Never hand-author a story, and never run `/feature-spec` against a prose requirement. It never writes code and never commits.
- **`/feature-spec`** writes `spec.md` + `impact.md`. Thin features (≤2 scenarios, no new storage key or module boundary) get a short note instead. `/spec-review <slug>` re-reviews a spec edited afterwards.
- **`/sdd`** owns implementation, the review gates (two for high-risk changes, one combined gate for low-risk ones — see the profile), and every commit. It needs a clean working tree.
- **`/thermos`** is an optional, manual, two-reviewer audit of a branch (bugs and security; maintainability). Read-only.
- Behavioural checks are Playwright tests in `e2e/` (`E2E-NN:` titles) against the built `out/`; `compiler` and `manual` (reported as pending) cover the rest. See the profile's Behavioral gate.

## Implementation order

Populated by `/feature-discovery` as features are added — keep it in sync with `docs/features/OVERVIEW.md` §4.

| Order | Feature story | Why it goes here |
| ----- | ------------- | ---------------- |

Do not reorder or skip features without an explicit user request. Do not implement scenarios beyond what's written.

## Per-feature loop

1. **Check status and the tree.** `git log --oneline --grep="^feat(<slug>)"` confirms the feature isn't already committed. Confirm the working tree is clean, or declare dirty paths.
2. **`/feature-spec <slug>`** → `docs/features/<slug>/spec.md` and `impact.md`.
3. **`/sdd <slug>`** → executes Section 8.
   - **Finishes** (every task ticked, `docs(<slug>): mark implementation complete` committed) → next feature. Report any `manual` checks left pending; they were never run.
   - **Escalates** (a task failed twice) → read its report, attempt a genuine root-cause fix (not a suppression or a skipped check), then `/sdd <slug> resume`. Up to 3 attempts per feature; then stop and report to the user.

Never let a failing build reach git history. Progress is derived from `git log` commit prefixes, not a status file.
