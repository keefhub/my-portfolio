# Admin content panel: intent acceptance

- **Intent:** `docs/requirements/admin-content-panel-intent.md`

Intent lines are numbered in order: `§5.n` is the n-th hard constraint, `§6.n` the n-th definition-of-done line, `§7.n` the n-th human-only item. Tests are in `e2e/admin-content-panel-acceptance.spec.ts` and run against the built `out/` and the Auth, Firestore and Storage emulators.

## Coverage

| Intent line | Outcome (one line) | Test id | Kind |
| --- | --- | --- | --- |
| §6.1 | Signed out, the panel shows Sign in with Google and no site content, and fetches no data | E2E-ACC-01 | automated |
| §6.2 | The owner sees the six-section menu and each section opens | E2E-ACC-02 | automated |
| §6.3 | Another Google account is told it is not allowed, sees no content, and can sign out | E2E-ACC-03 | automated |
| §6.4 | Database stand-in refuses signed-out and non-owner writes in every collection; the owner's write succeeds | E2E-ACC-04 | automated |
| §6.5 | The owner edits every profile field, saves, reloads and sees the values | E2E-ACC-05 | automated |
| §6.6 | Experience: add, edit, reorder, delete after confirming, persisted across reloads | E2E-ACC-06 | automated |
| §6.6 | Projects: add, edit, reorder, delete after confirming, persisted across reloads | E2E-ACC-07 | automated |
| §6.6 | Certifications: add, edit, reorder, delete after confirming, persisted across reloads | E2E-ACC-08 | automated |
| §6.6 | Tech stack: categories and their items added, edited, reordered, deleted after confirming, persisted | E2E-ACC-09 | automated |
| §6.7 | The owner writes posts with every setting and sees them listed with status | E2E-ACC-10 | automated |
| §6.8 | A slug already in use is refused with a message and nothing is overwritten | E2E-ACC-11 | automated |
| §6.9 | The markdown preview matches how the public blog renders the same markdown, and writes nothing | E2E-ACC-12 | automated |
| §6.10 | A draft written in the panel is unreadable signed out and non-owner, and readable once published | E2E-ACC-13 | automated |
| §6.11 | Upload PNG, JPEG, WebP, SVG and a 5 MB image, see them listed, copy the address, delete after confirming | E2E-ACC-14 | automated |
| §6.12 | Over 5 MB, wrong type and empty files are refused with a message and nothing is stored | E2E-ACC-15 | automated |
| §6.13 | Storage stand-in refuses signed-out and non-owner uploads; the owner's succeeds | E2E-ACC-16 | automated |
| §6.14 | An uploaded image chosen in profile, certifications, tech stack and blog posts is still chosen after reload | E2E-ACC-17 | automated |
| §6.14 | A repo image path given in the same four editors persists and its file loads | E2E-ACC-18 | automated |
| §6.15 | Delete then cancel leaves the record in all six lists and the image library | E2E-ACC-19 | automated |
| §6.16 | Every panel screen, including forms, preview and confirmations, fits 375 px with no sideways scroll | E2E-ACC-20 | automated |
| §6.17 | Public pages load and the home page and a post load no Firebase script (the smoke checks are replicated) | E2E-ACC-21 | automated |
| §6.18 | The panel carries a no-index instruction and is absent from the sitemap and robots.txt | E2E-ACC-22 | automated |
| §5.1 | No server, API route, middleware or Cloud Function exists; the panel is a static file | E2E-ACC-23 | automated (negative) |
| §5.2 | Signed-out and non-owner create, update and delete are refused in every collection and change nothing | E2E-ACC-24 | automated (negative) |
| §5.2 | A non-owner with the panel fooled into showing the editors still cannot save, upload or read private data | E2E-ACC-25 | automated (negative) |
| §5.3 | With the placeholder owner ID nobody can write, and the panel says saving is off | E2E-ACC-26 | automated (negative) |
| §5.4 | A draft or a post with no draft setting cannot be read, listed or queried by anyone but the owner | E2E-ACC-27 | automated (negative) |
| §5.5 | Signed out or as another account, the panel shows no database content and fetches none, even for asked-for sections | E2E-ACC-28 | automated (negative) |
| §5.6 | Delete alone, double-clicked, or abandoned by leaving the page, deletes nothing in any list | E2E-ACC-29 | automated (negative) |
| §5.7 | Only Auth, Firestore and Storage are imported, configured and reached | E2E-ACC-30 | automated (negative) |
| §5.8 | Storage refuses signed-out and non-owner uploads and deletes, over 5 MB, and non-image types | E2E-ACC-31 | automated (negative) |
| §5.9 | With the placeholder owner ID storage refuses every upload and delete, and the panel says so | E2E-ACC-32 | automated (negative) |
| §5.10 | Database content never reaches the public pages, which keep the repo's content and ship no Firebase code | E2E-ACC-33 | automated (negative) |
| §5.11 | The panel address is not in any public page, feed, sitemap or robots file, and the panel is no-index | E2E-ACC-34 | automated (negative) |
| §5.12 | No secret, key file, `.env` file or personal email is committed; only the two expected CI secrets are named | E2E-ACC-35 | automated (negative) |
| §5.13 | The panel's colours come from the site tokens in light and dark, with no raw colours in its source | E2E-ACC-36 | automated (negative) |
| §7.1 | Upgrade to Blaze, set a budget alert, create the default Storage bucket | — | manual: a Google Cloud billing and console step; also the only check that usage stays inside the free allowance |
| §7.2 | Create the Firestore database, enable Google sign-in, allow the sign-in domains | — | manual: Firebase console steps, not reachable by a test |
| §7.3 | Copy the user ID from the first live sign-in, put it in both rules files and the owner file, deploy | — | manual: needs a real sign-in on the live site |
| §7.4 | Give the deploy service account the Rules Admin role | — | manual: a console step; the secret's value is never touched |
| §7.5 | Check a real Google sign-in on the live site once | — | manual: the tests use the Auth emulator, not Google |
| §7.6 | Retype today's content into the panel | — | manual: the owner's own content work |
| §7.7 | Review and merge the pull request into `develop` | — | manual: a human decision |

## Test fixes

None.

## Open findings

None.
