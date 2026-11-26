# Separate SIT and production: decomposition

- **Intent:** `docs/requirements/separate-sit-and-production-intent.md`
- **Date:** 2026-11-26

## Restatement

The owner can sign in to the admin panel and save content on SIT (project `thegoldenpothos-sit`) and on production (project `thegoldenpothos-5b3a1`) separately, each with its own content and security rules, with the panel choosing the project from the page address and each project's rules deployed from its own branch (matches intent §1).

## Impact analysis

Checked against the tree on 2026-11-26. Pull request #3 (`ci/sit-and-prod-pipeline`) is merged: `.firebaserc` has the `sit` and `prod` aliases, and `pipeline.yml` has the `sit` and `production` deploy jobs. All ten admin features (`admin-sign-in` to `manage-image-library`) and the `admin-content-panel` acceptance tests are built, and every one assumes the single project `thegoldenpothos-5b3a1`. Detail and the full touched-file list are in `docs/requirements/sit-and-production-projects.md` (the source decomposition named by intent §8); this document restates only what the slice needs.

### Touched modules

| Path | read / write | Why |
| --- | --- | --- |
| `src/lib/firebase/config.ts` | write | Holds one web config whose `apiKey` and `appId` are the placeholders `REPLACE_WITH_FIREBASE_WEB_API_KEY` and `REPLACE_WITH_FIREBASE_WEB_APP_ID`; sign-in fails because of them. It becomes the SIT and production configs, the choice by page address, and the only file allowed to hold the two real API keys |
| `src/lib/firebase/client.ts` | write | `sharedApp()` calls `initializeApp(firebaseWebConfig)`. It must start Firebase with the config chosen for `window.location.hostname`; emulator branches for `localhost` and `127.0.0.1` stay |
| `src/lib/admin/owner.ts` | write | One `OWNER_UID` (placeholder `REPLACE_WITH_OWNER_UID`). It needs one owner ID per project, chosen with the config; `accessFor` and the emulator override keep working |
| `firestore.rules`, `storage.rules` | write | `ownerUid()` returns one ID in each file. Both files deploy unchanged to both projects, so the owner check must accept the owner ID of either project |
| `.github/workflows/pipeline.yml` | write | The `develop` job deploys hosting only; it must also deploy the rules to SIT. The `master` job keeps deploying rules to production |
| `package.json` | write | `deploy:rules` names `--project thegoldenpothos-5b3a1`; SIT needs its own rules deploy |
| `e2e/admin-owner-only-access.spec.ts` E2E-21 and E2E-19, `e2e/manage-image-library.spec.ts` E2E-14 and E2E-12 | write | Each checks the old single-project rule (never deploy rules from `develop`; one owner ID equal to the placeholder in three places) and fails on the new one |
| `e2e/admin-content-panel-acceptance.spec.ts` E2E-ACC-35 | write | Fails on any `AIza...` key outside `e2e/`; the real keys must be allowed in `src/lib/firebase/config.ts` only |
| Emulator specs (`admin-sign-in`, `manage-*`, `preview-blog-post`, `admin-content-panel-acceptance`) | read | They use project ID `thegoldenpothos-5b3a1` and bucket `thegoldenpothos-5b3a1.firebasestorage.app` against the stand-ins. Keeping the local stand-in setup at those two values leaves them unchanged |
| `e2e/admin-sign-in.spec.ts` E2E-17 and the acceptance check that the panel's scripts contain `thegoldenpothos-5b3a1` | read | Both should still hold with both configs in the bundle; the spec confirms it |
| `firebase.json`, `.firebaserc` | read | Aliases `sit` and `prod` already exist; the `develop` job deploys by alias |

### New surface

- One module boundary: a rule that picks the Firebase web config and owner ID from the page address (production addresses, SIT addresses, anything else counts as SIT, `localhost` and `127.0.0.1` use the local stand-ins).
- A second owner ID, one per project, and an owner check in both rules files that accepts either.
- A rules deploy to SIT in the `develop` job and a package script for it.
- No new screen, no stored data, no dependency, no environment variable and no secret. The workflow still names only `GITHUB_TOKEN` and `FIREBASE_SERVICE_ACCOUNT`.

### Migration risk

None for stored data. The SIT database is new and empty (Firestore Native mode, `nam5`); production data is untouched. Production's database is in Datastore mode, so production saves cannot be shown working until the owner moves it to Native mode (intent §3 and §7, human-only).

### What already covers part of this

- `.firebaserc` already has the `sit` and `prod` aliases.
- The `sit` and `production` GitHub environments each hold their own `FIREBASE_SERVICE_ACCOUNT`.
- The `develop` job already deploys hosting to `thegoldenpothos-sit`.
- `isEmulatorHost` in `src/lib/firebase/config.ts` already sends `localhost` and `127.0.0.1` to the emulators.
- The `unfilled` access state in `src/lib/admin/owner.ts` already shows the saving-off notice while an owner ID is the placeholder.

## Slices

| Slug | Title | User goal | Intent lines served | Scenarios (est.) | Depends on | Needs (intent §4) |
| --- | --- | --- | --- | --- | --- | --- |
| `separate-sit-and-production` | Separate SIT and production | As the owner, I sign in and save content on SIT without touching live data, and do the same on production | §1 goal; §2.4 rules; §2.5 worries 1-4; §5 all eleven constraints; §6 all six lines | about 9 | `admin-sign-in`, `admin-owner-only-access`, `manage-image-library` (all built) | Second Firebase project (approved); `develop` deploys rules to SIT with the `sit` `FIREBASE_SERVICE_ACCOUNT` (approved); real public web keys and app IDs committed in the web config file only (approved); rewrite of five tests (approved). No new dependency, no environment variable |

## Run order

| # | Slug | Why here | Status |
| --- | --- | --- | --- |
| 11 | `separate-sit-and-production` | The only slice. It needs the built sign-in, owner rules and image storage rules from rows 1, 2 and 10 of the `CLAUDE.md` order table, so it goes after the last existing row | written |

## Coverage of the intent

| Intent line (§5 constraint or §6 definition of done) | Slice(s) |
| --- | --- |
| §5: Nothing saved or uploaded on a SIT or unlisted address reaches the production project | `separate-sit-and-production` |
| §5: Nothing saved or uploaded on a production address reaches the SIT project | `separate-sit-and-production` |
| §5: On `localhost` and `127.0.0.1` the panel talks only to the local stand-ins | `separate-sit-and-production` |
| §5: A push to `develop` never deploys the site or rules to production | `separate-sit-and-production` |
| §5: A push to `master` never deploys the site or rules to SIT | `separate-sit-and-production` |
| §5: Only that environment's owner user ID can save, upload or delete; any other account is refused | `separate-sit-and-production` |
| §5: While an environment's owner ID is the placeholder, nobody can save there | `separate-sit-and-production` |
| §5: Public pages load no Firebase code, and their content and look do not change | `separate-sit-and-production` |
| §5: No secret committed; the two public web API keys appear only in the web config file | `separate-sit-and-production` |
| §5: The pipeline names no secret other than `GITHUB_TOKEN` and `FIREBASE_SERVICE_ACCOUNT` | `separate-sit-and-production` |
| §5: No environment variable added; static export, no server | `separate-sit-and-production` |
| §6: Production addresses use only project `thegoldenpothos-5b3a1` | `separate-sit-and-production` |
| §6: SIT and unlisted addresses use only project `thegoldenpothos-sit` | `separate-sit-and-production` |
| §6: `localhost` and `127.0.0.1` use only the local stand-ins | `separate-sit-and-production` |
| §6: The built panel has no placeholder sign-in values and contains each project's real app ID | `separate-sit-and-production` |
| §6: The `develop` pipeline deploys the site and rules to `thegoldenpothos-sit` only | `separate-sit-and-production` |
| §6: The `master` pipeline deploys the site and rules to `thegoldenpothos-5b3a1` only | `separate-sit-and-production` |

## Decisions

1. [human: intent §8] One slice, not two: the owner ruled on 2026-11-26 that `separate-sit-and-production` is one feature even though it fails sizing tests 2 and 4 (about 9 scenarios, two new boundaries). Why: one pull request.
2. [human: intent §4] A second Firebase project `thegoldenpothos-sit` is approved. This replaces the single-project line in `admin-content-panel-intent.md` §4.
3. [human: intent §2.4] Address mapping is fixed: three listed production addresses go to production, three listed SIT addresses go to SIT, any other address counts as SIT, `localhost` and `127.0.0.1` use the local stand-ins.
4. [human: intent §4] No environment variable and no build-time switch: the panel picks the project from `window.location.hostname`, so one build serves both environments.
5. [human: intent §4] Real web API keys and app IDs of both projects are committed in `src/lib/firebase/config.ts` only; production's bucket is `thegoldenpothos-5b3a1.appspot.com`, SIT's is `thegoldenpothos-sit.firebasestorage.app`.
6. [human: intent §3] No content sync between environments and no environment label in the panel; SIT starts empty.
7. [human: intent §4] The five tests (E2E-21, E2E-14, E2E-19, E2E-12, E2E-ACC-35) are rewritten to the new rules and each must still fail when its rule is broken. No other test is loosened or deleted.
8. [human: intent §8] Local stand-in setup keeps project ID `thegoldenpothos-5b3a1` and bucket `thegoldenpothos-5b3a1.firebasestorage.app`, so the eight emulator specs are unchanged.
9. [human: intent §8] Both rules files deploy unchanged to both projects, so the owner check accepts the owner ID of either project. Each project's sign-in tokens are only valid in that project, so this does not let the SIT owner write to production.
10. [auto] Owner IDs ship as placeholders for both projects: Why: each ID is known only after the first real sign-in on that project (intent §7); until then the panel shows the existing saving-off notice and nobody can save.
11. [auto] Slice scenario focus: the story covers the address-to-project mapping (production, SIT, unlisted, local), the placeholder-owner and non-owner refusals per environment, the two deploy jobs, and the public pages staying free of Firebase code. Why: these are the §5 constraints and §6 lines, and each is observable from outside.
12. [auto] The address choice is tested on the built `out/` with Playwright by opening the panel under each address and recording the Firebase requests, with the local stand-ins for `localhost` and `127.0.0.1`. Why: Playwright is the only runner and Google sign-in is not automatable (intent §7).
13. [auto] Deploy checks (§6 last two lines) are tests that read `.github/workflows/pipeline.yml` and `package.json`, as E2E-21 and E2E-14 do today. Why: a pipeline cannot be run in a test, and the existing pattern already does this.
14. [auto] No concurrency, scale or multi-user handling: one owner, two environments (intent §8). Why: simplest option for this app.

## Human-only

- Merge pull request #3 (`ci/sit-and-prod-pipeline`) into `develop` before the run starts. The run branches from `develop`.
- Install Java on the machine that runs the tests (the local stand-ins need it), or run the goal in a cloud session that has Java.
- In each project's console: turn on Google sign-in, and add the addresses to the allowed sign-in domains (`sit.thegoldenpothos.xyz` in SIT, `thegoldenpothos.xyz` in production).
- Make sure the SIT deploy account has the Firebase Rules Admin role, so the SIT rules deploy works.
- Set a small budget alert on the SIT project in Google Cloud Billing (for example US$1).
- Move the production database from Datastore mode to Native mode, in `nam5`.
- After the first real sign-in on each environment, copy that project's user ID from Authentication, Users, into that environment's owner ID, then deploy. Until then the panel can be signed in to, but cannot save.
- Check a real Google sign-in once on SIT and once on production. The automated tests use the local stand-ins, not Google.
- Optional: restrict each web API key to its own addresses in Google Cloud Credentials, including its project's `firebaseapp.com` address.
- Review and merge the pull request into `develop`.
- After this reaches `master`, delete the repo-level `FIREBASE_SERVICE_ACCOUNT` secret.

## Rejected splits

- `panel-project-by-address` (sign-in against the project of the address) then `owner-access-per-environment` (owner ID per project, rules deployed to SIT). Each was demonstrable and within size, but the owner ruled one feature for one pull request (intent §8).
- Choosing the config at build time from an environment variable. Intent §4 adds no environment variable, E2E-ACC-35 forbids `process.env` in admin code, and the built files would differ per environment so CI would not check what is deployed.
- A foundation-only slice for the address-choice module. Rejected: nobody could act it out in the app; it is demonstrated only through sign-in and save on a real environment.

## Open findings

- Intent §7 lists merging pull request #3 into `develop` before the run. Git history on this branch already contains the merge commit `ebf3efa`, so that item appears done on this branch; the owner should still confirm `develop` has it before `/agentic-run` branches from it. No slice is blocked by this.
- Sizing: the single slice fails sizing tests 2 and 4 by the owner's explicit ruling (intent §8). The spec stage should keep the scenario count near 9 and not add scenarios beyond intent §5 and §6.
