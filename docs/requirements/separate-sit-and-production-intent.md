# Intent: Separate SIT and production

- **Slug:** `separate-sit-and-production`
- **Owner:** Keith Lim
- **Status:** ready (owner confirmed the read-back, 2026-11-26)
- **Source:** `docs/requirements/sit-and-production-projects.md` (decomposition, confirmed 2026-11-26)

## 1. Goal

The owner can sign in to the admin panel and save content on two separate environments: SIT, where
changes are tried first, and production, the live site. Each environment has its own content and its own
security rules, so nothing done on SIT reaches live content, and a rules change reaches SIT before it
reaches production. Today the panel cannot be used at all, because sign-in fails everywhere.

## 2. Business context

### 2.1 The problem today

The owner cannot sign in to the admin panel on any site: the sign-in window shows "The requested action
is invalid". All ten panel features are built, but none of them can be used, so content can still only be
changed in the repo.

### 2.2 Why now, and what success looks like

The panel is finished but unusable, and the SIT and production deploys were just separated (SIT deploys
from `develop`, production from `master`). Success, a month in:

- The owner changes content on the SIT site, and the live site and its content show no trace of it.
- The owner signs in on the live site, saves a change, and it is still there after a refresh.
- A security rules change merged to `develop` is in force on SIT before it reaches production.

### 2.3 Users and their situation

- The owner (Keith) is the only person who signs in and saves, on both SIT and production, whenever
  content changes.
- Anyone else who signs in, on either environment, can see the panel but cannot save.
- Public visitors read the site and never use the panel. They must not notice any change.

### 2.4 Business rules

- Only the owner may save, upload or delete, on each environment. Each environment recognises the owner by its own user ID, because the two projects give the owner different IDs.
- The production addresses are `thegoldenpothos.xyz`, `thegoldenpothos-5b3a1.web.app` and `thegoldenpothos-5b3a1.firebaseapp.com`.
- The SIT addresses are `sit.thegoldenpothos.xyz`, `thegoldenpothos-sit.web.app` and `thegoldenpothos-sit.firebaseapp.com`.
- An address that is neither a production nor a SIT address counts as SIT, so a preview link or a mistyped domain can never write live content.
- `localhost` and `127.0.0.1` use the local stand-ins, never a real environment.
- What is on `develop` goes to SIT; what is on `master` goes to production. This holds for the site and for the security rules.
- SIT costs stay near zero: it is used by the owner only, inside the free allowance, with a small budget alert set by the owner.

### 2.5 What happens when it goes wrong

The owner's four worries, each of which must never happen:

- Something saved on SIT lands in the live content or the live images.
- An edit made on the live site goes to SIT instead, so the live site silently does not change.
- A push or merge to `develop` changes the security rules in force on production.
- Someone other than the owner saves content or uploads images, on either environment.

## 3. Non-goals

- No tool to copy or sync content between SIT and production. SIT starts empty.
- No change to the production database's mode. Moving it from Datastore mode to Native mode is the owner's console task (§7).
- No visible label in the panel saying which environment it is on.

## 4. Pre-approved decisions

An explicit yes for anything the pipeline would otherwise stop and ask about. Only what is listed here
is allowed; anything else still stops the run.

| Kind | What is approved | Why it is needed, and what it changes | Alternatives ruled out, and why | Cost or risk accepted |
| --- | --- | --- | --- | --- |
| New dependency | None | | | |
| New environment variable | None. The panel picks its environment from the page address | The earlier intent ruled out environment variables for the web config, and the same build must work on both environments | A build-time switch: the files checked in CI would differ from what is deployed | None |
| External service or provider | A second Firebase project, `thegoldenpothos-sit` (sign-in, database, file storage, hosting, Blaze plan), next to `thegoldenpothos-5b3a1`. This replaces the line in `admin-content-panel-intent.md` §4 that names one existing project | SIT needs its own content and rules so nothing tried there reaches live content | A second site in the production project: shares the live database, so SIT edits change live content | Blaze has no hard spending cap, only the budget alert the owner sets (§7) |
| Data store, sign-in or hosting change | The `develop` pipeline deploys the database and file-storage security rules to SIT, using the `sit` environment's existing `FIREBASE_SERVICE_ACCOUNT`. The `master` pipeline keeps deploying them to production | Lets a rules change be tried on SIT before it reaches production | Deploying SIT rules by hand: they drift from the repo | If the SIT deploy account lacks the rules role, the SIT deploy fails until the owner grants it |
| Other choice the agent would otherwise guess | Commit the real public web API keys and app IDs of both projects, in the Firebase web config file only. Production's storage bucket is `thegoldenpothos-5b3a1.appspot.com` (owner confirmed from the console) | Sign-in fails with placeholders. The keys only identify the project; the rules decide access | Pasting the keys by hand after the run: sign-in stays broken until then | The keys are visible in the public repo, which is how Firebase web keys are designed to be used |
| Other choice the agent would otherwise guess | Rewrite five existing tests to the new rules: E2E-21 and E2E-14 (`develop` deploys rules to SIT only, `master` to production only), E2E-19 and E2E-12 (each project's owner ID agrees across the places it is kept, filled in or placeholder), E2E-ACC-35 (web API keys allowed in the web config file only) | Each test checks the old single-project rule and fails on the new one | Loosening or deleting them: loses the protection they give | None. Each rewritten test must still fail when its rule is broken |

## 5. Hard constraints

- Nothing saved or uploaded on a SIT address or an unlisted address reaches the production project's database or file storage.
- Nothing saved or uploaded on a production address reaches the SIT project.
- On `localhost` and `127.0.0.1` the panel talks only to the local stand-ins, never to either real project.
- A push to `develop` never deploys the site or the security rules to the production project.
- A push to `master` never deploys the site or the security rules to the SIT project.
- On each environment, only that environment's owner user ID can save, upload or delete. Any other signed-in account is refused.
- While an environment's owner ID is still the placeholder, nobody can save on that environment.
- Public pages load no Firebase code, and their content and look do not change.
- No secret is committed. The two public web API keys appear only in the Firebase web config file.
- The pipeline names no secret other than `GITHUB_TOKEN` and `FIREBASE_SERVICE_ACCOUNT`.
- No environment variable is added, and the site stays a static export with no server.

## 6. Definition of done

Each line is an outcome someone can observe from the outside and test without reading the code. The
final acceptance check turns each line into a test and each hard constraint into a negative test.

- [ ] Opened on any production address, the panel sends its sign-in, database and storage requests only for the project `thegoldenpothos-5b3a1`.
- [ ] Opened on any SIT address or an unlisted address, the panel sends its sign-in, database and storage requests only for the project `thegoldenpothos-sit`.
- [ ] Opened on `localhost` or `127.0.0.1`, the panel sends its sign-in, database and storage requests only to the local stand-ins.
- [ ] The built panel contains no placeholder sign-in values, and it contains the real app ID of each project.
- [ ] The `develop` pipeline deploys the site and the security rules to `thegoldenpothos-sit` and to no other project.
- [ ] The `master` pipeline deploys the site and the security rules to `thegoldenpothos-5b3a1` and to no other project.

## 7. Human-only items

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

## 8. Notes for the agent (optional)

- The decomposition, the environment table, each project's web config and the impact analysis are in `docs/requirements/sit-and-production-projects.md`. The owner ruled one slice (`separate-sit-and-production`), accepting that it is larger than the usual size limit.
- Print each web API key with `npx firebase apps:sdkconfig WEB <appId> --project <projectId>` (app IDs are in the decomposition). Never write a key anywhere but the web config file: E2E-ACC-35 scans every file outside `e2e/`, untracked ones included.
- Keep the local stand-in setup on project ID `thegoldenpothos-5b3a1` and bucket `thegoldenpothos-5b3a1.firebasestorage.app`. Eight existing specs rely on those two values against the stand-ins.
- The security rules files are deployed unchanged to both projects, so the owner check must accept the owner ID of either project. A sign-in from one project is never accepted by the other, so this does not let the SIT owner write to production.
- The `.firebaserc` aliases `sit` and `prod`, the `sit` and `production` GitHub environments and their secrets, and the SIT hosting deploy already exist (pull request #3).
- One owner, two environments: no concurrency, scale or multi-user concerns. Decide those the simple way.
