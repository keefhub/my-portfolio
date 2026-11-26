# Repo profile — my-portfolio

The pipeline skills (`/feature-discovery`, `/feature-spec`, `/spec-review`, `/sdd`,
`/thermos`) cite this file for every repo-specific fact instead of carrying copies. Fix a fact
here when it changes.

## Branches

- Main branch: `develop` — the base that `/thermos` and the thermo-nuclear reviews diff against.
  Flow is feature → `develop` (staging preview channel) → `master` (live site). Never push to
  `master` from the pipeline.
- Commit style: Conventional Commits — `feat(<slug>): …`, `fix(<scope>): …`, `docs: …`,
  `ci: …`. Feature commits carry the feature slug as scope so progress can be read from
  `git log --grep="^feat(<slug>)"`.

## Verification commands

| Command | Applies | Success signal |
| --- | --- | --- |
| `npm run typecheck` | Every task | Exits 0, no type errors |
| `npm run lint` | Every task, **compared against the baseline** | No new errors. It exits 1 today because of the known `ThemeProvider.tsx:25` `react-hooks/set-state-in-effect` failure — that one is pre-existing, so do not fix it as a drive-by and do not treat it as caused by the task |
| `npm run build` | Every task touching `src/`, `content/`, `public/`, `next.config.ts`, `firebase.json` or `package.json`, and before a feature's plan is marked complete | Exits 0 |
| `npx playwright test -g "E2E-03"` | Every task whose Verify cites an `E2E-` id. Needs a current `out/` — run `npm run build` first | Exits 0; the named tests report `✓` |
| `npx playwright test e2e/<slug>.spec.ts` | Before a feature's plan is marked complete — run after `npm run build`, instead of the full suite | Exits 0; every test in the feature's spec file passes |
| `npm run test:e2e` | **Only before pushing to `develop`** (builds, then runs every spec). Never per task, never at feature completion, and **never in CI** | Exits 0, all tests pass |

**The full e2e suite is not part of CI.** `.github/workflows/pipeline.yml` stays typecheck, lint
and build only — do not add a Playwright step. The full suite is a local gate that whoever pushes
to `develop` runs first; a failure blocks that push. Pushing a feature branch does not require it.

**Playwright is the only test runner.** Don't add Vitest, Jest or another runner without asking
the user first.

`npm run build` writes `.next/` and `out/`, and `npm run dev` shares `.next/` — never run them at
the same time. `npm run test:e2e` rebuilds `out/`, so don't run it alongside a build either.

## Behavioral gate

The behavioral gate is **Playwright** (`@playwright/test`, Chromium): end-to-end tests in `e2e/`,
run against the real static export. `playwright.config.ts` serves `out/` with `http-server` on
`http://127.0.0.1:3100` (exact-match files and trailing-slash directory indexes, like Firebase
Hosting; no SPA fallback), reusing a server that is already up outside CI. **`out/` must be
current** — run `npm run build` first, or use `npm run test:e2e`, which builds and then tests.
It covers what the compiler and linter cannot: hydration/console errors, rendered content,
routing and trailing-slash URLs, theme toggle and FOUC, scroll-spy, the mobile drawer, layout at
set viewports. `npm run build` stays a gate too: it alone catches server/client boundary
violations, `generateStaticParams` gaps and blog frontmatter validation.

**Test file conventions:**

- One spec file per feature: `e2e/<slug>.spec.ts`, the slug being the feature folder name.
  `e2e/site-smoke.spec.ts` is the baseline (landing page, blog index/post, RSS and sitemap).
- One test per `E2E-` row, its title starting with the id: `E2E-03: <what it checks>`. The
  single-test command above then runs exactly that check.
- Paths come from the route table in `CLAUDE.md` and absolute URLs from `absoluteUrl()` /
  `SITE_URL`'s expectations — never a hard-coded origin. Use relative paths with `baseURL`.
- Locate by role, label or text; use web-first assertions; never a fixed sleep. Check theme
  behaviour via the `data-theme` attribute and tokens, not raw colour values.
- Each test starts from a fresh browser context; do not depend on another test's state.
- Traces are off by default (`trace: "off"`); re-run a failing test with `--trace on` to debug.

**`manual` is the exception**, reserved for what the runner cannot observe: what a screen reader
announces, and visual judgements no assertion expresses (does the new section *look* right).
A `manual` check is run by a human in a browser and is reported as pending until they do. Don't
claim a UI or flow change works on the strength of typecheck, lint and build alone.

**Verification methods for an `E2E-` row:** `e2e` (the norm for runtime behaviour), `compiler`
(typecheck / lint with no new errors / build proves it, e.g. a duplicate blog slug failing the
build) or `manual`.

## Feature docs

Every feature owns one folder, `docs/features/<slug>/`. The slug is the folder name and never
changes; resolve it with `ls docs/features/<slug>`. No file name carries a date or a number.

| File | Written by | Committed |
| --- | --- | --- |
| `docs/requirements/<requirement-slug>.md` | `/feature-discovery` Mode A | yes |
| `story.md` | `/feature-discovery` Mode B | yes |
| `spec.md`, `impact.md` | `/feature-spec` (`spec.md` §8 is the implementation plan) | yes |
| `PROGRESS.md` | `/sdd` — scratch run state | no (git-ignored) |
| `log.md` | `/sdd` | yes |

`requirement/` (singular) and `spec/` (singular) are the older `/user-story-creator` output
folders and stay as they are. The pipeline never reads or writes them.

- **Standing context:** `docs/features/OVERVIEW.md` §1–3 only. Section 4 is only an index.
- **Orientation map:** `CLAUDE.md` (invariants, commands, routes, conventions), with
  `Reference.md` for component tree, token catalog and extension points on demand.
- **Design system:** the CSS custom properties in `src/app/globals.css` (`--background`,
  `--foreground`, `--surface`, `--accent-blue`, `--accent-rose`, `--border`, `--shadow-*`),
  described in `Reference.md`. Read it before specifying or touching UI. It never overrides a
  story's functional scenarios. New UI design direction goes through `design-taste-frontend`;
  reworking existing UI through `redesign-existing-projects`.
- **Domain entry point:** the story's `domain:` line, if any. Otherwise start discovery from
  `CLAUDE.md` § Invariants, `src/lib/site.ts`, `src/lib/blog/types.ts` and `content/blog/`.
- **Verification vocabulary:** an `E2E-` check is `compiler`, `e2e` or `manual` (see § Behavioral gate). `e2e` is the norm for runtime behaviour; its test lives in the feature's spec file.
- Another feature is read only through its `spec.md`; never open another feature's `story.md`.

## Layers

Used for a task's `[Layer]` tag in `/sdd` and for gate tiering below.

| Layer | Covers |
| --- | --- |
| `data` | `content/blog/*.md`, `src/lib/blog/posts.ts`, `src/lib/blog/types.ts`, certification/experience/project data held in the components |
| `domain` | `src/lib/site.ts`, `src/lib/blog/markdown.ts`, `src/lib/blog/rss.ts`, `src/lib/blog/index.ts`, date formatting (`formatDate`) |
| `route` | `src/app/**/page.tsx`, `layout.tsx`, `src/app/rss.xml/route.ts`, `sitemap.ts`, `robots.ts`, `next.config.ts`, `firebase.json`, `.github/workflows/` |
| `ui` | `src/app/components/**`, `src/app/globals.css` (tokens), `ThemeProvider.tsx` |
| `legacy` | none |
| `test` | `e2e/`, `playwright.config.ts` |

## Known-dirty paths

None. A clean checkout shows a clean `git status`. (The `npm run lint` failure at
`ThemeProvider.tsx:25` is a known pre-existing lint result, not a dirty path.)

## Gate risk tiers

**Two independent review gates** for tasks touching:

- `src/lib/**` — shared blog loader, `SITE_URL`/`absoluteUrl()`, date formatting, RSS generation
- `next.config.ts`, `firebase.json`, `package.json`, `.github/workflows/` — the three-place
  `trailingSlash` agreement, static export, the deploy pipeline
- Route handlers and metadata routes (`rss.xml/route.ts`, `sitemap.ts`, `robots.ts`) and
  `generateStaticParams` / `generateMetadata` in the blog pages
- `src/app/layout.tsx` — root metadata and the pre-paint theme script
- Any change that moves a file across the server/client boundary, or adds `"use client"`, in a
  file that imports from `@/lib/blog`

**One combined gate** for:

- Presentation-only changes in `src/app/components/**` that touch none of the above
- Styling or design-token changes in `globals.css`
- Content-only changes (`content/blog/*.md` copy, `docs/`, `requirement/`, `spec/`)
- Test-only changes that add or fix specs under `e2e/` without touching source
- Route or page wiring that doesn't change what data is fetched or how
