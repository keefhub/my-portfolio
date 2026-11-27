# CLAUDE.md

Personal portfolio + blog for Keith Lim — `https://thegoldenpothos.xyz`.

Next.js 16.2.6 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
Framer Motion · Firebase JS SDK (admin panel only) · **statically exported** to `out/` and served by Vercel.

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
| `npm run lint:new`  | ESLint minus the known `ThemeProvider.tsx:25` error; the pipeline's lint gate |
| `npm run test:e2e`  | Build, then all Playwright specs in `e2e/` — slow, optional, on request only; not a gate, not in CI |
| `npx playwright test e2e/<slug>.spec.ts` | One feature's own spec against the built `out/` (build first) |

The pipeline's own commands (`check:task`, `step:packet`, `check:spec`, `verify`) are in
[.claude/repo-profile.md](.claude/repo-profile.md) § Verification commands.

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
| `/bright-warm-greenhouse/` | [src/app/bright-warm-greenhouse/page.tsx](src/app/bright-warm-greenhouse/page.tsx) — owner-only admin panel (`AdminPanel`, client component); `noindex`, not in the sitemap or `robots.txt` |

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
[next.config.ts](next.config.ts), [vercel.json](vercel.json), and
`absoluteUrl()` in [src/lib/site.ts](src/lib/site.ts) must agree. It makes each
route emit `out/blog/<slug>/index.html` instead of `out/blog/<slug>.html`.
The host serves exact-match files, so flipping this leaves every blog URL
unmatched (a 404, or a redirect to the wrong form). Do not change it in one file alone.
`vercel.json` also holds the build command and the `/rss.xml` content type; there is no
catch-all rewrite, so an unknown URL reaches `out/404.html`.

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
`absoluteUrl()`. Never hardcode `https://thegoldenpothos.xyz` in a page or
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

**Admin modules are client-only.** [src/lib/firebase/](src/lib/firebase/) (Firebase app,
Auth, committed public web config) and [src/lib/admin/](src/lib/admin/) (owner decision, section
list) serve only the admin panel at `/bright-warm-greenhouse/`. Never import either from a public
page, layout or server component: the public site must load no Firebase code.

**Database rules are the security boundary.** [firestore.rules](firestore.rules) allows writes only
from the owner's user ID (`ownerUid()`, also `OWNER_UID` in `src/lib/admin/owner.ts`; both ship as the
deny-all placeholder `REPLACE_WITH_OWNER_UID`). User IDs are per Firebase project, so production and SIT
each have one: `sitOwnerUid()` in both rules files and `SIT_OWNER_UID` in `owner.ts` hold the SIT ID (`ownerUidFor()` picks by page address). The panel being hidden protects nothing. Rules are
tested against the Firestore emulator (Java) in `e2e/`; each deploy job publishes its own project's rules (`deploy:rules` on `master`, `deploy:rules:sit`, Firestore only, on `develop`).
[storage.rules](storage.rules) does the same for uploaded images under `images/`: public `get`, no
`list`, owner-only create and delete, at most 5 MB, PNG/JPEG/WebP/SVG only; Storage needs the Blaze plan.

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
([src/lib/markdown.ts](src/lib/markdown.ts), re-exported by `src/lib/blog/markdown.ts`; client-safe, so the admin preview imports `@/lib/markdown` directly). Raw HTML in posts is
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

| Situation                                                                  | Skill                |
| -------------------------------------------------------------------------- | -------------------- |
| A plain-language feature ask to split and give edge cases, with the user    | `help-discover-this` |
| Take a vetted story to a pull request (spec, build, push, PR)               | `run-this`           |
| One story → `spec.md` + `impact.md` (also run by `run-this`)                | `spec-this`          |
| Build a spec's tasks (also run by `run-this`)                               | `do-this`            |
| Re-review a spec that was edited by hand                                    | `enhance-this-spec`  |
| A goal stated once, run hands-off to one pull request                       | `agentic-intent` → `agentic-discover` → `agentic-run` |
| Check an autonomous goal's definition of done                               | `agentic-accept`     |
| Optional read-only audit of a branch (bugs + security; maintainability)     | `thermos`            |

---

## Never violate (feature pipeline reviewers enforce these)

- The six **Invariants** above — static export, `trailingSlash` in three places, no `@/lib/blog` barrel in client components, UTC date formatting, one `SITE_URL`, unoptimized images.
- **Style against the CSS tokens in `globals.css`.** No raw colour values, no Tailwind `dark:` variants.
- **Never `git add -A`, `git add .`, or `git commit -a`.** Stage explicit paths.
- **Playwright is the only test runner.** Specs live in `e2e/` and run against the built `out/`. Don't add Vitest, Jest or another runner without asking.
- **Run only the feature's own e2e spec** (`npx playwright test e2e/<slug>.spec.ts`) — at feature completion and before pushing to `develop`. Never the full suite as a gate (too slow), and never e2e in CI.
- **Models: orchestrator Opus, subagents Sonnet.** Every dispatched subagent passes `model: sonnet`; don't raise a subagent's tier. See the profile's Models section.
- **Never commit or push to `develop`, `main` or `master`.** `master` is Vercel's production branch and deploys the live site. Work on a feature branch and open a pull request into `develop`; a human merges. `scripts/guard-bash.sh`, wired in `.claude/settings.json`, refuses direct pushes, force pushes, `git add -A`, `git commit -a`, `--no-verify`, `.env` access and a pull request to any other base.
- **Never write or read a secret.** The site has none. Don't read, print or edit `.env*`.

---

# AI Agent Implementation Workflow

Features are implemented one at a time from stories in [docs/features/](docs/features/), driven by
AI coding agents. Follow this loop for any task that says "implement the next feature," "continue
implementation," "run this story," or similar. A one-off bug fix, content edit or unrelated request is
not part of the loop: make the change (`bugfix` for defects) and commit it on a feature branch.

## Models, sessions and escalation

The chat session orchestrates; leaf subagents do the work. Roles and the escalation chain are in
[.claude/repo-profile.md](.claude/repo-profile.md) § Model roles and escalation.

- **The orchestrator runs on Opus and every subagent on Sonnet.** You pick Opus when you start the
  session; the agent definitions in `.claude/agents/` and every dispatch pass `model: sonnet`.
- **The chat session is the only orchestrator.** A subagent cannot spawn a subagent, so the session
  dispatches every worker itself. It runs the scripts, commits and asks the user; it writes no
  production code and no tests.
- **Workers are handed paths, never pasted text.** The spec writer gets the path of `story.md`; a
  task's workers get the path of its step packet (`npm run step:packet`), which is the Step and its
  test rows copied out of `spec.md`. The orchestrator does not read the story, the spec or a packet,
  so its context stays small across a whole feature.
- **One worker writes the tests, another makes them pass, a third reviews.** Independence comes from
  a fresh context, not from a stronger model.
- **State is on disk.** `PROGRESS.md`, `log.md` and `.run-logs/<slug>/` make a run resumable: if a
  session dies or its context grows too large, start a new one and run the same command.
- **The pipeline runs without the user.** An implementer makes its own implementation choices and
  reports them. A product question (what the visitor sees, what content is published) is decided by
  the spec writer and recorded in the spec as `[auto]`; a task blocked on the spec triggers an
  automatic spec revision, at most twice per feature. The user is asked only at a stop condition (the
  profile lists them), and audits the `[auto]` decisions in the pull request.

## Source of truth

- This file is the orientation map. Read it before searching the repo; [Reference.md](Reference.md) is the on-demand deep detail.
- [docs/features/OVERVIEW.md](docs/features/OVERVIEW.md) §1–3 (Product Overview, Confirmed Requirements, Assumptions to Confirm) are standing context — re-read them before implementing any feature.
- The design system is the token set in [src/app/globals.css](src/app/globals.css), described in `Reference.md`.
- Each `docs/features/<slug>/story.md` is one unit of work; its Gherkin scenarios are the acceptance criteria.
- [.claude/repo-profile.md](.claude/repo-profile.md) holds the pipeline's repo facts — verification commands, behavioral gate, layers, known-dirty paths, gate risk tiers.

## Pipeline

```
plain-language requirement
  → /help-discover-this "<requirement>"   impact analysis + feature split → docs/requirements/<slug>.md
  → /help-discover-this <feature-slug>    edge cases brainstormed with the user → docs/features/<slug>/story.md
  → /run-this <feature-slug>              the chat session orchestrates the rest, handing each stage a path:
      /spec-this                          story.md → spec writer → two reviewers, once → spec.md + impact.md
      /do-this                            spec.md §8 → per task: packet, tests, implementation, gate, commit; one feature review
      pull request                        one pull request into develop; a human merges
```

Outside the main line: `/enhance-this-spec` re-reviews a spec that was edited by hand, and `/thermos`
audits a branch.

- **`/help-discover-this`** is the only interactive way a new `story.md` gets written. Never hand-author a story, and never run `/spec-this` against a prose requirement. It never writes code or commits. When a story is vetted it offers `/run-this`. The other way a story gets written is `/agentic-discover`, which works from a ready intent file (see Autonomous runs).
- **`/run-this`** chooses the next stage from what is on disk (no `spec.md` → the spec stage; a spec with no `docs(<slug>): mark implementation complete` commit → the build stage; otherwise the pull request), pushes after each stage with a plain `git push`, and opens one pull request into `develop` when every slug is complete. It never merges. `local` turns pushing and the pull request off. `/spec-this` and `/do-this` can also be run on their own.
- **`/spec-this`** hands the story path to the `pipeline-spec-writer` subagent, which writes `spec.md` + `impact.md` (§8 is the implementation plan). The orchestrator then dispatches two read-only reviewers, once, and hands their reports back to the writer as paths. Thin features (≤2 scenarios, no new storage key or module boundary) get a short note and no review.
- **`/do-this`** builds the whole feature in one session, task by task. Per task: `step:packet` writes the packet, the test author writes failing tests, the implementer makes them pass, the orchestrator runs the mechanical gate (`npm run check:task`) and commits. A risk reviewer reviews a task before its commit only when its Step says `Risk: high` or the task escalated. One feature review runs at the end, after the build and **the feature's own e2e spec** (never the full suite). It needs a clean working tree.
- **Four checks, no more:** locked tests, the mechanical gate, the risk review of a high-risk task, and the feature review (the profile § Gate risk tiers). `/thermos` and `/enhance-this-spec` are deeper reviews you run by hand when you want one.
- **Decisions are recorded, not asked.** The spec writer tags each question it settled `[auto]` in the spec's Decisions; audit them with `grep -rn '\[auto\]' docs/features/`. A decision never drops or weakens a scenario of the story. A user's ruling is recorded as `[human]`.
- **E2E is the feature's own spec only.** Behavioural checks are Playwright tests in `e2e/<slug>.spec.ts` (`E2E-NN:` titles) against the built `out/`. Run `npx playwright test e2e/<slug>.spec.ts` at feature completion and before pushing to `develop`. The full suite (`npm run test:e2e`) is optional, on request, and never in CI. `compiler` and `manual` checks cover the rest; `manual` ones are reported as pending.

## Implementation order

Populated by `/help-discover-this` and `/agentic-discover` as features are added — keep it in sync with `docs/features/OVERVIEW.md` §4.

| Order | Feature story | Why it goes here |
| ----- | ------------- | ---------------- |
| 1 | [admin-sign-in](docs/features/admin-sign-in/story.md) | The gate every other slice sits behind; carries the Firebase dependency, emulator set-up and the route |
| 2 | [admin-owner-only-access](docs/features/admin-owner-only-access/story.md) | Rules must exist before any editor writes; shows the placeholder state to the owner |
| 3 | [manage-profile](docs/features/manage-profile/story.md) | Simplest editor (one record); fixes the form and save pattern |
| 4 | [manage-experience](docs/features/manage-experience/story.md) | First list; fixes the reorder and confirm-delete pattern the next three reuse |
| 5 | [manage-projects](docs/features/manage-projects/story.md) | Reuses the list pattern; no new dependency |
| 6 | [manage-certifications](docs/features/manage-certifications/story.md) | Reuses the list pattern |
| 7 | [manage-tech-stack](docs/features/manage-tech-stack/story.md) | Reuses the list pattern, plus nested items |
| 8 | [manage-blog-posts](docs/features/manage-blog-posts/story.md) | Most rules (unique slug, dates, draft, status list), so after the pattern is settled |
| 9 | [preview-blog-post](docs/features/preview-blog-post/story.md) | Needs the post editor to preview from |
| 10 | [manage-image-library](docs/features/manage-image-library/story.md) | Builds right after admin-owner-only-access (decomposition Run order 3): storage rules and uploads must exist before any editor can pick an uploaded image; needs the owner-only rules pattern from that slice |
| 11 | [owner-google-sign-in](docs/features/owner-google-sign-in/story.md) | The gate everything else sits behind; lifts the static export for the panel, adds Auth.js, proves the `/api/auth/*` callback under `trailingSlash: true` early, and amends the standing docs the lift makes false |
| 12 | [owner-edits-profile](docs/features/owner-edits-profile/story.md) | Simplest editor (one record); first use of the database, so it fixes the server entry point, the owner-only check, the empty and unreachable states |
| 13 | [owner-uploads-images](docs/features/owner-uploads-images/story.md) | Storage and the owner-only upload pattern must exist before any editor can pick an uploaded image; adds the picker to the profile photo |
| 14 | [owner-manages-experience](docs/features/owner-manages-experience/story.md) | First list; fixes the reorder and confirm-delete pattern the next three reuse |
| 15 | [owner-manages-projects](docs/features/owner-manages-projects/story.md) | Reuses the list pattern; no new dependency |
| 16 | [owner-manages-certifications](docs/features/owner-manages-certifications/story.md) | Reuses the list pattern; badge uses the image picker |
| 17 | [owner-manages-tech-stack](docs/features/owner-manages-tech-stack/story.md) | Reuses the list pattern, plus nested items; icons use the picker |
| 18 | [owner-manages-blog-posts](docs/features/owner-manages-blog-posts/story.md) | Most rules (unique slug, draft, status list, public read of published posts); cover uses the picker |
| 19 | [owner-previews-blog-post](docs/features/owner-previews-blog-post/story.md) | Needs the post editor to preview from |
| 20 | [retire-firebase](docs/features/retire-firebase/story.md) | Last, because every other slice removes only what it replaces; this one deletes what is left and checks the whole |

Do not reorder or skip features without an explicit user request. Do not implement scenarios beyond what's written.

## Autonomous runs

An alternative to the interactive loop above, for a goal the user states once and does not want to be
asked about again (for example in a cloud session). Every rule in "Never violate" still holds, and the
guard hook is unchanged.

```
/agentic-intent <slug>      the user is interviewed once; writes docs/requirements/<slug>-intent.md
/agentic-discover <slug>    decomposes the goal, writes the stories ([auto] / [human: intent §N])
/agentic-run <slug>         spec, build, acceptance; one branch, one pull request into develop
/agentic-accept <slug>      the intent's definition of done as end-to-end tests (run by /agentic-run)
```

- **The intent file is the user's whole input.** Its "Pre-approved decisions" (§4) are the only approvals an autonomous run may treat as the user's: a new dependency, an external service, or any other choice the pipeline would otherwise stop and ask about. Anything not listed still stops the run. Secret values are never in the file and never set by an agent (§7).
- **The agent decides what it would have asked.** Those decisions are tagged `[auto]`; what the intent rules is tagged `[human: intent §N]` and is never overridden. A story's non-goals and hard constraints (intent §3, §5) bind every slice. Append to the order table and `OVERVIEW.md`; never reorder.
- **One branch, one pull request.** All slices are committed on one feature branch, in order; the pull request targets `develop` and has a section per slice. A stop no intent decision settles (a task failed twice, two spec revisions used up, a failed feature review or intent acceptance, a rejected push) ends the run in a **draft** pull request carrying the failure digest and the pending slices; re-running the same command resumes from disk. A human merges.
- **Never** per-slice branches, stacked pull requests, a secret in the repo, a loosened test to pass a stop, or anything marked ready while acceptance is red or unrun.

## Per-feature loop

`/run-this <slug>` runs these in order; each can also be run on its own.

1. **Check status and the tree.** `git log --oneline --grep="^feat(<slug>)"` confirms the feature isn't already committed. The branch is a feature branch and the working tree is clean, apart from a story that was just written.
2. **`/spec-this <slug>`** → `docs/features/<slug>/spec.md` and `impact.md`, committed. Open questions are decided and tagged `[auto]`.
3. **`/do-this <slug>`** → runs every task of Section 8 in one session, then Completion. If the session dies, run the same command: `PROGRESS.md` says where to resume.
   - **Finishes** (every task ticked, `docs(<slug>): mark implementation complete` committed) → next feature. Report any `manual` checks left pending; they were never run.
   - **Blocked task.** A worker reports `BLOCKED` or a Stop-if condition → the spec writer decides it, the spec is revised and committed, and the task restarts. No question to the user.
   - **Stops.** A task fails twice, two automatic revisions are used up, the spec writer is itself blocked, or the feature review fails twice → the run stops and asks the user. Do not retry blindly. An answer that changes what is built goes in through `/spec-this <slug> revise`, then `/do-this <slug>`.
   - **Feature review.** After the last task, the build and the feature's own spec, one reviewer checks the whole feature's diff against the spec, including the tasks that had no reviewer. Blocking findings are fixed before the feature is marked complete.
4. **Pull request** → one pull request into `develop`, opened by `/run-this`, following `.github/pull_request_template.md`. A human merges.

Never let a failing build reach git history. Progress is derived from `git log` commit prefixes, not a status file.
