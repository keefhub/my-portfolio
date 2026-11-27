# my-portfolio — Feature Overview

Standing context for every feature. `/help-discover-this` and `/spec-this` read §1–3 before any
analysis; §4 is only an index. Individual stories assume this context and don't repeat it.

## 1. Product Overview

my-portfolio is the personal portfolio and blog of Keith Lim, published at
`https://thegoldenpothos.xyz`. The public site is prerendered Next.js
served by Vercel, with sign-in and the owner's admin panel the only parts that run on a server: a single-page scroll landing page (Hero, About, Experience, Tech
Stack, Projects, Certifications) plus a build-time Markdown blog with RSS, sitemap and robots.

The one job it must do well is present Keith's professional work credibly and quickly: hiring
managers and recruiters skim the landing page; peers and search visitors read blog posts. The
owner (Keith) is the only author — content is committed to the repo, not entered through any UI.

## 2. Confirmed Requirements

Decisions the user has confirmed. Later features inherit them without re-litigating. A story that
conflicts with anything here stops and asks. `/help-discover-this` appends to this section when a
sweep confirms a decision that later features would otherwise reopen.

1. Public pages are prerendered at build time. The server runs only sign-in and the panel (see item 6); no other feature may require a server, API route, middleware or request-time rendering.
2. Blog content lives in `content/blog/*.md` in this repo and is trusted; there is no CMS and no user-submitted content.
3. Theming uses CSS custom properties with a `[data-theme="dark"]` override, not Tailwind dark variants.
4. `trailingSlash: true` stays consistent across `next.config.ts`, `vercel.json` and `absoluteUrl()`.
5. Superseded in part by item 6 (hosting, sign-in and storage). Owner ruling, 2026-11-26 (`docs/requirements/admin-content-panel-intent.md`): item 2 is superseded in stages. A private owner-only admin panel at `/bright-warm-greenhouse/` edits all content (blog posts as markdown); until the phase-2 migration ships, the public site still renders from the repo (`content/blog/*.md` and component data).
6. Owner ruling, 2026-11-27 (`docs/requirements/hosting-and-backend-migration-intent.md`): hosting is Vercel (free plan), the owner signs in with Auth.js using their own Google account, and editable content and uploaded images move to Supabase (free plan); Firebase is removed. The static-export ruling is lifted for sign-in and the panel only, and public pages stay prebuilt; `trailingSlash: true` stays consistent across `next.config.ts`, `vercel.json` and `absoluteUrl()`. This supersedes the panel parts of items 1, 4 and 5. Only the owner's verified Google email (held in a setting, never committed) is allowed, and no secret value or owner email is committed. [human: intent §2.4, §4, §5]
7. Owner ruling, 2026-11-27 (`docs/requirements/hosting-and-backend-migration-intent.md`): uploaded images are PNG, JPEG, WebP or SVG, at most 5 MB each, and live in Supabase Storage. Anyone may open an uploaded image by its address. Only the owner may upload or delete one, and the server refuses any other request, including one sent without the panel. A delete asks for confirmation and is permanent. [human: intent §2.4, §5]

## 3. Assumptions to Confirm

Things the pipeline is treating as true but nobody has confirmed. Specs say which number they rely
on. Move an item to §2 when it is confirmed.

1. None recorded yet. `/help-discover-this` appends here when a sweep surfaces an unconfirmed assumption.

## 4. Feature Index

One row per feature, appended by `/help-discover-this` Mode B and `/agentic-discover`. Titles and links only.

| Feature | Story |
| ------- | ----- |
| Admin sign-in | [admin-sign-in](admin-sign-in/story.md) |
| Owner-only database access | [admin-owner-only-access](admin-owner-only-access/story.md) |
| Manage profile | [manage-profile](manage-profile/story.md) |
| Manage experience | [manage-experience](manage-experience/story.md) |
| Manage projects | [manage-projects](manage-projects/story.md) |
| Manage certifications | [manage-certifications](manage-certifications/story.md) |
| Manage tech stack | [manage-tech-stack](manage-tech-stack/story.md) |
| Manage blog posts | [manage-blog-posts](manage-blog-posts/story.md) |
| Preview blog post | [preview-blog-post](preview-blog-post/story.md) |
| Manage image library | [manage-image-library](manage-image-library/story.md) |
| Owner signs in with Google | [owner-google-sign-in](owner-google-sign-in/story.md) |
| Owner edits profile | [owner-edits-profile](owner-edits-profile/story.md) |
| Owner uploads images | [owner-uploads-images](owner-uploads-images/story.md) |
| Owner manages experience | [owner-manages-experience](owner-manages-experience/story.md) |
| Owner manages projects | [owner-manages-projects](owner-manages-projects/story.md) |
| Owner manages certifications | [owner-manages-certifications](owner-manages-certifications/story.md) |
| Owner manages tech stack | [owner-manages-tech-stack](owner-manages-tech-stack/story.md) |
| Owner manages blog posts | [owner-manages-blog-posts](owner-manages-blog-posts/story.md) |
| Owner previews blog post | [owner-previews-blog-post](owner-previews-blog-post/story.md) |
| Retire Firebase and document the new stack | [retire-firebase](retire-firebase/story.md) |
