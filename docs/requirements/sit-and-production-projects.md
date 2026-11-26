# SIT and production projects: decomposition

- **Date:** 2026-11-26
- **Branch:** stacks on `ci/sit-and-prod-pipeline` (pull request #3 into `develop`, not yet merged), which added the `sit` and `prod` aliases in `.firebaserc`, the `sit` and `production` GitHub environments with one `FIREBASE_SERVICE_ACCOUNT` each, and the SIT hosting deploy.

## Restatement

Confirmed by the owner, 2026-11-26:

The admin panel works against the Firebase project that matches the address it is opened on: SIT on
the SIT addresses and on any unknown address, production on the production addresses, and the local
emulators on `localhost`. It signs the owner in with that project's real web config, treats the owner
as the owner in each project by that project's own user ID, and each project's security rules are
deployed from its own branch (`develop` to SIT, `master` to production). Nothing the visitor or the
owner sees in the panel changes, apart from sign-in working.

| Environment | Firebase project | Addresses | Deployed from |
| --- | --- | --- | --- |
| SIT | `thegoldenpothos-sit` | `sit.thegoldenpothos.xyz`, `thegoldenpothos-sit.web.app`, `thegoldenpothos-sit.firebaseapp.com`, any address not listed for production | `develop` |
| Production | `thegoldenpothos-5b3a1` | `thegoldenpothos.xyz`, `thegoldenpothos-5b3a1.web.app`, `thegoldenpothos-5b3a1.firebaseapp.com` | `master` |
| Local | the emulators, project ID `thegoldenpothos-5b3a1` | `localhost`, `127.0.0.1` | not deployed |

Web config of each project, read with `firebase apps:sdkconfig` on 2026-11-26. These values are public: they identify the project to the browser and grant no access. The two API keys are not written here: E2E-ACC-35 scans every file outside `e2e/` for them, and this feature allows them in `src/lib/firebase/config.ts` only.

| Field | Production | SIT |
| --- | --- | --- |
| `apiKey` | Printed by `npx firebase apps:sdkconfig WEB 1:118802075178:web:2aadd98f062a076b6b7d53 --project thegoldenpothos-5b3a1` | Printed by `npx firebase apps:sdkconfig WEB 1:997284265022:web:8bd2d5a364762d08a0256f --project thegoldenpothos-sit` |
| `appId` | `1:118802075178:web:2aadd98f062a076b6b7d53` | `1:997284265022:web:8bd2d5a364762d08a0256f` |
| `authDomain` | `thegoldenpothos-5b3a1.firebaseapp.com` | `thegoldenpothos-sit.firebaseapp.com` |
| `projectId` | `thegoldenpothos-5b3a1` | `thegoldenpothos-sit` |
| `storageBucket` | `thegoldenpothos-5b3a1.appspot.com` (owner confirmed from the console) | `thegoldenpothos-sit.firebasestorage.app` |

## Impact analysis

Checked against the tree on 2026-11-26. `git log --grep="^feat("` lists all ten admin features
(`admin-sign-in` through `manage-image-library`) and `feat(admin-content-panel)` acceptance tests. Every
one of them assumes the single project `thegoldenpothos-5b3a1`.

### Touched modules

| Path | read / write | Why |
| --- | --- | --- |
| `src/lib/firebase/config.ts` | write | Holds one web config whose `apiKey` and `appId` are the placeholders `REPLACE_WITH_FIREBASE_WEB_API_KEY` and `REPLACE_WITH_FIREBASE_WEB_APP_ID`. Live sign-in fails with "The requested action is invalid" because of them. It becomes the SIT and production configs plus the choice by address |
| `src/lib/firebase/client.ts` | write | `sharedApp()` calls `initializeApp(firebaseWebConfig)`. It must start Firebase with the config chosen for `window.location.hostname` |
| `src/lib/admin/owner.ts` | write | One `OWNER_UID`, the placeholder `REPLACE_WITH_OWNER_UID`. It needs one owner ID per project, chosen with the config |
| `firestore.rules`, `storage.rules` | write | `ownerUid()` returns one ID. Both files are deployed unchanged to both projects, so the owner check must accept the owner ID of either project |
| `.github/workflows/pipeline.yml` | write | The `develop` job deploys hosting only. It must also deploy the rules to SIT |
| `package.json` | write | `deploy:rules` names `--project thegoldenpothos-5b3a1`. SIT needs its own deploy of the rules |
| `e2e/admin-owner-only-access.spec.ts` E2E-21, `e2e/manage-image-library.spec.ts` E2E-14 | write | Both require that the `develop` job never deploys the rules |
| `e2e/admin-owner-only-access.spec.ts` E2E-19, `e2e/manage-image-library.spec.ts` E2E-12 | write | Both require the owner ID to equal the placeholder in `owner.ts` and the rules, and both read a single ID with one regular expression. Filling in a real owner ID fails them today |
| `e2e/admin-content-panel-acceptance.spec.ts` E2E-ACC-35 | write | Fails on any `AIza[0-9A-Za-z_-]{30,}` outside `e2e/`. The real keys must be allowed in `src/lib/firebase/config.ts` only |
| The emulator specs (`admin-sign-in`, `manage-*`, `preview-blog-post`, `admin-content-panel-acceptance`) | read | They use project ID `thegoldenpothos-5b3a1` and bucket `thegoldenpothos-5b3a1.firebasestorage.app` against the emulators. Keeping the local emulator config at those two values leaves them unchanged |
| `e2e/admin-sign-in.spec.ts` E2E-17, E2E-ACC line 1184 | read | E2E-17 opens the panel on `admin.example.test` and accepts a request to any of three Google hosts. E2E-ACC checks the panel's scripts contain `thegoldenpothos-5b3a1`. Both still hold with both configs in the bundle; the spec confirms it |

### New surface

- A rule that picks the Firebase config from the page address. It is a new module boundary.
- A second owner ID, one per project. It changes the shape of the owner check in both rules files.
- No new screen, no new stored data, no new dependency, no new secret. The workflow still names only `GITHUB_TOKEN` and `FIREBASE_SERVICE_ACCOUNT`.

### Migration risk

None for stored data. The SIT database is new and empty (created 2026-11-26, Firestore Native mode,
`nam5`). Production data is untouched.

The production database is in Datastore mode (`firebase firestore:databases:get`, 2026-11-26). The
panel's Firestore client needs Native mode, so production saves cannot be shown working until the owner
moves it to Native mode. This is a console task outside this feature.

### Standing-context conflict

Intent §4 (`docs/requirements/admin-content-panel-intent.md`, External service row) names "the existing
project `thegoldenpothos-5b3a1`" as the one Firebase project. The owner ruled on 2026-11-26, in the
session that set up the pipeline, to add a second project `thegoldenpothos-sit` for SIT. The story
records this as `[human]`.

### What already covers part of this

- `.firebaserc` already has the `sit` and `prod` aliases (commit `832e57c`).
- The `sit` and `production` GitHub environments already hold their own `FIREBASE_SERVICE_ACCOUNT`.
- The `develop` job already deploys hosting to `thegoldenpothos-sit` (commit `8a7a63e`).
- `isEmulatorHost` already sends `localhost` and `127.0.0.1` to the emulators.

## Slices

| Build position | Slug | Title | User goal | Scenarios (estimate) | Depends on |
| --- | --- | --- | --- | --- | --- |
| 11 | `separate-sit-and-production` | Separate SIT and production | As the owner, I sign in and save content on SIT without touching live data, and do the same on production | about 9 | `admin-sign-in`, `admin-owner-only-access`, `manage-image-library` (all built) |

The owner chose one slice over two on 2026-11-26. It fails sizing tests 2 and 4 (about 9 scenarios, two
new boundaries: the config choice and the owner ID per project). The owner accepted that to get one pull
request.

## Rejected splits

- `panel-project-by-address` (sign-in against the project of the address) then `owner-access-per-environment` (owner ID per project, rules deployed to SIT). Each was demonstrable and within size. The owner merged them into one feature.
- A config chosen at build time from an environment variable. Intent §4 rules out a new environment variable, and E2E-ACC-35 forbids `process.env` in admin code. The built files would also differ per environment, so CI would not check what is deployed.

## Open questions

1. Owner user IDs. Each project gives the owner a different ID, known only after the first real sign-in on that project. The feature ships with placeholders for both; the owner fills them in afterwards. The story must say what the panel shows on an environment whose ID is still the placeholder (today it shows the saving-off notice).
2. Allowed addresses on each web API key (Google Cloud console, Credentials, Application restrictions). This is optional hardening, done by the owner. If it is set, each key must also allow its project's `firebaseapp.com` domain, or sign-in breaks.
3. Authorized domains for sign-in. `sit.thegoldenpothos.xyz` must be listed in the SIT project and `thegoldenpothos.xyz` in production. The owner does this in the console.
