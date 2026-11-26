# Admin content panel: decomposition

- **Intent:** `docs/requirements/admin-content-panel-intent.md`
- **Date:** 2026-11-26

## Restatement

The owner can change all of the portfolio's content (profile and about, experience, projects,
certifications, tech stack, markdown blog posts) from a private, Google-sign-in panel at
`/bright-warm-greenhouse/`, backed by a Firestore database only the owner can write, while the public site
keeps rendering from the repo until phase 2 (matches intent §1).

## Impact analysis

Reused from the earlier `/help-discover-this` Mode A decomposition, re-verified against the tree on
2026-11-26: `git log --grep="^feat("` lists only `feat(blog)`; `docs/features/` holds only `OVERVIEW.md`; the
CLAUDE.md order table and OVERVIEW §4 are empty; no `firebase` dependency, rules file, `src/lib/firebase/`
or `src/app/bright-warm-greenhouse/` exists. `firebase.json` has only a `hosting` block, `robots.ts` has a
single `allow: "/"` rule, and `playwright.config.ts` serves `out/` with `http-server`. Image fields are text
paths to files under `public/` (intent §3, §8); the earlier `images` collection and image-library slice are
dropped.

### Touched modules

| Path | read / write | Why |
| --- | --- | --- |
| `src/app/components/experienceTimeLine.tsx` | read | `ExperienceItem` (`year`, `title`, `company`, `duration`, `description`, `details[]`) is the shape for `experience` |
| `src/app/components/project.tsx` | read | `Project` (`title`, `shortDesc`, `description[]`, `tech[]`, `github`, `demo`) is the shape for `projects` |
| `src/app/components/certifications.tsx` | read | `Certification` (`name`, `icon`, `url`) is the shape for `certifications` |
| `src/app/components/techstack.tsx` | read | `TechCategory` (`category`, `items[] {name, icon}`) is the shape for `techCategories` |
| `src/app/components/hero.tsx`, `aboutme.tsx`, `footer.tsx` | read | Name, headline, about paragraphs, email, social links: the shape for `profile` |
| `src/lib/blog/types.ts` | read | `BlogFrontmatter` is the shape for `blogPosts`; `formatDate()` is reused. Client code imports this path only (Invariant 3) |
| `src/lib/blog/markdown.ts` | read | The unified pipeline the in-browser preview must reproduce; it sits behind `server-only` imports, so the panel needs its own client-safe pipeline |
| `src/app/layout.tsx`, `src/app/globals.css` | read | Metadata template, theme script and the colour tokens the panel styles against |
| `src/app/sitemap.ts`, `src/app/robots.ts` | read | Must not list or mention the panel route (a `Disallow` line would publish it); a test asserts absence |
| `src/app/bright-warm-greenhouse/` | write (new) | The panel route, a static page with client-side section views and `noindex` metadata |
| `src/lib/firebase/` | write (new) | Client-only app init with the committed web config, auth helpers, typed collection accessors; never imported by public pages |
| `firestore.rules` | write (new) | The security boundary: owner-only writes, draft posts owner-only reads, owner ID placeholder |
| `firebase.json` | write | Gains `firestore` rules entry and `emulators` config; `hosting` block and `trailingSlash` unchanged |
| `package.json` | write | Dependency `firebase`; dev dependency `firebase-tools`; scripts for the emulators and rules deploy |
| `.github/workflows/pipeline.yml` | write | Both deploy jobs also deploy the rules; CI still runs typecheck, lint, build and no e2e |
| `playwright.config.ts` | write | Panel specs need the Auth and Firestore emulators next to the static server; public smoke specs stay unaffected |
| `.claude/repo-profile.md` | write | "There is no database" stops being true; add emulator/Java notes to the verification facts |
| `docs/features/OVERVIEW.md` | read | §2 item 5 already records the owner's ruling on §2.2; no rewrite needed |

### New surface

- **Route:** `/bright-warm-greenhouse/` exporting `out/bright-warm-greenhouse/index.html`. Sections are
  client-side views of one page, so no new routes and no `generateStaticParams`.
- **Modules:** `src/lib/firebase/` (client-only), a client-safe markdown renderer for the preview.
- **Database (Firestore, Spark plan, project `thegoldenpothos-5b3a1`):** collections `profile` (single
  doc `main`), `experience`, `projects`, `certifications`, `techCategories`, `blogPosts` (doc id is the
  slug). Every record has `updatedAt`; list collections have `position`. Fields mirror today's component
  shapes; `blogPosts` has `title`, `excerpt`, `date`, `updated`, `tags[]`, `draft`, `featured`,
  `coverImage`, `coverAlt`, `body`, `createdAt`. Image fields are path strings under `public/`.
- **Files:** `firestore.rules`, emulator entries in `firebase.json`.
- Persisted today: nothing. The site has no database, no auth and no environment variables.

### Migration risk

None for stored data: nothing persisted changes, and Firestore starts empty (the owner retypes content).
Until phase 2 the database and the repo are two copies that can drift (intent §4). The one operational
risk is the rules deploy failing until the owner grants the deploy account the Rules Admin role (intent
§7); the deploy slice treats that as expected and human-only.

### What already covers part of this

None. `formatDate()` and the CSS tokens are reused as-is.

## Slices

| Slug | Title | User goal | Intent lines served | Scenarios (est.) | Depends on | Needs (intent §4) |
| --- | --- | --- | --- | --- | --- | --- |
| `admin-sign-in` | Admin sign-in | The owner opens `/bright-warm-greenhouse/`, signs in with Google, sees the section menu and can sign out; any other account is told it is not allowed and sees nothing | Goal; users (anyone else); §5 static export, signed-out/non-owner shows no content, no secrets, tokens, public pages unchanged and Firebase-free, no-index and absent from sitemap/robots; §6 lines 1, 2, 3, 12, 13, 14 | 7 | none | `firebase`, `firebase-tools` (dev, Auth emulator), Auth with Google sign-in: approved |
| `admin-owner-only-access` | Owner-only database access | The database accepts content changes only from the owner's account, and the owner can tell, with the panel's own message and user ID, when saving is not yet switched on | §5 refuses non-owner writes, placeholder refuses all, draft unreadable, no pay-as-you-go, no secrets; §6 lines 4, 10 | 6 | `admin-sign-in` | Firestore, rules in repo and deployed by pipeline, owner user-ID placeholder: approved |
| `manage-profile` | Manage profile | The owner edits name, headline, about paragraphs, photo path, email, resume link and social links, saves, reloads and sees them | Goal; §6 line 5 | 5 | `admin-owner-only-access` | none new |
| `manage-experience` | Manage experience | The owner adds, edits, reorders and deletes (after confirming) work and education entries; builds the shared list-editor pattern | Goal; §5 no delete without confirmation; §6 lines 6, 11, 12 | 7 | `admin-owner-only-access` | none new |
| `manage-projects` | Manage projects | The owner adds, edits, reorders and deletes (after confirming) projects | Goal; §5 confirmation; §6 lines 6, 11, 12 | 6 | `manage-experience` (list-editor pattern) | none new |
| `manage-certifications` | Manage certifications | The owner adds, edits, reorders and deletes (after confirming) certifications, with a badge image path | Goal; §5 confirmation; §6 lines 6, 11, 12 | 6 | `manage-experience` | none new |
| `manage-tech-stack` | Manage tech stack | The owner manages tech categories and their items (name and icon path), reorders and deletes after confirming | Goal; §5 confirmation; §6 lines 6, 11, 12 | 7 | `manage-experience` | none new |
| `manage-blog-posts` | Manage blog posts | The owner writes, edits and deletes markdown posts with every frontmatter field, as draft or published, with unique slugs, and sees each post listed with its status | Goal; users; §2.4 drafts; §5 draft unreadable by others, confirmation; §6 lines 7, 8, 11, 12 | 7 | `manage-experience` | none new |
| `preview-blog-post` | Preview blog post | Before saving, the owner sees the post's markdown rendered the way the blog shows posts | §6 line 9, 12 | 4 | `manage-blog-posts` | none new (reuses the unified packages already installed) |

## Run order

Dependency order, earliest first. Status is one of `pending`, `written`, `BLOCKED: <what it needs>`.

| # | Slug | Why here | Status |
| --- | --- | --- | --- |
| 1 | `admin-sign-in` | The gate every other slice sits behind; carries the Firebase dependency, emulator set-up and the route | written |
| 2 | `admin-owner-only-access` | Rules must exist before any editor writes; shows the placeholder state to the owner | written |
| 3 | `manage-profile` | Simplest editor (one record); fixes the form and save pattern | written |
| 4 | `manage-experience` | First list; fixes the reorder and confirm-delete pattern the next three reuse | written |
| 5 | `manage-projects` | Reuses the list pattern; no new dependency | written |
| 6 | `manage-certifications` | Reuses the list pattern | written |
| 7 | `manage-tech-stack` | Reuses the list pattern, plus nested items | written |
| 8 | `manage-blog-posts` | Most rules (unique slug, dates, draft, status list), so after the pattern is settled | written |
| 9 | `preview-blog-post` | Needs the post editor to preview from | written |

## Coverage of the intent

| Intent line (§5 constraint or §6 definition of done) | Slice(s) |
| --- | --- |
| §5 Static export, no server | `admin-sign-in` (all slices keep it) |
| §5 Refuses writes from signed-out and non-owner | `admin-owner-only-access` |
| §5 Placeholder ID refuses every write | `admin-owner-only-access` |
| §5 Draft post unreadable except by owner | `admin-owner-only-access`, `manage-blog-posts` |
| §5 Signed out or non-owner panel shows no content | `admin-sign-in` |
| §5 No delete without accepted confirmation | `manage-experience`, `manage-projects`, `manage-certifications`, `manage-tech-stack`, `manage-blog-posts` |
| §5 No pay-as-you-go features | `admin-owner-only-access` (rules, no Storage or Functions); every slice by constraint |
| §5 Public pages unchanged, no Firebase script | `admin-sign-in` |
| §5 Panel absent from sitemap and robots, no-index | `admin-sign-in` |
| §5 No secret, personal email or `.env` | `admin-sign-in`, `admin-owner-only-access` |
| §5 Panel uses colour tokens, light and dark | every slice (checked per slice; shell in `admin-sign-in`) |
| §6 1 Signed-out sign-in control, no content | `admin-sign-in` |
| §6 2 Owner sees six-item menu | `admin-sign-in` |
| §6 3 Different account refused, offers sign-out | `admin-sign-in` |
| §6 4 Rules: signed-out and non-owner refused, owner succeeds | `admin-owner-only-access` |
| §6 5 Profile edit persists | `manage-profile` |
| §6 6 Add, edit, reorder, delete for four collections | `manage-experience`, `manage-projects`, `manage-certifications`, `manage-tech-stack` |
| §6 7 Write a post and see it listed with status | `manage-blog-posts` |
| §6 8 Duplicate slug refused | `manage-blog-posts` |
| §6 9 Markdown preview | `preview-blog-post` |
| §6 10 Draft unreadable signed out | `admin-owner-only-access` |
| §6 11 Cancelled delete keeps the record | the four list slices and `manage-blog-posts` |
| §6 12 375 pixels, no sideways scroll | every slice with a screen |
| §6 13 Public smoke tests pass, no Firebase script | `admin-sign-in` |
| §6 14 No-index, absent from sitemap and robots | `admin-sign-in` |

## Decisions

1. [human: intent §3, §8] Images: no `images` collection and no image-library slice; image fields are text
   paths to files under `public/`. Why: uploads are a non-goal.
2. [human: OVERVIEW §2 item 5] The static-export and blog-in-repo conflict (earlier §2.2) is already
   ruled by the owner; it is not re-litigated and no slice rewrites OVERVIEW.
3. [auto] Rules slice: kept as its own slice, not folded into sign-in. Option taken: separate
   `admin-owner-only-access`, whose visible behaviour is the owner seeing that saving is off, with their
   user ID, until the placeholder is replaced. Why: avoids a layer-only slice and keeps sign-in under the
   scenario limit.
4. [auto] Where firebase-tools lands: first slice, because the Auth emulator is needed to test sign-in.
5. [auto] Public reads: non-draft content collections are publicly readable and drafts owner-only, as phase 2
   needs them. Why: phase 2 reads from the database; the panel itself shows nothing when signed out.
6. [auto] Ordering: a `position` field with move-up and move-down controls, not drag and drop. Why: simplest,
   works at 375 px.
7. [auto] Concurrency: last save wins, no conflict detection (intent §8). Session time-outs and App Check
   deferred.
8. [auto] Shared list editor is built in `manage-experience`, and the three later list slices depend on it.
   Why: avoids a layer-only slice for a generic component.
9. [auto] Preview renderer: a client-safe unified pipeline mirroring `src/lib/blog/markdown.ts` plugins,
   never importing `@/lib/blog` (Invariant 3). Why: the server module is `server-only`.
10. [auto] A blog post's slug is its document id and cannot be changed after the first save; to rename, the
    owner creates a new post and deletes the old. Why: makes the unique-slug check a single create-if-absent
    and avoids silent overwrites.
11. [auto] A refused account sees its own Firebase user ID and a sign-out control, and is not signed out
    automatically (intent §8 allows showing it).
12. [auto] Tests: Playwright specs against the Auth and Firestore emulators, so Playwright stays the only
    runner; CI still runs no e2e. Emulators need Java (intent §4).
13. [auto] Date format: `YYYY-MM-DD` entered and displayed through `formatDate()` with UTC (Invariant 4).

## Human-only

- In the Firebase console: create the Firestore database (free plan), turn on Google as a sign-in
  provider, and make sure `thegoldenpothos.dev`, the staging address, `localhost` and `127.0.0.1` are
  on the allowed sign-in domains.
- After the first sign-in on the live site, copy the Firebase user ID the panel shows and put it in
  place of the placeholder, then deploy. Until then the panel can read but not save.
- Give the existing deploy service account (GitHub secret `FIREBASE_SERVICE_ACCOUNT`) the Firebase
  Rules Admin role, so the live deploy can deploy the rules. The secret's value is never touched.
- Check a real Google sign-in on the live site once. The automated tests use local stand-ins, not
  Google.
- Retype today's content into the panel.
- Review and merge the pull request into `develop`.

## Rejected splits

- **A "set up Firebase" foundation slice.** Nobody could act it out; the set-up lives in `admin-sign-in`.
- **Rules folded into `admin-sign-in`.** It would exceed seven scenarios and mix two boundaries (route and
  sign-in, database rules).
- **One "manage all content" slice.** Fails the scenario-count and module-boundary sizing tests.
- **Separate create, edit and delete slices per collection.** Each alone is not a useful increment.
- **Preview folded into `manage-blog-posts`.** Pushes it past seven scenarios and adds a second module
  boundary.
- **An image-library slice.** Dropped (decision 1).
- **A content import slice.** Not asked for; the owner retypes the content.

## Open findings

None.
