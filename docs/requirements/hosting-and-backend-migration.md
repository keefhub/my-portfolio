# Hosting and backend migration: decomposition

- **Intent:** `docs/requirements/hosting-and-backend-migration-intent.md`
- **Date:** 2026-11-27

## Restatement

The portfolio runs on Vercel, the owner signs in to the same private panel with their own Google account
through Auth.js, every piece of content and every uploaded image the panel manages lives in Supabase's free
database and file storage, Firebase is gone from the repo, and the public site looks and works exactly as
before at a $0 monthly bill (matches intent §1).

## Impact analysis

Verified against the tree and `git` on 2026-11-27 (working tree clean, branch `ccr-d8739d96-n1uzx7`).

- **Already done, do not redo:** `vercel.json` exists (`framework: nextjs`, `npm ci`, `npm run build`,
  `trailingSlash: true`, the `/rss.xml` content type), the pipeline (`.github/workflows/pipeline.yml`) no
  longer deploys hosting, `master` and `develop` are described as Vercel branches in `.claude/repo-profile.md`,
  `firebase.json` has no `hosting` block, and `SITE_URL` already reads `thegoldenpothos.xyz`.
- **Still to do on hosting:** `vercel.json` still carries `"outputDirectory": "out"`, and `next.config.ts` still
  has `output: "export"`; both go once the export is lifted (intent §8).
- **Built and Firebase-based (ten earlier stories, all in the tree):** sign-in (`src/lib/firebase/auth.ts`,
  `AdminPanel.tsx`), per-environment owner user IDs (`src/lib/admin/owner.ts`, `firestore.rules`,
  `storage.rules`), and seven screens (Profile, Experience, Projects, Certifications, Tech stack, Blog posts,
  Images) plus the blog post preview. Their record shapes and rules sit in `src/lib/admin/*` and are
  independent of Firebase; their stores sit in `src/lib/firebase/*`.
- **Public site is Firebase-free:** no public page, layout or server component imports Firebase code (the
  only other `firebase` hits are prose: one blog post and one project card).

### Touched modules

| Path | read / write | Why |
| --- | --- | --- |
| `next.config.ts` | write | Drop `output: "export"`; keep `trailingSlash: true` and `images.unoptimized: true` |
| `vercel.json` | write | Drop `outputDirectory: "out"`; `trailingSlash`, build command and the `/rss.xml` header stay |
| `src/app/bright-warm-greenhouse/page.tsx` | write | Becomes the one dynamic page: reads the Auth.js session on the server; keeps `noindex` metadata |
| `src/app/components/admin/AdminPanel.tsx`, `SavingOffNotice.tsx` | write | Replace Firebase sign-in and the owner-ID states with Auth.js states (signed out, owner, not allowed); the placeholder-ID notice goes |
| `src/app/components/admin/*Editor.tsx`, `ListEditor.tsx`, `ImageLibrary.tsx`, `PostPreview.tsx` | write | Call the new server entry points instead of Firestore and Storage; wording and behaviour kept |
| `src/lib/admin/*` (record shapes, validation, sections, list ordering, image rules) | read, small write | Reused as is; `owner.ts` (user IDs, `accessFor`) is rewritten around the signed-in email and the `ADMIN_EMAIL` setting |
| `src/lib/firebase/*` (11 files) | write (delete) | Replaced, file by file, by the slice that moves that piece |
| `src/lib/auth.ts` (new), `src/app/api/auth/[...nextauth]/` (new) | write | Auth.js configuration (Google provider, owner check) and its handler |
| `src/app/api/admin/**` (new) | write | The panel's server entry points; each checks the session itself (see Decisions 8, 9) |
| `src/lib/server/**` (new, `server-only`) | write | PostgreSQL access, schema, Supabase Storage calls; never imported by a client component or a public page |
| `package.json`, `package-lock.json` | write | Add `next-auth` (exact beta pin) and a PostgreSQL client; remove `firebase`, `firebase-tools`, the `deploy:rules*` scripts |
| `playwright.config.ts`, `e2e/*.spec.ts` | write | Serve with `next start`, mint session cookies with a per-run secret, delete the Firebase emulators; each old admin spec is deleted by the slice that replaces it |
| `.github/workflows/pipeline.yml` | write | Remove both Firebase rules deploy jobs and the `FIREBASE_SERVICE_ACCOUNT` use; verify job and `master-source` job stay |
| `firebase.json`, `.firebaserc`, `firestore.rules`, `storage.rules`, `.gitignore` entries | write (delete) | Firebase configuration and rules |
| `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/rss.xml/route.ts`, `src/lib/site.ts`, `src/app/layout.tsx` | read | Must not change; tests assert the panel route is absent and public addresses are unchanged |
| `CLAUDE.md`, `docs/features/OVERVIEW.md`, `Reference.md`, `README.md`, `.claude/repo-profile.md` | write | Amend the standing docs, split across slices (Decision 4) |
| `scripts/check-task.sh` | read | Lists `firebase.json` as a sensitive path; the deleted file no longer matches, nothing to change |

### New surface

- **Persisted today:** nothing in the repo; content lives in Firestore (`profile` doc `main`, `experience`,
  `projects`, `certifications`, `techCategories`, `blogPosts` keyed by slug, `images`) and images in a Firebase
  Storage bucket. The new database starts empty (intent §8).
- **Database (Supabase PostgreSQL):** one table per former collection with the same fields, plus `position` on
  the list tables and `updated_at` on every row; `blog_posts` has a `draft` flag and a unique slug; `images`
  holds the file's name, path, public address, type, size, created time. The schema is one SQL file in the
  repo, applied idempotently (Decision 11).
- **File storage (Supabase Storage):** one public-read bucket for uploaded images, created with a 5 MB limit
  and the four allowed types.
- **Routes:** Auth.js handler at `/api/auth/*`; the panel's server entry points at `/api/admin/*`; the panel
  page `/bright-warm-greenhouse/` becomes dynamic. Every other route stays prerendered.
- **Environment variable names (values only in Vercel):** `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `ADMIN_EMAIL`, plus the Supabase database and storage connection settings, whose
  names the slice that adds each picks and lists in the pull request.

### Migration risk

No stored data moves: nothing saved through the old panel must survive and no import is wanted (intent §8).
The risks are operational: the sign-in callback under `/api/auth/*` meeting `trailingSlash: true`; a public
page that silently stops being static if it touches the session; a free Supabase project that pauses (the
panel then reports the database is unavailable while the public site and sign-in keep working, accepted in
intent §4); and a window inside the branch where unmoved screens cannot save (Decision 3).

### What already covers part of this

The hosting move (`vercel.json`, pipeline without a hosting deploy) is done. All record shapes, validation
messages, section list, list ordering, image rules, the markdown preview and every screen's markup and
wording exist and are kept; only where data lives and how requests are authorised change.

## Slices

| Slug | Title | User goal | Intent lines served | Scenarios (est.) | Depends on | Needs (intent §4) |
| --- | --- | --- | --- | --- | --- | --- |
| `owner-google-sign-in` | Owner signs in with Google | The owner opens `/bright-warm-greenhouse/`, signs in with their Google account and sees the seven-item menu; anyone else is told that account is not allowed and sees nothing; the owner can sign out and sign in again; a failed sign-in shows a message and the button stays usable; public pages are unchanged and ship no sign-in code | §1; §2.3; §2.4 (only owner, address, not advertised, no-server ruling lifted for sign-in and panel); §5 sign-in, signed-out and other-account see nothing, address and no-index, visitors store nothing, public addresses and 404, public pages static, no secret or email, sign-in again, failed sign-in, tokens; §6 1, 2, 3, 4, 9, 10, 12 | 8 | none | `next-auth` v5 exact pin, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAIL`, Google sign-in app, Vercel, static-export lift: all approved |
| `owner-edits-profile` | Owner edits the profile | The owner edits name, headline, about paragraphs, photo path, email, resume link and social links, saves, reloads and still sees them; a signed-out or other-account request to save is refused; when the database is unreachable the panel says so and the public site keeps working | §1; §2.4 (owner only, visitors read only); §5 refuse changes from signed-out and other accounts, visitors store nothing, no secret; §6 5, 8 | 7 | `owner-google-sign-in` | PostgreSQL client library, Supabase database, Supabase database connection setting names: all approved; schema applied by the app: [auto] (Decision 11) |
| `owner-uploads-images` | Owner uploads images | The owner uploads a PNG, JPEG, WebP or SVG of at most 5 MB, sees it listed, copies its address, opens it signed out, picks it as the profile photo and deletes it after confirming; an over-5 MB or non-image file is refused with a message; signed-out and other-account uploads and deletes are refused | §2.4 images rule; §5 upload limits and types, anyone may open, owner-only upload and delete, confirmation before delete, no paid plan; §6 7, 8, 5 (Images screen) | 8 | `owner-edits-profile` | Supabase Storage, Supabase storage connection setting names: approved; direct signed upload to Supabase: [auto] (Decision 10) |
| `owner-manages-experience` | Owner manages experience | The owner adds, edits, reorders and, after confirming, deletes work and education entries and they persist; builds the shared list pattern the next three reuse | §1; §5 refusals, confirmation; §6 5, 8 | 7 | `owner-edits-profile` | none new |
| `owner-manages-projects` | Owner manages projects | The owner adds, edits, reorders and, after confirming, deletes projects | §1; §5 refusals, confirmation; §6 5, 8 | 6 | `owner-manages-experience` | none new |
| `owner-manages-certifications` | Owner manages certifications | The owner adds, edits, reorders and, after confirming, deletes certifications, each badge an uploaded image or a repo path | §1; §2.4 images rule; §5 refusals, confirmation; §6 5, 7, 8 | 7 | `owner-manages-experience`, `owner-uploads-images` | none new |
| `owner-manages-tech-stack` | Owner manages tech stack | The owner manages categories and their items (name and icon), reorders and deletes after confirming | §1; §2.4 images rule; §5 refusals, confirmation; §6 5, 7, 8 | 8 | `owner-manages-experience`, `owner-uploads-images` | none new |
| `owner-manages-blog-posts` | Owner manages blog posts | The owner writes, edits and deletes (after confirming) markdown posts as draft or published with unique slugs, sees each post's status, picks a cover image; a draft is readable only by the owner and a published post by anyone who asks for published posts | §1; §2.4 drafts, images rule; §5 draft unreadable by anyone else, refusals, confirmation; §6 5, 6, 8 | 9 | `owner-manages-experience`, `owner-uploads-images` | none new |
| `owner-previews-blog-post` | Owner previews a blog post | Before saving, the owner sees the post's markdown rendered the way the blog shows posts | §1 ("everything it does today"); §5 tokens; §6 2 | 4 | `owner-manages-blog-posts` | none new (the preview already uses the unified packages, no store) |
| `retire-firebase` | Retire Firebase and document the new stack | Nothing of Firebase remains in the repo or the pipeline, no secret value or owner email is in the repo, pages or tests, every public address still loads unchanged, the pull request lists every setting name, and the standing docs describe the new stack | §1 (Firebase removed, $0); §3 Firebase not kept alongside; §5 public addresses, no secret or email, no Firebase left, no paid plan, public pages static; §6 9, 11, 12, 13 | 6 | all slices above | Removal of `firebase`, `firebase-tools` and the emulator set-up: approved |

## Run order

Dependency order, earliest first. Slices are placed after the last existing row of the `CLAUDE.md` order
table (row 10). Status is one of `pending`, `written`, `BLOCKED: <what it needs>`.

| # | Slug | Why here | Status |
| --- | --- | --- | --- |
| 11 | `owner-google-sign-in` | The gate everything else sits behind; lifts the static export for the panel, adds Auth.js, proves the `/api/auth/*` callback under `trailingSlash: true` early, and amends the standing docs the lift makes false | written |
| 12 | `owner-edits-profile` | Simplest editor (one record); first use of the database, so it fixes the server entry point, the owner-only check, the empty and unreachable states | written |
| 13 | `owner-uploads-images` | Storage and the owner-only upload pattern must exist before any editor can pick an uploaded image; adds the picker to the profile photo | written |
| 14 | `owner-manages-experience` | First list; fixes the reorder and confirm-delete pattern the next three reuse | written |
| 15 | `owner-manages-projects` | Reuses the list pattern; no new dependency | written |
| 16 | `owner-manages-certifications` | Reuses the list pattern; badge uses the image picker | written |
| 17 | `owner-manages-tech-stack` | Reuses the list pattern, plus nested items; icons use the picker | written |
| 18 | `owner-manages-blog-posts` | Most rules (unique slug, draft, status list, public read of published posts); cover uses the picker | written |
| 19 | `owner-previews-blog-post` | Needs the post editor to preview from | written |
| 20 | `retire-firebase` | Last, because every other slice removes only what it replaces; this one deletes what is left and checks the whole | written |

## Coverage of the intent

| Intent line (§5 constraint or §6 definition of done) | Slice(s) |
| --- | --- |
| §5 Only a verified Google account matching the owner's setting signs in; others told not allowed, see nothing | `owner-google-sign-in` |
| §5 Create, change, delete and upload requests refused for signed-out and other accounts, also when sent directly | `owner-edits-profile`, `owner-uploads-images`, `owner-manages-experience`, `owner-manages-projects`, `owner-manages-certifications`, `owner-manages-tech-stack`, `owner-manages-blog-posts` (each its own entry points) |
| §5 A draft post readable by the owner only | `owner-manages-blog-posts` |
| §5 No delete without an accepted confirmation | `owner-uploads-images`, `owner-manages-experience`, `owner-manages-projects`, `owner-manages-certifications`, `owner-manages-tech-stack`, `owner-manages-blog-posts` |
| §5 Image upload refused over 5 MB or wrong type; anyone may open, only owner uploads and deletes | `owner-uploads-images` |
| §5 Panel address absent from sitemap, robots, feed and links; page says no-index | `owner-google-sign-in` (re-checked in `retire-firebase`) |
| §5 Visitors can store nothing | `owner-google-sign-in` (public pages), every editor slice (refusal), `retire-firebase` |
| §5 Every public address unchanged, `/rss.xml` content type, 404 page | `owner-google-sign-in`, `retire-firebase` |
| §5 Public pages prebuilt and static, no sign-in or database code shipped | `owner-google-sign-in`, `retire-firebase` |
| §5 No secret value and not the owner's email in repo, pages, tests, logs | `owner-google-sign-in` (test harness), every slice by constraint, `retire-firebase` (final scan) |
| §5 No Firebase library, configuration, rules, emulator set-up, deploy step, hosting setting or secret name | `retire-firebase` (each other slice deletes what it replaces) |
| §5 Nothing selects or requires a paid plan or feature | `owner-google-sign-in` (hosting settings), `owner-uploads-images` (5 MB cap), `retire-firebase` |
| §5 A failed sign-in shows a message and the button stays usable | `owner-google-sign-in` |
| §5 After signing out the owner can sign in again on every deployment | `owner-google-sign-in` |
| §5 Panel uses the colour tokens in light and dark | every slice (shell in `owner-google-sign-in`) |
| §6 1 Signed out shows only "Sign in with Google" | `owner-google-sign-in` |
| §6 2 Owner sees the menu with all seven screens | `owner-google-sign-in` |
| §6 3 Other account told not allowed, no content, changes refused | `owner-google-sign-in` (message, no content); every editor slice (refusal) |
| §6 4 After sign-out and reload, sign-in screen again, sign in again works | `owner-google-sign-in` |
| §6 5 Create, edit, confirm-delete on each of the seven screens, persists after reload | `owner-edits-profile` (edit), `owner-uploads-images` (upload, delete), `owner-manages-experience`, `owner-manages-projects`, `owner-manages-certifications`, `owner-manages-tech-stack`, `owner-manages-blog-posts` |
| §6 6 Draft readable by the owner, refused signed out; published readable by anyone who asks for published posts | `owner-manages-blog-posts` |
| §6 7 Upload PNG/JPEG/WebP/SVG up to 5 MB, pick it on a record, open signed out; 6 MB and non-image refused | `owner-uploads-images` (upload, open, refusals, profile pick), `owner-manages-certifications`, `owner-manages-tech-stack`, `owner-manages-blog-posts` (pick on a record) |
| §6 8 Signed-out create, change, delete, upload refused | `owner-edits-profile`, `owner-uploads-images`, the five list and post slices |
| §6 9 Every public address loads unchanged, 404 page, `/rss.xml` is a feed | `owner-google-sign-in`, `retire-firebase` |
| §6 10 Panel address absent from sitemap, robots, feed, links; no-index | `owner-google-sign-in`, `retire-firebase` |
| §6 11 Repo search finds no Firebase library, configuration, rules, emulator set-up, deploy step or secret name | `retire-firebase` (scope in Decision 12) |
| §6 12 No secret value and not the owner's email in repo, built pages, test files | `owner-google-sign-in`, `retire-firebase` |
| §6 13 Pull request lists every setting name; pipeline still runs type check, lint, build, no Firebase service-account secret | `retire-firebase` (setting names are collected from each earlier slice's notes) |

## Decisions

Each question the interactive discovery would have asked, and what was taken. `[auto]` is the agent's own;
`[human: intent §N]` is ruled by the intent.

1. [human: intent §2.4, §4 last "Data store, sign-in or hosting change" row, §8] The conflicts with
   `OVERVIEW.md` §2 items 1 (static export), 4 (`trailingSlash` across files) and 5 (Firebase panel ruling):
   treated as ruled, not as contradictions. The static-export ruling is lifted for sign-in and the panel only;
   `trailingSlash: true` stays (in `next.config.ts`, `vercel.json` and `absoluteUrl()`, which now name Vercel);
   item 5 is superseded by this goal (Supabase and Auth.js replace Firestore and Firebase Auth).
2. [human: intent §8] The hosting side is already in the tree and is not redone. Remaining hosting edits:
   drop `outputDirectory` from `vercel.json` and `output: "export"` from `next.config.ts`, in
   `owner-google-sign-in`.
3. [auto] Sign-in moves before the data: the old screens cannot save without a Firebase identity, so after
   `owner-google-sign-in` each screen not yet moved shows a short "not available yet" notice instead of its
   editor, until its own slice moves it. Why: running Firebase beside the new stack is a non-goal (§3), and all
   slices land on one branch and one pull request, so the gap is never visible to the owner.
4. [auto] Standing-doc amendments are split to follow the code that makes them false, so the pipeline
   reviewers never enforce a stale rule: `owner-google-sign-in` amends `OVERVIEW.md` §2 items 1, 4, 5,
   `CLAUDE.md` Invariants 1, 2 and 6 (reasons reworded, `unoptimized` kept), the route table, the "never
   write or read a secret" rule (now "no secret values in the repo, pages or logs", flagged in the pull
   request as intent §4 requires) and `.claude/repo-profile.md` (hosting, `.env`, the e2e server);
   `owner-edits-profile` amends the "Admin modules" and "Database rules" paragraphs and "there is no
   database"; `retire-firebase` amends `Reference.md`, `README.md`, the rest of the profile and any other
   Firebase mention.
5. [auto] Images stay `unoptimized: true` after the export is lifted (reason reworded in Invariant 6). Why:
   Vercel's free image optimisation has a monthly allowance, and a paid dependency is ruled out (§5).
6. [auto] Public addresses, the feed and the 404 page are checked in `owner-google-sign-in`, the moment the
   export is lifted, and again as a whole in `retire-firebase`. Why: that is where a regression would appear.
7. [auto] Tests use stand-ins instead of real services, as intent §8 does for Google: session cookies minted
   with a secret generated fresh for each run (never a literal in a test file or config), a made-up owner
   email set only in the test run's environment, and a stand-in for the database and for Storage. The
   mechanism is the spec writer's. Real-service behaviour is covered by the owner's SIT check (§7). See
   Open findings 1.
8. [auto] The panel's server entry points are route handlers under one prefix, `/api/admin/*`, beside
   `/api/auth/*`, not Server Actions. Why: §5 requires that a request sent directly, without the panel, is
   refused, and a route handler can be tested that way. They are treated as part of the panel; no public page
   links to them and no public page is made dynamic. See Open findings 2.
9. [auto] "Readable by anyone who asks the database for published posts" (§6 6) is served by a signed-out
   read at `/api/admin/*` that returns published posts only; drafts are returned only to the owner. Why: the
   database key must never reach the browser (§8), and public pages reading the database is a non-goal (§3),
   so the check has to be a server read, not a public database key.
10. [auto] Image upload sends the file straight to Supabase Storage through a short-lived upload address the
    server issues to the owner only; the 5 MB limit and the four allowed types are also set on the bucket.
    Why: a Vercel free-plan function cannot receive a 5 MB request body, and the storage key still never
    reaches the browser.
11. [auto] The database is a PostgreSQL connection from the server using a direct client library (the agent
    picks one, as §4 allows), Storage is called over its HTTP interface with `fetch` (no second library), and the
    schema is one SQL file applied by the app idempotently on first use. Why: applying the schema is not among
    the owner's §7 human-only steps, and a connection pooler address is needed for Vercel's short-lived
    functions (a setting, not a decision).
12. [auto] "A search of the repo" (§5, §6 11) is read as code, configuration, rules, scripts, workflows,
    package files, tests and standing docs. Two kinds of file are left: the earlier pipeline records
    (`docs/features/<old slug>/`, `docs/requirements/admin-content-panel*.md`, the ten old order-table rows),
    which are history, and public content (one blog post names Firebase Hosting; one project card is another
    app built on Firebase), which §5 says must not change. See Open findings 3.
13. [auto] The ten earlier admin stories are precedent and are replaced: their scenarios are not rewritten, the
    new stories restate each screen's behaviour with its wording against the new stack. Each old
    `e2e/<old slug>.spec.ts` and its `src/lib/firebase/*` store is deleted by the slice that replaces that
    screen; shared Firebase files (`client.ts`, `config.ts`) and the emulator server entry go in
    `retire-firebase`. Why: `tsc` covers `e2e/`, so a spec importing a deleted module would fail the gate.
14. [auto] One shared Supabase project for both environments versus one per environment is not decided
    here: the repo only holds setting names, so either works. See Open findings 4.
15. [auto] `retire-firebase` is a slice although it adds no new screen: intent §6 11 to 13 and §5 ask for
    results (nothing of Firebase left, no secret, a pipeline that passes without a service account, setting
    names listed) that only a final removal slice can own. It can be acted out by running the pipeline's checks
    and the public-address smoke specs, so it is not a layer-only foundation.
16. [auto] Sizing: the shared list pattern is built once in `owner-manages-experience` and reused; the
    preview is its own slice because it was its own story and has a separate test file, so each slice stays at
    4 to 9 scenarios.

## Human-only

- Create the Supabase project (free plan) and the Google sign-in app, with redirect addresses for the
  production domain, the SIT domain and localhost. Create the `AUTH_SECRET` value.
- Set every environment variable value in Vercel, separately for Production and for the SIT (preview)
  deployment. The agent never sees, writes or sets a value.
- Import the repository into Vercel with `master` as the production branch, assign
  `sit.thegoldenpothos.xyz` to the `develop` branch, and point DNS for both domains at Vercel.
- Check one real Google sign-in, and one saved edit, on the SIT site before the production cutover. The
  automated tests use stand-ins for Google, not Google itself.
- After the production cutover works, delete the Firebase projects (or turn off their billing) and
  remove the Firebase service-account secrets and the `sit` and `production` GitHub environments.
- A month later, check that every provider's statement shows $0. If the free Supabase project has
  paused, press restore in Supabase.
- Review and merge the pull request into `develop`.

## Rejected splits

- **Auth and database together in one first slice (sign-in plus profile):** about 15 scenarios and three new
  external pieces in one slice; split so the Auth.js callback problem is found before any database work.
- **A layer-only "database foundation" slice (connection, schema, owner check) before any screen:** nobody
  could act it out in the app. The first editor, `owner-edits-profile`, carries it instead.
- **Moving the screens one by one while Firebase sign-in stays until the last one:** keeps every screen
  working inside the branch, but is Firebase running beside Auth.js, a non-goal (§3), and needs a bridge
  between the two identities.
- **One slice per old story with the same slugs:** the old slugs already name built, Firebase-based features;
  reusing them would blur "replaced" with "extended".
- **Folding the preview into the blog slice:** about 13 scenarios in one slice and a long spec; the preview
  has no store, so it stays separate.
- **A separate docs-amendment slice:** a slice with no behaviour a person can act out, and the static-export
  rule would stay wrong for the whole run; the amendments ride with the slices that cause them (Decision 4).

## Open findings

1. Test database (intent §4, §8): §4 approves a PostgreSQL client library only and §8 rules out the emulator
   and Java. This machine has `psql`, `docker` and Java but no PostgreSQL server, and no test database or
   stand-in package is approved. Decision 7 chose in-repo stand-ins with no new package, so automated tests
   do not exercise the real SQL. Two consequences for the spec: the owner's SIT check (§7) is the only test of
   the real schema, and if switching to the stand-in needs a new environment variable name beyond the
   Supabase connection settings §4 approves, that slice's spec must stop and ask. No slice is marked BLOCKED
   because of it.
2. Intent §8 says "only the panel route may be dynamic". The panel's server entry points (`/api/admin/*`) are
   additional dynamic routes. Decision 8 treats them as part of the panel. Server Actions on the panel
   route would keep that wording literal but make "refused when sent directly" (§5) harder to test.
3. Intent §5 and §6 11 can be read to cover every text file. A literal `git grep -i firebase` will still
   match the earlier pipeline records, one blog post and one project card (Decision 12). Deleting the
   records would remove the order-table history; changing the blog post would change public content that §5
   says stays the same. The owner may want to amend either after reading the pull request.
4. Intent §7 says "the Supabase project", singular, but the settings are set separately for Production and
   SIT. If both deployments share one project, an edit made on SIT appears on production. Nothing in the repo
   depends on the answer.
5. Intent §6 13 asks for "no Firebase service-account secret" in the pull request pipeline, but §7 leaves
   removing the Firebase secrets and GitHub environments to the owner after cutover. `retire-firebase`
   removes every use of them from the workflow; the secrets themselves stay until the owner deletes them.
6. Coverage review notes (non-blocking, `.run-logs/hosting-and-backend-migration/discover-review.md`): the
   colour-token constraint (light and dark) has a scenario only in `owner-previews-blog-post`, and the
   paid-plan constraint (§5) has a scenario only in `retire-firebase`. Each is covered at least once, which is
   what the intent asks; the spec stage may add more coverage where a screen changes its styling.
7. `owner-manages-certifications` contains one wording slip, "Five or fewer people use the panel". The intent
   says one owner and no other users (§2.3, §3). Read it as the owner alone; the spec stage should correct
   the sentence.
8. The review's single blocking finding (the Offline and time category in `owner-manages-experience`) was
   fixed by one `[auto]` assumption (no. 20) in that story, and was not reviewed a second time, as the
   skill allows only one review.
