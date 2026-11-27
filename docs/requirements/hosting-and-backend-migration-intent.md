# Intent: Hosting and backend migration

- **Slug:** `hosting-and-backend-migration`
- **Owner:** Keith Lim, the site owner and its only author
- **Status:** ready

## 1. Goal

The portfolio runs on Vercel, signs its owner in with Auth.js using their own Google account, and keeps
all content the owner edits in Supabase's free PostgreSQL database and file storage, with every
Firebase service removed. The owner keeps the same private panel and everything it does today, and the
public site looks and works exactly as before. It is wanted for cost: the target is a $0 bill every
month, with nothing to watch and no open-ended charge.

## 2. Business context

### 2.1 The problem today

The portfolio's hosting, sign-in, content database and image storage are all Firebase services,
each with its own plan and bill to watch. The owner pays nothing today, but is worried about three
things: a surprise bill, because abuse or a mistake could run up a charge on the pay-as-you-go
services with no hard cap; paying anything at all for a personal site that is edited a few times a
month and earns nothing; and having several separate paid parts to keep an eye on (hosting, database,
sign-in, file storage). Staying put also means a bill the owner does not want, plus lock-in: the more
content lives in Firebase, the harder it is to leave later.

### 2.2 Why now, and what success looks like

The owner plans to edit the portfolio's content from the private panel soon, so the choice of where
that content is stored has to be made now, before more is built on Firebase.

Success, a month after the move: every monthly statement from every provider shows exactly $0; the
owner never has to open a billing page or a usage dashboard to check; and the owner can still sign in
to the panel at the usual address, while nobody else can.

### 2.3 Users and their situation

- **The owner** is the only user of the private panel. They sign in with their own Google account, as
  today, and expect it to keep working at the usual address.
- **Visitors** (recruiters, hiring managers, blog readers) only read. The site stores nothing about
  them or from them; no comments, likes, contact form or newsletter.
- **Anyone else** must not be able to get into the panel.

### 2.4 Business rules

- Only the owner's Google account can sign in to the panel and change content. There are no other
  users, invites or roles.
- An unpublished (draft) blog post can be read by the owner only.
- Deleting a record or post asks for confirmation first. Once confirmed, the delete is permanent; there
  is no trash or undo.
- The panel's address stays `/bright-warm-greenhouse/`, and it is not advertised to search engines, the
  sitemap or `robots.txt`.
- The owner can still upload images through the panel (PNG, JPEG, WebP or SVG, at most 5 MB each),
  within what the free tiers allow. Anyone may view an uploaded image; only the owner may upload or
  delete one.
- Visitors only read. The site stores nothing about them or from them.
- The target is a $0 bill every month. The most the owner will accept is about $5 a month, and never
  an open-ended charge. This replaces the earlier ruling to run on Firebase's pay-as-you-go plan.
- The earlier "no server at runtime" ruling is lifted for sign-in and the panel only. Public pages stay
  prebuilt and static.

### 2.5 What happens when it goes wrong

The owner's worries, all of which must never happen:

- Someone other than the owner gets into the panel, or changes or deletes content, even after finding
  the panel's address. The portfolio would be defaced in front of recruiters.
- The public site breaks: existing pages, blog links or the feed go missing or change address during
  or after the move.
- The owner is locked out of the panel, with no way back in when they need to edit.
- A draft blog post becomes readable by the public before the owner publishes it.
- A single mis-click permanently deletes a record or a post.
- A login or database secret ends up in the repository, in a page's source or in a log.

## 3. Non-goals

- Visitor accounts, comments, likes, or anything a visitor can store.
- Other users, invited editors or permission levels for the panel.
- Firebase kept running alongside the new stack. This goal removes Firebase (sign-in, database, file
  storage and hosting), it does not add a second system next to it.
- Any paid extra tool or service (monitoring, analytics, email or anything else that adds a bill).
- The public pages reading their content from the database. That stays a later goal; public pages keep
  showing what is in the repo.

## 4. Pre-approved decisions

| Kind | What is approved | Why it is needed, and what it changes | Alternatives ruled out, and why | Cost or risk accepted |
| --- | --- | --- | --- | --- |
| New dependency | Auth.js (the `next-auth` library, version 5, which is still a beta release and the only line that supports Next.js 16), pinned to one exact version | Lets the owner sign in with their own Google account without Firebase; replaces `firebase` sign-in | Firebase Authentication: the cost and lock-in the goal removes. Sign-in from the database provider's browser library: would keep the site fully static, but the owner chose to lift the no-server ruling for sign-in and the panel | A beta release can change between versions; pinning it means upgrades are deliberate |
| New dependency | A PostgreSQL client library for talking to Supabase; the agent chooses which one | The panel reads and writes content in Supabase instead of Firestore | None named by the owner | None beyond the library itself |
| New dependency | Removal of `firebase` and `firebase-tools` (and the Firebase emulator set-up that needs Java) | Firebase is removed entirely (§3) | Keeping Firebase beside the new stack: ruled out in §3 | None |
| New environment variable | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAIL` (the owner's Google email), plus the Supabase database and storage connection settings, whose exact names the agent picks and lists in the pull request. Names only; the owner sets every value themself in Vercel, separately for Production and for the SIT (preview) deployment | The server sign-in and the database need settings at run time, and secret values must stay out of the repo | Committing the values or the owner's email: ruled out (§5) | The repo's old "the site has no secrets" rule is reworded to "no secret values in the repo, pages or logs". The run makes that edit in `CLAUDE.md` and the standing docs and flags it in the pull request |
| External service or provider | Vercel (hosting, free Hobby plan) | Replaces Firebase Hosting; the site is already configured for it in the repo | Staying on Firebase Hosting: part of the cost and lock-in being removed | $0. As I understand Vercel's current terms, the free plan is for personal, non-commercial use, which a personal portfolio is |
| External service or provider | Supabase (free plan): PostgreSQL database and file storage | Holds all editable content and uploaded images instead of Firestore and Firebase Storage | Firebase Data Connect: still needs Firebase's paid plan and Cloud SQL. Staying on Firestore: the cost and lock-in being removed | $0. As I understand current terms, a free Supabase project can pause after about a week of no use, so the editors are unavailable until the owner presses restore in Supabase. The public site and sign-in keep working. The owner accepts this. No keep-awake job is approved |
| External service or provider | A Google Cloud OAuth sign-in app (the owner creates it) | Lets Auth.js check the owner's Google account | A password or email-link sign-in: the owner chose Google | $0. Google only allows fixed redirect addresses, so sign-in works only on the owner's two custom domains and on localhost, not on every preview address |
| Data store, sign-in or hosting change | Hosting moves from Firebase Hosting to Vercel. The content database moves from Firestore to Supabase PostgreSQL. Image files move from Firebase Storage to Supabase Storage. Sign-in moves from Firebase Authentication to Auth.js with Google. The static-export ruling is lifted for sign-in and the panel only; public pages stay prebuilt | Cost and lock-in (§2.1) | Staying on Firebase. Staying fully static: it would rule out Auth.js | Only sign-in and the panel run on Vercel's servers. A mistake there could expose content, so access is enforced by the server on every request (§5) |
| Other choice the agent would otherwise guess | The panel recognises the owner by their verified Google email address, held in `ADMIN_EMAIL` in Vercel and never committed | The owner's email must stay out of the repo, and an email is available at the first sign-in | Matching on a Google account ID: the owner would have to look it up after a first sign-in | If the owner changes their Google email, they update the setting |

## 5. Hard constraints

- Only a verified Google account whose email matches the owner's setting can sign in to the panel. Any
  other Google account is told it is not allowed, sees no content and can change nothing.
- Every request that creates, changes or deletes content, or uploads or deletes an image, is refused
  for a signed-out visitor and for any other account. This holds when the request is sent directly,
  without the panel.
- A draft blog post cannot be read by anyone but the owner, signed out or signed in as someone else.
- No delete happens without a confirmation the owner accepted first.
- An image upload is refused if it is over 5 MB or is not a PNG, JPEG, WebP or SVG file. Anyone may
  open an uploaded image by its address; only the owner can upload or delete one.
- The panel's address is `/bright-warm-greenhouse/`. It appears in neither `/sitemap.xml`,
  `/robots.txt`, the feed nor any public page's links, and the page tells search engines not to index
  it.
- Visitors can store nothing: no request from a signed-out visitor changes any stored data.
- Every public address that exists today (`/`, `/blog/`, each `/blog/<slug>/`, `/rss.xml`,
  `/sitemap.xml`, `/robots.txt`) still loads at the same address with the same content, `/rss.xml`
  keeps its feed content type, and an unknown address shows the site's 404 page.
- The public pages are prebuilt and static: they do not run sign-in or database code, and ship none of
  it to the visitor.
- No secret value (key, password, token) and not the owner's email appears in the repo, in any page's
  source, in a test file or in a log. Only setting names do.
- No Firebase library, configuration, security rules, emulator set-up, deploy step, hosting setting or
  Firebase secret name remains in the repo.
- Nothing in the repo or the pipeline selects, requires or depends on a paid plan or a paid feature of
  Vercel, Supabase or Google.
- A failed sign-in shows a message and leaves the sign-in button usable, so the owner is never stuck.
- After signing out, the owner can always sign in again with the same Google account, on every
  deployment, with nothing to reset or recreate first.
- Existing styling rules hold: the panel uses the site's colour tokens in light and dark themes.

## 6. Definition of done

- [ ] Opening `/bright-warm-greenhouse/` signed out shows only a "Sign in with Google" control and no
      content.
- [ ] Signed in as the owner, the panel shows its menu with all seven screens: Profile, Experience,
      Projects, Certifications, Tech stack, Blog posts and Images.
- [ ] Signed in as any other Google account, the panel says that account is not allowed, shows no
      content, and every attempt to change something is refused.
- [ ] After signing out and reloading, the panel shows the sign-in screen again, and signing in again
      works.
- [ ] On each of the seven screens the owner can create, edit and, after confirming, delete an entry
      (on Profile, edit the one profile), and the change is still there after a reload.
- [ ] A blog post saved as a draft can be read by the owner and is refused to a signed-out request;
      once published it is readable by anyone who asks the database for published posts.
- [ ] The owner can upload a PNG, JPEG, WebP or SVG of at most 5 MB, pick it on a record, and open its
      address signed out; a 6 MB file and a non-image file are each refused with a message.
- [ ] A signed-out request to create, change or delete content, or to upload or delete an image, is
      refused.
- [ ] Every public address listed in §5 loads at the same address with the same content as before the
      move, an unknown address shows the 404 page, and `/rss.xml` is served as an RSS feed.
- [ ] The panel address is absent from `/sitemap.xml`, `/robots.txt`, the feed and every public page's
      links, and the page asks search engines not to index it.
- [ ] A search of the repo finds no Firebase library, configuration, rules, emulator set-up, deploy
      step or Firebase secret name.
- [ ] A search of the repo, the built pages and the test files finds no secret value and not the
      owner's email.
- [ ] The pull request lists every setting name the owner must set in Vercel, and the pipeline for a
      pull request still runs the type check, lint and build, with no Firebase service-account secret.

## 7. Human-only items

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

## 8. Notes for the agent (optional)

- The earlier admin panel is the precedent for every screen and rule: `docs/features/*/story.md` for the
  seven editors and sign-in, `docs/requirements/admin-content-panel-intent.md` and
  `docs/requirements/admin-content-panel.md` (collections and field shapes) and the code in
  `src/lib/admin/` and `src/app/components/admin/`. Keep each screen's behaviour and wording; change
  where the data lives and how requests are authorised. Do not rewrite the stories' scenarios beyond
  that.
- Nothing was saved through the old panel that must survive (owner's answer). The new database starts
  empty and the owner retypes content. No import is wanted.
- Standing docs to amend: `docs/features/OVERVIEW.md` §2 items 1, 4 and 5; `CLAUDE.md` Invariants 1, 2
  and 6, the "Admin modules" and "Database rules" paragraphs, the "never write or read a secret" rule
  and the Firebase mentions; `Reference.md`; `.claude/repo-profile.md`. The hosting side already
  points at Vercel (`vercel.json`, the pipeline); do not redo it, but `vercel.json` must lose
  `outputDirectory: "out"` once the static export is lifted.
- Pitfalls: Auth.js v5 is beta (pin it). `trailingSlash: true` can break the OAuth callback under
  `/api/auth/*`; test it early. Only the panel route may be dynamic, and a public page that calls
  `auth()` or reads cookies silently stops being static. The database must be reachable from the server
  only, with its key never sent to the browser. Playwright cannot use real Google, so tests mint
  session cookies with the test's own `AUTH_SECRET`; the e2e run needs `next start` instead of
  `http-server` on `out/`, and no emulator or Java.
- Size: one owner and one editor; the last save wins, no conflict detection. Stay inside Supabase's
  free allowances by keeping uploads at the 5 MB cap.
- Sign-in, Google's 2-step verification and account recovery are Google's; the panel stores no
  password.
