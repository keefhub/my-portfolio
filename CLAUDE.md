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
