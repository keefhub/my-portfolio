# Admin content panel

Requirement decomposition, written by `/help-discover-this` Mode A on 2026-11-26.

## Requirement

The owner changes site content by editing code today. The goal is to keep the content in a cloud
database and edit it through a panel. This document covers phase 1 of two:

- **Phase 1 (this document):** a sign-in-protected admin panel in this repo, at a hidden route,
  where the owner creates, edits and deletes the portfolio content and the blog posts. The content is
  stored in Firebase Firestore, with images in Firebase Storage.
- **Phase 2 (later, not decomposed here):** the public site reads its content from the database
  instead of the hard-coded component data and `content/blog/*.md`.

### Confirmed restatement (gate A0)

> Build a sign-in-protected admin section at a new route in this repo, where the owner can create,
> edit and delete the portfolio's content (profile and about, experience, tech stack, projects,
> certifications and blog posts, with post bodies kept as markdown). That content is stored in a new
> cloud database, using the recommended table design below. Moving the public site to read from the
> database is a separate, later phase.

### Rulings from the user

| # | Question | Ruling |
| --- | --- | --- |
| R1 | Who signs in | The owner only. One account; nobody else can ever get in. |
| R2 | Blog in scope | Yes. Post bodies stay in markdown format. |
| R3 | Conflict with OVERVIEW §2.1 (static export) | Keep the static export. The panel is a static page; security comes from database and storage rules that accept writes only from the owner's account. |
| R4 | Route | `/bright-warm-greenhouse/`, not `/admin/`. |
| R5 | Database | Firebase Firestore, in the existing Firebase project `thegoldenpothos-5b3a1`. |
| R6 | Sign-in method | Google account only, restricted to the owner's account. |
| R7 | Conflict with OVERVIEW §2.2 (blog in repo markdown, no CMS) | Replace §2.2 after phase 2. During phase 1 the panel edits posts in the database while the live site still reads `content/blog/*.md`. |
| R8 | Images | Uploaded through the panel to Firebase Storage. |
| R9 | Existing content | No import. The owner retypes today's content into the panel. |

## Impact analysis

How-explore was skipped. `CLAUDE.md`, `Reference.md`, `.claude/repo-profile.md` and a direct read of
the content components were enough to mark each module.

### What is built

`git log --grep="^feat("` lists one feature, `feat(blog)`: the static markdown blog with RSS and
sitemap. `docs/features/OVERVIEW.md` §4 is empty, so no pipeline story exists yet. Nothing built so
far covers any part of this requirement.

### Touched modules

| Path | Access | Why |
| --- | --- | --- |
| `src/app/components/experienceTimeLine.tsx` | read | `ExperienceItem` (`year`, `title`, `company`, `duration`, `description`, `details[]`) is the shape for `experience` |
| `src/app/components/project.tsx` | read | `Project` (`title`, `shortDesc`, `description[]`, `tech[]`, `github`, `demo`) is the shape for `projects` |
| `src/app/components/certifications.tsx` | read | `Certification` (`name`, `icon`, `url`) is the shape for `certifications` |
| `src/app/components/techstack.tsx` | read | `TechCategory` (`category`, `items[] {name, icon}`) is the shape for `techCategories` |
| `src/app/components/hero.tsx`, `aboutme.tsx`, `footer.tsx` | read | Name, headline, about paragraphs and social links, the shape for `profile` |
| `src/lib/blog/types.ts` | read | `BlogFrontmatter` is the shape for `blogPosts`; `formatDate()` is reused for dates in the panel |
| `src/lib/blog/markdown.ts` | read | The pipeline that `preview-blog-post` must reproduce in the browser |
| `src/app/layout.tsx` | read | Metadata template, theme script and the CSS tokens the panel uses |
| `src/app/sitemap.ts` | read | Must not list the admin route (it lists only static routes and posts today) |
| `src/app/robots.ts` | read | Must not mention the admin route, because a `Disallow` line would publish it |
| `firebase.json` | write | Gains `firestore` and `storage` rule entries and the emulator config. The `hosting` block and `trailingSlash` stay unchanged |
| `package.json` | write | New dependencies `firebase` and dev `firebase-tools` (emulators); scripts to run the emulators and deploy the rules |
| `.github/workflows/pipeline.yml` | write | The deploy jobs also deploy `firestore.rules` and `storage.rules`. CI stays typecheck, lint and build, with no e2e step |
| `playwright.config.ts` | write | The admin specs need the Auth, Firestore and Storage emulators running next to the static server |
| `.claude/repo-profile.md` | write | "There is no database" and "the site has no environment variables" stop being true. Update the verification and layers facts |

### New surface

- **Route:** `src/app/bright-warm-greenhouse/` (static, a client component tree, `noindex`, out of the
  sitemap and `robots.txt`). It exports to `out/bright-warm-greenhouse/index.html`. Sections inside
  it are client-side views, not further routes, so no `generateStaticParams` is needed for record
  ids.
- **Modules:** `src/lib/firebase/` (app init with the committed web config, auth helpers, typed
  collection accessors). Every file in it is client-only and must never be imported by the public
  site's server components in phase 1.
- **Rules files:** `firestore.rules` and `storage.rules` at the repo root.
- **New infrastructure:** the first database, the first authentication and the first file storage
  this project has. Firebase Auth's Google provider must be enabled in the Firebase console, and the
  site's domains (plus `localhost` and `127.0.0.1`) must be on Auth's authorised domains list. These
  are console steps the owner does once; the pipeline cannot do them.

### Recommended collections

Fields mirror the current component shapes so that phase 2 can swap the data source without
redesigning the content. Every record carries `updatedAt` (server timestamp).

| Collection | Doc id | Fields |
| --- | --- | --- |
| `profile` | single doc `main` | `name`, `headline`, `about` (string[] of paragraphs), `photo` (image ref), `email`, `resumeUrl`, `socialLinks[] {platform, url}` |
| `experience` | auto | `kind` (`work` or `education`), `title`, `organisation`, `year`, `duration`, `description`, `details[]`, `position` |
| `projects` | auto | `title`, `shortDesc`, `description[]`, `tech[]`, `repoUrl`, `demoUrl`, `position` |
| `certifications` | auto | `name`, `badge` (image ref), `credentialUrl`, `position` |
| `techCategories` | auto | `name`, `items[] {name, icon (image ref)}`, `position` |
| `blogPosts` | the post slug | `title`, `excerpt`, `date` (`YYYY-MM-DD`), `updated`, `tags[]`, `draft`, `featured`, `coverImage` (image ref), `coverAlt`, `body` (markdown), `createdAt` |
| `images` | auto | `storagePath`, `url`, `fileName`, `contentType`, `size`, `alt`, `uploadedAt` |

An image ref is the `images` doc id plus its public `url`, so a record still renders if the library
entry is later removed. Storage objects live under `images/`.

**Access rules (the security boundary):**

- Writes to every collection and to `images/` in Storage: only when `request.auth.uid` equals the
  owner's UID and `request.auth.token.email_verified` is true. The UID is committed in the rules file;
  it is an identifier, not a secret.
- Public reads: `profile`, `experience`, `projects`, `certifications`, `techCategories`, Storage
  `images/`, and `blogPosts` whose `draft` is false. Phase 2 needs these.
- Owner-only reads: `blogPosts` whose `draft` is true, and the `images` collection.
- Everything else is denied. The rules are tested against the emulator; an anonymous write and a
  signed-in non-owner write must both be refused.

The Firebase web config (`apiKey`, `projectId` and so on) is public by design and is committed in
`src/lib/firebase/`. No `.env` file is read or written.

### Migration risk

Nothing persisted today changes shape. Content lives in component source and in
`content/blog/*.md`, and phase 1 leaves both untouched; the public site keeps rendering from them.
Firestore starts empty and the owner fills it by hand (R9). Until phase 2 ships, the database and the
repo are two copies that can drift. The owner edits the panel, and the live site does not change
until phase 2.

### Standing-context conflicts

Both were surfaced and ruled on by the user (R3, R7):

- **OVERVIEW §2.1 (static export).** Kept. The panel needs no server, so the invariant holds.
- **OVERVIEW §2.2 (blog in repo markdown, no CMS).** It is replaced after phase 2 ships. Mode B of
  `admin-sign-in` rewrites §2.2 to say the panel is the editing source and the repo files remain the
  rendering source until phase 2.

`CLAUDE.md` § Never violate says "the site has none" (secrets) and the repo profile says "the site
has no environment variables". Both still hold, because the web config is committed and is not a
secret. The profile's "There is no database" line changes.

### Already covered

Nothing. `formatDate()` and the CSS tokens are reused as-is.

## Slices

| Order | Slug | Title | User goal | Est. scenarios | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | `admin-sign-in` | Admin Sign-In | The owner signs in with Google at `/bright-warm-greenhouse/`, any other account is refused, and the owner can sign out and see the section menu | 6 | — |
| 2 | `manage-image-library` | Manage Image Library | The owner uploads, lists, copies the address of and deletes images | 6 | 1 |
| 3 | `manage-profile` | Manage Profile | The owner edits name, headline, about paragraphs, photo, email, resume link and social links | 5 | 1, 2 |
| 4 | `manage-experience` | Manage Experience | The owner adds, edits, deletes and reorders work and education entries | 7 | 1 |
| 5 | `manage-projects` | Manage Projects | The owner adds, edits, deletes and reorders projects | 6 | 1 |
| 6 | `manage-certifications` | Manage Certifications | The owner adds, edits, deletes and reorders certifications, with badges picked from the image library | 6 | 1, 2 |
| 7 | `manage-tech-stack` | Manage Tech Stack | The owner manages tech categories and their items, with icons picked from the image library | 7 | 1, 2 |
| 8 | `manage-blog-posts` | Manage Blog Posts | The owner writes, edits and deletes markdown posts with every frontmatter field, as draft or published, with unique slugs | 7 | 1, 2 |
| 9 | `preview-blog-post` | Preview Blog Post | The owner sees a post rendered the way the live blog will show it, before publishing | 4 | 8 |

Why this order: sign-in is the gate every other slice sits behind and carries the Firebase set-up
Steps. The image library comes next because three later slices pick images from it. The single-record
profile is the simplest editor and fixes the form pattern. The list collections follow, with the ones
that need no images first. Blog posts come last among the editors because they have the most rules
(slug uniqueness, dates, drafts), and preview depends on them.

### Rejected splits

- **A "set up Firebase" foundation slice.** No one could act it out in the app. The set-up becomes the
  first Steps of `admin-sign-in`.
- **One "manage all content" slice.** It fails the scenario-count and the one-new-table sizing tests.
- **Separate create, edit and delete slices per collection.** Each collection holds three to five
  records, so one slice per collection stays within seven scenarios and each split would not be
  useful on its own.
- **Preview folded into `manage-blog-posts`.** It pushes that slice past seven scenarios and adds the
  in-browser markdown renderer as a second module boundary.
- **A one-time import of today's content.** The user chose to retype it (R9).

### Decisions taken for the user

The user saw these at the approval gate and did not overrule them.

1. Records are ordered by a `position` field and moved with move-up and move-down controls, not drag
   and drop.
2. When two tabs edit the same record, the last save wins. There is no conflict detection, because
   there is one editor.
3. Session time-outs and Firebase App Check are deferred.
4. Phase 1 changes nothing the public site shows.
5. Rules tests run as Playwright specs against the Firebase emulators, so Playwright stays the only
   test runner.

## Open questions

None blocking. These go to the Mode B sweeps:

- `admin-sign-in`: what a refused account sees, and whether it is signed out at once.
- `manage-image-library`: allowed file types and the maximum size; what happens when a deleted image
  is still referenced by a record.
- `manage-blog-posts`: whether a published post's slug may change after publishing.

## Next commands

```
/help-discover-this admin-sign-in            # Admin Sign-In
/help-discover-this manage-image-library     # Manage Image Library
/help-discover-this manage-profile           # Manage Profile
/help-discover-this manage-experience        # Manage Experience
/help-discover-this manage-projects          # Manage Projects
/help-discover-this manage-certifications    # Manage Certifications
/help-discover-this manage-tech-stack        # Manage Tech Stack
/help-discover-this manage-blog-posts        # Manage Blog Posts
/help-discover-this preview-blog-post        # Preview Blog Post
```
