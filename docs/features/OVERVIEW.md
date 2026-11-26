# my-portfolio — Feature Overview

Standing context for every feature. `/help-discover-this` and `/spec-this` read §1–3 before any
analysis; §4 is only an index. Individual stories assume this context and don't repeat it.

## 1. Product Overview

my-portfolio is the personal portfolio and blog of Keith Lim, published at
`https://thegoldenpothos.dev`. It is a statically exported Next.js site (no server at runtime)
served by Firebase Hosting: a single-page scroll landing page (Hero, About, Experience, Tech
Stack, Projects, Certifications) plus a build-time Markdown blog with RSS, sitemap and robots.

The one job it must do well is present Keith's professional work credibly and quickly: hiring
managers and recruiters skim the landing page; peers and search visitors read blog posts. The
owner (Keith) is the only author — content is committed to the repo, not entered through any UI.

## 2. Confirmed Requirements

Decisions the user has confirmed. Later features inherit them without re-litigating. A story that
conflicts with anything here stops and asks. `/help-discover-this` appends to this section when a
sweep confirms a decision that later features would otherwise reopen.

1. The site is statically exported (`output: "export"`); no feature may require a server, API route, middleware or request-time rendering.
2. Blog content lives in `content/blog/*.md` in this repo and is trusted; there is no CMS and no user-submitted content.
3. Theming uses CSS custom properties with a `[data-theme="dark"]` override, not Tailwind dark variants.
4. `trailingSlash: true` stays consistent across `next.config.ts`, `firebase.json` and `absoluteUrl()`.

## 3. Assumptions to Confirm

Things the pipeline is treating as true but nobody has confirmed. Specs say which number they rely
on. Move an item to §2 when it is confirmed.

1. None recorded yet. `/help-discover-this` appends here when a sweep surfaces an unconfirmed assumption.

## 4. Feature Index

One row per feature, appended by `/help-discover-this` Mode B and `/agentic-discover`. Titles and links only.

| Feature | Story |
| ------- | ----- |
