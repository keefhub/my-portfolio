# Intent: Admin content panel

- **Slug:** `admin-content-panel`
- **Owner:** Keith Lim, the site owner and its only author
- **Status:** ready

## 1. Goal

The owner can change every piece of the portfolio's content (profile and about text, experience,
projects, certifications, tech stack, blog posts written in markdown, and the images they use) from a private panel on the
site, signed in with their own Google account, without touching code. The content is kept in a cloud
database that only the owner can change. This is phase 1 of two: the public site keeps showing what is
in the code and the repo's markdown files until phase 2 switches it to read from the database.

## 2. Business context

### 2.1 The problem today

Every content change, even a one-word fix, means opening the code, editing a component or a markdown
file, committing, and waiting for the build and deploy. That takes too long, so updates get put off and
the portfolio falls behind the owner's real work.

### 2.2 Why now, and what success looks like

The owner plans to post more often and to keep the portfolio current, and editing through code does
not keep up with that. The panel and the database also have to exist before phase 2 can move the public
site onto them.

Success, a month in: the owner makes any content change (a new role, project, certification, blog post
or a text fix) in the panel in under about five minutes, without opening the code or making a commit.

### 2.3 Users and their situation

- **The owner** is the only user. They edit content a few times a month, at a desk or on a phone.
- **Visitors** (recruiters, hiring managers, blog readers) are not affected in this phase. What they
  see does not change until phase 2.
- **Anyone else** must not be able to get in, even if they find the panel's address.

### 2.4 Business rules

- Only the owner's Google account can sign in to the panel and change content. There are no other
  users, invites or roles.
- An unpublished (draft) blog post can be read by the owner only.
- Deleting a record or post asks for confirmation first. Once confirmed, the delete is permanent; there
  is no trash or undo.
- The owner can upload images through the panel (PNG, JPEG, WebP or SVG, at most 5 MB each). Anyone
  may view an uploaded image; only the owner may upload or delete one. A record's image is either an
  uploaded image or a file already in the site's repo, given by its path as today.
- The project moves to Firebase's pay-as-you-go (Blaze) plan so that image storage is available, and
  usage is meant to stay inside the plan's free allowance. (Owner ruling, 2026-11-26, reversing the
  earlier "stay on the free plan" answer.)
- The panel's address is `/bright-warm-greenhouse/`, and it is not advertised to search engines.

### 2.5 What happens when it goes wrong

The owner's worries, all of which must never happen:

- Someone other than the owner changes or deletes content, even after finding the panel's address. The
  portfolio would be defaced in front of recruiters.
- A draft blog post becomes readable by the public before the owner publishes it.
- A single mis-click loses a record or a post.
- Firebase starts charging money because of abuse or a mistake.

## 3. Non-goals

- Any change to what visitors see on the public site. Moving the site onto the database is phase 2.
- Other users, invited editors, or permission levels.
- Image editing, resizing, cropping or format conversion. An uploaded image is stored as given.

## 4. Pre-approved decisions

| Kind | What is approved | Why it is needed, and what it changes | Alternatives ruled out, and why | Cost or risk accepted |
| --- | --- | --- | --- | --- |
| New dependency | `firebase` (the client library), loaded only by the panel | The panel signs in and reads and writes the database from the browser, because the site has no server | A backend server or Cloud Functions: ruled out to keep the site a static export (OVERVIEW §2.1) | A larger script download on the panel page only; the public pages load none of it |
| New dependency | `firebase-tools`, development only | Runs local stand-ins for sign-in and the database so the tests never touch the live project, and deploys the security rules | Testing against the live project: would need real credentials and could change real content | The local stand-ins need Java on the machine running the tests |
| New environment variable | None. The Firebase web configuration is committed in the repo | It identifies the project to the browser and is public by design; it is not a secret | An environment variable: adds set-up for no security gain | None |
| External service or provider | Firebase Authentication with Google sign-in, Cloud Firestore, and Cloud Storage for Firebase (image files), in the existing project `thegoldenpothos-5b3a1` on the pay-as-you-go Blaze plan | Sign-in, the content database, and uploaded images. Storage requires Blaze | Supabase: a second vendor next to Firebase Hosting. Email and password sign-in: a password to manage and recover. Images stored inside database records: capped near 700 KB and awkward | Blaze has no hard spending cap, only budget alerts; owner-only uploads and the 5 MB limit keep usage near zero. Content lives in a cloud service as well as in the repo; the two copies can drift until phase 2 |
| Data store, sign-in or hosting change | Database and file-storage security rules kept in the repo, and the live deploy job also deploys them. Hosting configuration gains the rules and local stand-in entries; the `trailingSlash` setting and the site's hosting rules stay as they are | The rules are what actually stop anyone but the owner from changing content | Deploying rules by hand: they could drift from what the repo says | The existing deploy account may need an extra Firebase role (see §7); until it has it, the rules deploy step fails |
| Other choice the agent would otherwise guess | The owner's account is named in the rules by its Firebase user ID. Until the owner fills it in, the rules hold a placeholder that matches nobody, so nothing can be written | The ID only exists after the owner's first sign-in, and the owner's email is not to be committed | Matching on the owner's email: puts personal data in the repo | The panel cannot save anything until the owner completes the §7 step |

## 5. Hard constraints

- The site stays a static export. No server, API route, middleware or Cloud Function is added.
- The database refuses every write that does not come from the owner's signed-in account, both from a
  signed-out browser and from any other signed-in Google account.
- Until the owner's user ID is filled in, the database refuses every write from everyone.
- A draft blog post cannot be read from the database by anyone but the owner.
- Signed out, or signed in as anyone but the owner, the panel shows no content from the database.
- No delete happens without a confirmation the owner accepted first.
- The only Firebase services used are Authentication, Firestore and Storage. No Cloud Functions or
  other paid service is added.
- File storage refuses every upload or delete that does not come from the owner's signed-in account,
  refuses any file over 5 MB, and refuses anything that is not a PNG, JPEG, WebP or SVG image.
- Until the owner's user ID is filled in, file storage refuses every upload and delete from everyone.
- The public pages (`/`, `/blog/`, every post, `/rss.xml`, `/sitemap.xml`, `/robots.txt`) show the same
  content as before, and none of them loads the Firebase library.
- The panel's address appears in neither `/sitemap.xml` nor `/robots.txt`, and the panel page tells
  search engines not to index it.
- No secret, password, personal email or `.env` value is committed or read.
- The panel styles itself with the site's existing colour tokens, in light and dark themes.

## 6. Definition of done

- [ ] Visiting `/bright-warm-greenhouse/` signed out shows a "Sign in with Google" control and no site
      content.
- [ ] Signed in as the owner, the panel shows a menu with Profile, Experience, Projects,
      Certifications, Tech stack and Blog posts.
- [ ] Signed in as a different Google account, the panel says the account is not allowed, shows no
      content, and offers sign-out.
- [ ] Against the local database stand-in, a write from a signed-out browser and a write from a
      non-owner account are both refused, and the same write from the owner succeeds.
- [ ] The owner can edit the profile (name, headline, about paragraphs, photo path, email, resume link,
      social links), save, reload the page, and see the saved values.
- [ ] For experience entries, projects, certifications and tech-stack categories (with their items),
      the owner can add one, edit it, change its order, and delete it after confirming; each change is
      still there after a reload.
- [ ] The owner can write a blog post in markdown with its title, excerpt, date, slug, tags, cover
      image path and alt text, featured and draft settings, save it, and see it listed with its status.
- [ ] Saving a post with a slug another post already uses is refused with a message, and nothing is
      overwritten.
- [ ] The owner can preview a post's markdown rendered the way the blog shows posts, before saving.
- [ ] A draft post cannot be read from the database stand-in while signed out.
- [ ] The owner can upload a PNG, JPEG, WebP or SVG image of up to 5 MB, see it listed in the panel,
      copy its address, and delete it after confirming.
- [ ] Uploading a file over 5 MB, or a file that is not one of those image types, is refused with a
      message, and nothing is stored.
- [ ] Against the local storage stand-in, an upload from a signed-out browser and from a non-owner
      account are both refused, and the same upload from the owner succeeds.
- [ ] In profile, certifications, tech stack and blog posts, an image can be chosen from the uploaded
      images or given as a path to a file in the repo, and the chosen image still shows after a
      reload.
- [ ] Choosing delete and then cancelling the confirmation leaves the record in place.
- [ ] Every panel screen works at 375 pixels wide with no sideways scrolling.
- [ ] The existing public-site smoke tests still pass, and the home page and a blog post load no
      Firebase script.
- [ ] The panel page carries a no-index instruction, and its address is absent from `/sitemap.xml` and
      `/robots.txt`.

## 7. Human-only items

- Upgrade the Firebase project to the Blaze plan, and set a budget alert in Google Cloud Billing (a
  small amount, for example US$1). Then create the default Storage bucket.
- In the Firebase console: create the Firestore database, turn on Google as a sign-in
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

## 8. Notes for the agent (optional)

- The panel is the only thing new. `docs/requirements/admin-content-panel.md` holds the earlier impact
  analysis and the recommended collections (`profile`, `experience`, `projects`, `certifications`,
  `techCategories`, `blogPosts`), with field shapes mirroring today's component data. Image uploads
  were first ruled out and then approved again by the owner on 2026-11-26 (Blaze plan). The stories
  were written while uploads were out: add one image library slice after the access-rules slice, and
  amend the profile, certifications, tech stack and blog post stories so an image field takes either
  an uploaded image or a repo path. Do not rewrite their other scenarios.
- OVERVIEW §2.2 (blog lives in repo markdown, no CMS) is to be rewritten: the panel is where posts are
  edited, and the repo files stay what the site renders until phase 2.
- When the signed-in account is refused, showing that account its own Firebase user ID is fine and
  helps the owner with the §7 step. It is that person's own ID, not anyone else's.
- One editor: the last save wins, with no conflict detection. Session time-outs and Firebase App Check
  are left for later.
- Content import was not asked for; the owner retypes the content.
- Sign-in, Google 2-step verification and account recovery are Google's; the panel stores no password.
