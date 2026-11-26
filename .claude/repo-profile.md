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
| `npm run build` | Every task touching `src/`, `content/`, `public/`, `next.config.ts`, `firebase.json` or `package.json`, and before a feature's plan is marked complete | Exits 0 — this is the static export, the real gate |

There is **no test framework** and no e2e runner. Do not add one (Playwright, Vitest, Jest…)
without asking the user first.

`npm run build` writes `.next/` and `out/`, and `npm run dev` shares `.next/` — never run them at
the same time.

## Behavioral gate

The behavioral gate is **`npm run build`**: the static export (`output: "export"`) is the only
step that catches server/client boundary violations (`server-only` blog barrel pulled into a
client bundle), `generateStaticParams` gaps, route-handler `force-static` misses, and blog
frontmatter validation failures (missing field, bad date, duplicate slug). It runs the real app
code paths at build time, which typecheck and lint cannot.

It cannot observe runtime browser behaviour: hydration warnings, scroll-spy, the mobile drawer,
theme toggle and FOUC, Framer Motion triggers, layout at a given width, what a screen reader
announces. Those checks are `manual`.

**Verification methods for an `E2E-` row** (the id prefix is kept because the skills match it):

- `compiler` — `npm run typecheck`, `npm run lint` (no new errors) or `npm run build` proves it.
  Prefer this whenever it is honest: a blog rule like "a duplicate slug fails the build" is
  checkable by adding a fixture post and running the build.
- `manual` — a human in a browser checks it, reported as **pending** until they do. Use it for
  anything listed above as unobservable. A row names the page, viewport and theme to check.
- `e2e` — **not available** in this repo. Do not write a spec row with this method unless the
  user has first approved adding a runner; if they do, update this profile in the same change.

Don't claim a UI or flow change works on the strength of typecheck, lint and build alone — say
which `manual` checks are still pending.

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
- **Verification vocabulary:** an `E2E-` check is `compiler` or `manual` (see § Behavioral gate).
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
| `test` | none — no test framework exists |

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
- Route or page wiring that doesn't change what data is fetched or how
