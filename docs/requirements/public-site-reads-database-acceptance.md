# The public site shows the content managed in the admin panel: intent acceptance
- **Intent:** `docs/requirements/public-site-reads-database-intent.md`
- **Spec:** `e2e/public-site-reads-database-acceptance.spec.ts`

## Coverage
| Intent line | Outcome (one line) | Test id | Kind |
| --- | --- | --- | --- |
| §6.1 | A project changed in the panel and published shows on the public page within a minute | E2E-ACC-01 | automated |
| §6.2 | Before Publish a saved change (project edit, new post) is not visible, over repeated visits | E2E-ACC-02 | automated |
| §6.3 | A published post is listed, readable at its own address, and in RSS and the sitemap | E2E-ACC-03 | automated |
| §6.4 | A draft is absent from the list, not found at its address, absent from RSS and the sitemap | E2E-ACC-04 | automated |
| §6.5 | All certifications deleted and Publish: section and menu link gone, rest of the page renders | E2E-ACC-05 | automated |
| §6.6 | Database unreachable: every public page shows its last content and Publish shows a failure in the panel | E2E-ACC-06 | automated |
| §6.6 | The same on Vercel's real kept copies with a paused Supabase project (the test uses the stand-in) | — | manual: Vercel's real keeping of the last good copy cannot be observed in the local test run (decomposition Open findings 2) |
| §6.7 | Publish refused signed out, as another account, and from outside the panel; nothing changes | E2E-ACC-07 | automated (negative) |
| §6.8 | The publish route calls no other site and names no environment host (partial) | E2E-ACC-08 | automated (partial) |
| §6.8 | Publishing on SIT leaves live unchanged (two separate databases) | — | manual: the test run has one stand-in database, so two deployments cannot be compared (decomposition Open findings 1) |
| §6.9 | No hard-coded section content, no `content/` folder, no markdown posts in the repo | E2E-ACC-09 | automated |
| §5.1 | A published post made a draft and republished vanishes from list, address, RSS, sitemap | E2E-ACC-10 | automated (negative) |
| §5.2 | Database unreachable: no error page, no emptied section, an unopened post and an unknown address behave | E2E-ACC-11 | automated (negative) |
| §5.3 | Only the signed-in owner can publish; signed out, other account and outside the panel are refused | E2E-ACC-07 | automated (negative) |
| §5.4 | Saving profile, experience, certification, project and post changes shows nothing until Publish | E2E-ACC-12 | automated (negative) |
| §5.5 | A section with no content and its menu link are not shown; an empty profile hides hero and About | E2E-ACC-13 | automated (negative) |
| §5.6 | A publish that cannot reach the database fails, the panel says so, public pages unchanged | E2E-ACC-14 | automated (negative) |
| §5.7 | No setting value, database address or owner email in pages, scripts, the panel or refusals | E2E-ACC-15 | automated (negative) |
| §5.8 | Scripts a visitor loads contain no database or storage code | E2E-ACC-16 | automated (negative) |
| §5.9 | With the database empty the site serves no section content or posts from the repo | E2E-ACC-17 | automated (negative) |
| §5.10 | The code reads no setting naming another environment and names no environment host (partial) | E2E-ACC-18 | automated (partial) |
| §5.10 | SIT and live read and write only their own database; a publish on one never changes the other | — | manual: needs two real deployments with two databases; the test run has one stand-in database |
| §5.11 | No dependency, lock package, setting, workflow or build file added since the baseline | E2E-ACC-19 | automated (negative) |
| §5.12 | Slashed addresses, UTC dates, one origin constant, unoptimised images, no `dark:` variants, owner-only panel | E2E-ACC-20 | automated (negative) |
| §5.7 | Nothing logs a secret (runtime logs on the live host) | — | manual: runtime logs of the deployed site are not observable from the test run |
| §7.1 | Re-enter today's content in the SIT database and check SIT against today's live site | — | manual: human-only item |
| §7.2 | Re-enter today's content in the live database and compare section by section before merging to `master` | — | manual: human-only item |
| §7.3 | Restore the Supabase project in its dashboard if it pauses | — | manual: human-only item |
| §7.4 | Review and merge the pull request into `develop`, and later `develop` into `master` | — | manual: human-only item |

## Test fixes
None.

## Open findings
None.
