# The public site shows the content managed in the admin panel: decomposition

- **Intent:** `docs/requirements/public-site-reads-database-intent.md`
- **Date:** 2026-11-28

## Restatement

Every public page (profile, experience, tech stack, projects, certifications, blog list, posts, RSS and
sitemap) shows the content the owner saved in the admin panel, refreshed only when the owner presses
Publish, kept as the last good copy while the database is unreachable, with no content left in the repo
(matches intent §1).

## Impact analysis

Verified against the tree and `git` on 2026-11-28. No `docs/features/` story was opened; no existing story
collides (the panel stories only write the database; none reads it for the public site).

- **Built and unchanged by this goal:** the owner-only panel with seven screens and the post preview, the
  owner-only routes under `src/app/api/admin/**`, the tables and their SQL (`src/lib/server/sql.ts`,
  `listSql.ts`, `postSql.ts`), Auth.js (`src/lib/auth.ts`, `getPanelState()`), and the one public read
  `/api/admin/blog-posts/published/` (published posts only; `force-dynamic`, no public page calls it yet).
- **Public site is still repo content:** hard-coded arrays in `hero.tsx` (social links), `experienceTimeLine.tsx`,
  `techstack.tsx`, `project.tsx`, `certifications.tsx`; About text in `aboutme.tsx`; footer name; posts read from
  `content/blog/*.md` (two files) through `src/lib/blog/posts.ts` (`fs`, `gray-matter`, build-time).
- **Public pages today are static:** `/blog/[slug]` has `generateStaticParams` and `dynamicParams = false`;
  `rss.xml`, `sitemap.ts`, `robots.ts` are `force-static`; `header.tsx` is a client component with a fixed
  `sections` list of four menu links.
- **No Publish exists:** `grep` for "publish" in `AdminPanel.tsx`, `src/app/bright-warm-greenhouse/` and
  `src/lib/admin/sections.ts` finds nothing. Saving writes to the database only.
- **Standing conflicts:** the intent supersedes `OVERVIEW.md` §2 items 1, 2 and 5 and `CLAUDE.md` invariants 1
  and 3 and the Blog authoring section. The intent rules this itself (§4 last row), so it is recorded as
  `[human: intent §4]`, not a stop. `OVERVIEW.md` §3 holds nothing.

### Touched modules

| Path | read / write | Why |
| --- | --- | --- |
| `src/app/page.tsx`, `src/app/layout.tsx` | write | The landing page reads profile and list content on the server, drops sections with no content; the footer name comes from the profile |
| `src/app/components/{hero,aboutme,experienceTimeLine,techstack,project,certifications,footer,header}.tsx` | write | Take their content as props instead of arrays in the file; the menu shows only links of sections that have content |
| `src/app/blog/page.tsx`, `src/app/blog/[slug]/page.tsx`, `src/app/components/blog/*` | write | List and detail read published posts from the database; the detail page accepts slugs not known at build and returns not found for unknown or draft slugs |
| `src/app/rss.xml/route.ts`, `src/app/sitemap.ts` | write | Read published posts from the database; keep the content type and the UTC dates |
| `src/lib/blog/*`, `src/lib/markdown.ts` | write | `posts.ts` (filesystem, `gray-matter`) goes; markdown rendering and `formatDate` stay and render a post body that came from the database |
| `src/lib/server/*` (`postStore.ts`, `listStore.ts`, `profile.ts`, `imageStore.ts`) | read, small write | Reused for public reads (published posts only); a public-read module with the kept copy is the one new boundary |
| `src/app/api/admin/publish/route.ts` (new) | write | Owner-only POST that refreshes the public pages; checks `getPanelState()` before anything else |
| `src/app/components/admin/AdminPanel.tsx`, `src/lib/admin/sections.ts` | write | A Publish button with disabled, success and failure states |
| `next.config.ts`, `vercel.json` | read | `trailingSlash` and `images.unoptimized` stay; no `output`, no new setting |
| `content/blog/*.md`, `src/lib/blog/posts.ts` and the hard-coded arrays above | write (delete) | Content lives only in the database |
| `e2e/*.spec.ts`, `playwright.config.ts` | write | Each slice's own spec; the test run keeps its stand-in database |
| `CLAUDE.md`, `Reference.md`, `docs/features/OVERVIEW.md`, `README.md` | write | Amend the rules the goal makes false, split across slices (Decision 12) |

### New surface

- **Persisted today:** the six content tables and the `images` table in Supabase, already written by the
  panel. Nothing new is stored: no table, column or setting. Posts have no `updated` date (Decision 8).
- **New:** one server-only public-read module that reads the saved content (published posts only) and keeps
  the last good result; one owner-only endpoint `/api/admin/publish/`; the Publish button in the panel;
  public pages that are generated on first request or at build and refreshed only by Publish or a deploy.
- **Not new:** no dependency, no environment variable, no external or paid service (intent §4, §5).

### Migration risk

The database starts with whatever the owner has saved in the panel. Today's repo content is deleted by the
slices, so until the owner re-enters it (Human-only) a public section is hidden and the blog list is empty.
This is accepted by the intent (§2.4). Mitigation: each slice deletes only the content it replaces, the pull
request names the commits that remove each piece so the owner can read the old content from git, and the
live site is not changed until `develop` is merged into `master`.

### What already covers part of this

The panel's saving and validation, the owner check, the published-only post read and the markdown renderer
already exist. The goal adds the public read, Publish and the removal of the repo copy.

## Slices

| Slug | Title | User goal | Intent lines served | Scenarios (est.) | Depends on | Needs (intent §4) |
| --- | --- | --- | --- | --- | --- | --- |
| `owner-publishes-profile` | Owner publishes the profile | As the owner, I save my profile in the panel and press Publish so that the hero, About text, footer and menu show it | §1; §5 owner-only publish, save is not visible, failed publish, section hidden when empty, no secrets or database code in the browser; §6 lines 1, 2, 7, 8 (partly), 6 (failure message) | 7 | `owner-edits-profile` (built), `owner-google-sign-in` (built) | Public pages read Supabase and keep the last copy (approved); rewrite of the prerender rule (approved) |
| `owner-publishes-experience` | Owner publishes experience | As the owner, I publish my experience entries so that the Experience section shows them in my order | §1; §5 save is not visible, section hidden when empty; §6 1, 2 | 5 | `owner-publishes-profile` | None beyond the first slice |
| `owner-publishes-tech-stack` | Owner publishes the tech stack | As the owner, I publish my tech categories and their items so that the Tech Stack block shows them | §1; §5 save is not visible, section hidden when empty; §6 1, 2 | 5 | `owner-publishes-experience` (shares the Experience section) | None beyond the first slice |
| `owner-publishes-projects` | Owner publishes projects | As the owner, I publish a changed project so that the Projects section shows it within a minute | §1; §5 save is not visible, section hidden when empty, a failed publish leaves the section unchanged, only the signed-in owner can publish; §6 1, 2, 6, 7 | 5 | `owner-publishes-profile` | None beyond the first slice |
| `owner-publishes-certifications` | Owner publishes certifications | As the owner, I publish certifications, or delete them all, so that the section shows them or disappears with its menu link | §1; §5 section hidden when empty; §6 5 | 5 | `owner-publishes-profile` | None beyond the first slice |
| `owner-publishes-blog-posts` | Owner publishes blog posts | As the owner, I publish a post so that it is listed on the blog page and readable at its own address, and a draft is not | §1; §5 draft never public; §6 3 (list and address), 4 (list and address), 9 (posts) | 7 | `owner-publishes-profile` | New post addresses without a code change (approved) |
| `owner-publishes-posts-to-feeds` | Owner publishes posts to RSS and the sitemap | As the owner, I publish a post so that RSS and the sitemap list it, and a draft appears in neither | §5 draft never public; §6 3 (RSS, sitemap), 4 (RSS, sitemap) | 4 | `owner-publishes-blog-posts` | None beyond the first slice |
| `site-survives-database-outage` | Visitors never see an error when the database is down | As a visitor, I keep seeing the last published content on every public page while the database cannot be reached | §1; §2.5; §5 database unreachable; §6 6 (pages) | 5 | all section and post slices above | The kept copy (approved) |
| `retire-repo-content` | Retire the repo's copy of the content and amend the standing docs | As the owner, I want one source of content so that the repo holds none and the project documents describe the new rules | §5 no hard-coded content, no posts, no new dependency or setting, existing rules hold, no secrets; §6 9 | 4 | all slices above | Rewrite of standing rules and docs (approved) |

## Run order

New rows are placed after row 20 (`retire-firebase`) of the `CLAUDE.md` order table. Dependency order,
earliest first.

| # | Slug | Why here | Status |
| --- | --- | --- | --- |
| 21 | `owner-publishes-profile` | First, because it carries what every later slice reuses: the Publish button and its owner-only endpoint, the public read with its kept copy, the hidden-when-empty rule with the menu link, and the amendment of the rules the switch makes false | pending |
| 22 | `owner-publishes-experience` | First list section; reuses Publish and the kept copy, settles how an ordered list reaches a public component | pending |
| 23 | `owner-publishes-tech-stack` | Shares the Experience section's page block (Decision 5); nested items and icons from the image library | pending |
| 24 | `owner-publishes-projects` | Reuses the list pattern; no menu rule of its own beyond the shared one | pending |
| 25 | `owner-publishes-certifications` | Reuses the list pattern; proves the whole section and its menu link disappear (§6 line 5) | pending |
| 26 | `owner-publishes-blog-posts` | Most rules (draft, unknown address, new addresses without a build); the rendered body comes from the database | pending |
| 27 | `owner-publishes-posts-to-feeds` | Needs published posts to read; small and separately demonstrable | pending |
| 28 | `site-survives-database-outage` | Needs every public page to read the database first; hardens and proves the kept copy across all of them | pending |
| 29 | `retire-repo-content` | Last, because every other slice removes only what it replaces; this one checks that nothing is left and amends the remaining docs | pending |

## Coverage of the intent

| Intent line (§5 constraint or §6 definition of done) | Slice(s) |
| --- | --- |
| §5 Draft never in list, at its address, in RSS or in the sitemap | `owner-publishes-blog-posts`, `owner-publishes-posts-to-feeds` |
| §5 Database unreachable: last published content, never an error | `site-survives-database-outage` (the pages), `owner-publishes-profile` (the Publish failure) |
| §5 Only the signed-in owner can publish; the server refuses everyone else | `owner-publishes-profile` (the endpoint); every later slice reuses it |
| §5 Saving does not change what visitors see until Publish | `owner-publishes-profile`, then each section slice |
| §5 Section with no content hidden, with its menu link | `owner-publishes-profile` (About), `owner-publishes-experience`, `owner-publishes-tech-stack`, `owner-publishes-projects`, `owner-publishes-certifications` |
| §5 Failed publish leaves pages unchanged, panel shows the failure | `owner-publishes-profile` |
| §5 No secret, database address or owner email in the browser, repo or logs | every slice; checked as a whole in `retire-repo-content` |
| §5 No database code in visitors' browsers | every slice (server-only reads); checked as a whole in `retire-repo-content` |
| §5 No hard-coded content, no `content/blog/*.md` posts | each section slice deletes its own copy; `owner-publishes-blog-posts` deletes the posts; `retire-repo-content` checks nothing remains |
| §5 SIT and live use different databases; a publish on one never changes the other | `owner-publishes-profile` (a publish refreshes only the deployment that received it, no call to another site); `retire-repo-content` (checks no setting or address names the other environment) |
| §5 No new dependency, setting, external or paid service | every slice; checked in `retire-repo-content` |
| §5 Existing rules hold (`trailingSlash`, UTC dates, one origin constant, unoptimised images, tokens, owner-only panel) | every slice; checked in `retire-repo-content` |
| §6 1 Change a project, Publish, visible within a minute | `owner-publishes-projects` (also proved on the profile in `owner-publishes-profile`) |
| §6 2 Before Publish a saved change is not visible | `owner-publishes-profile` and each section slice |
| §6 3 Published post listed, readable, in RSS and sitemap | `owner-publishes-blog-posts`, `owner-publishes-posts-to-feeds` |
| §6 4 Draft absent from list, address, RSS, sitemap | `owner-publishes-blog-posts`, `owner-publishes-posts-to-feeds` |
| §6 5 All certifications deleted and Publish: section and menu link gone | `owner-publishes-certifications` |
| §6 6 Database unreachable: pages show last content; Publish shows a failure | `site-survives-database-outage`, `owner-publishes-profile` |
| §6 7 Publish refused when signed out or as another account | `owner-publishes-profile` |
| §6 8 Publishing on SIT leaves live unchanged | `owner-publishes-profile`; see Open findings 1 |
| §6 9 No hard-coded content and no posts in the repo | the section slices, `owner-publishes-blog-posts`, `retire-repo-content` |

## Decisions

1. [human: intent §4] Rules replaced: public pages prerender at build time (`OVERVIEW.md` §2 item 1, `CLAUDE.md` invariant 1) and blog content lives in `content/blog/*.md` (§2 items 2 and 5) become "public pages read the database and keep the last good copy; content lives only in Supabase". Not a stop: the intent rules it.
2. [human: intent §4] How pages stay fresh: Vercel's kept copies of pages (incremental regeneration), refreshed on Publish and at a code deploy, never on a timer, so a save does not leak before Publish. No deploy hook, no new setting.
3. [auto] One Publish button for the whole site, not one per section: the panel header, and one endpoint `/api/admin/publish/` that refreshes every public page. Why: the intent says "Publish" once; the owner edits a few times a month. The endpoint sits under `src/app/api/admin/` because the mechanical gate allows no other new route path.
4. [auto] First slice carries the shared mechanism (Publish, endpoint, public read, kept copy, hidden-when-empty rule) together with the profile, because a Publish nobody can use on a page is not a slice a person can act out. Why: avoids a layer-only foundation slice.
5. [auto] Experience and Tech Stack are separate slices although they share the `#experience` section block on the page. Why: they are separate panel screens and tables; the menu link `experience` shows when either has content.
6. [auto] No saved profile: the hero, the About section and its menu link are not shown, and the rest of the page renders. Why: intent §2.4 hides a section with no content; the hero holds the owner's name, so with no name it is hidden too.
7. [auto] The profile's social links carry a label and an address while the hero shows an icon: the icon is chosen from the address (GitHub, LinkedIn, `mailto:` gives the mail icon, anything else a generic link icon); the email field and the resume link keep their own icons. Why: the simple way the intent §8 asks for, with no new field.
8. [auto] Posts have no `updated` date: the sitemap's last-modified date and the post page use the post's date. Why: the panel stores none; the intent §8 asks for the simple way.
9. [auto] A post address not known at build time works without a rebuild (the detail page accepts new slugs); an unknown, deleted or draft slug returns not found. Why: required by intent §4 ("New blog posts appear at their own address without a code change").
10. [auto] A database that is unreachable at a code deploy may fail that deploy and the previous one stays live. Why: accepted by intent §4 ("Cost or risk accepted").
11. [auto] Publish handles repeat presses by disabling the button while it works; no queueing. Why: intent §8.
12. [auto] Standing docs are amended where the rule becomes false: `owner-publishes-profile` amends `OVERVIEW.md` §2 and `CLAUDE.md` invariant 1 and the routes table; `owner-publishes-blog-posts` amends invariant 3 and Blog authoring; `retire-repo-content` sweeps `Reference.md`, `README.md` and the order table. Why: precedent set by `owner-google-sign-in`; the pull request flags the rewrite (intent §4).
13. [auto] Each section slice deletes the hard-coded content it replaces in its own commit, and the pull request lists those commits so the owner can re-enter the content. Why: intent §8, and two copies would drift.
14. [auto] Blog post HTML stays trusted; no sanitiser is added. Why: intent §3 non-goal and §2.4.
15. [auto] No one-time import, scheduled posts, keep-awake, full-site preview, history or rollback, deploy hook, or new setting in any slice. Why: intent §3, §4.
16. [auto] `owner-publishes-blog-posts` and `owner-publishes-posts-to-feeds` are two slices. Why: the first would exceed seven scenarios with the list, the detail page, drafts, unknown addresses, featured posts and both feeds.
17. [auto] The public read does not call `auth()`, read cookies or headers, or import `@/lib/auth`; only the Publish endpoint decides access. Why: a public page that touches request data stops being kept; invariant 1 stays true in that part.

## Human-only

- Re-enter today's content by hand in the SIT database, and check SIT against today's live site.
- Re-enter today's content in the live database and compare the live site section by section before merging `develop` into `master`; the pull request says not to merge to `master` until this is done.
- Restore the Supabase project in its dashboard if it pauses.
- Review and merge the pull request into `develop`, and later `develop` into `master`.

## Rejected splits

- **A "public read module" foundation slice.** Nobody could act it out in the app; folded into `owner-publishes-profile` (Decision 4).
- **Publish button and endpoint as their own slice.** The owner could press it with nothing public to change; folded into the first slice.
- **One slice per page (landing, blog list, post, RSS, sitemap).** Splits by layer of the site rather than by what the owner publishes; blog list and post share one goal, and feeds were split only for size (Decision 16).
- **One slice for all five landing sections.** Fails the sizing tests (about 20 scenarios, five content shapes).
- **Per-section Publish buttons.** The intent names one Publish; more buttons add states with no stated need.

## Open findings

1. Intent §6 line 8 and §5 (publishing on SIT leaves live unchanged) cannot be shown by one run of the end-to-end tests, which have a single stand-in database. `owner-publishes-profile` covers that a publish refreshes only the receiving deployment; the "different databases" half is a manual check for the acceptance stage to list as pending, never as passed.
2. Intent §6 line 6 (database unreachable) depends on Vercel keeping the last good copy when a refresh fails. `site-survives-database-outage` proves it with the test stand-in; the real Vercel behaviour on the free plan is a manual check on SIT.
3. `owner-publishes-profile` depends on Vercel's incremental regeneration working with a PostgreSQL read that is not `fetch`. Intent §4 approves the approach but not a specific mechanism, so the spec writer must pick one that adds no dependency and no setting, and `owner-publishes-profile` stops if none exists.
