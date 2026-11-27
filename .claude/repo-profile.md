# Repo profile — my-portfolio

The pipeline skills (`/help-discover-this`, `/run-this`, `/spec-this`, `/enhance-this-spec`,
`/do-this`, `/thermos`, and the autonomous `/agentic-intent`, `/agentic-discover`, `/agentic-run`,
`/agentic-accept`) cite this file for every repo-specific fact instead of carrying copies. Fix a
fact here when it changes.

## Branches

- Main branch: `develop` — the base that `/thermos` and the thermo-nuclear reviews diff against.
  Flow is feature branch → `develop` (Vercel serves it at sit.thegoldenpothos.xyz) → `master` (Vercel production, thegoldenpothos.xyz). The site is deployed by Vercel's Git integration, not by the workflow. Only `develop` may open a pull request into `master` (the `master-source` job in `pipeline.yml`).
- Protected branches: `develop`, `main`, `master`. No agent commits, pushes or writes to them; work on
  a feature branch and open a pull request (the guard in `scripts/guard-bash.sh` enforces it).
- Pull requests always target `develop`. The guard refuses a `gh pr create` without `--base develop`
  and any other base. The pull request description follows `.github/pull_request_template.md`.
- Commit style: Conventional Commits — `feat(<slug>): …`, `fix(<scope>): …`, `docs(<slug>): …`.

## Models

- **Orchestrator: Opus.** The chat session that runs the stage skills holds the plan, runs the
  scripts, makes the gate decisions and writes the commits. Whoever starts the session picks Opus;
  nothing in the repo sets it.
- **Subagents: Sonnet, every one.** The agent definitions in `.claude/agents/` all say
  `model: sonnet`, and every dispatch the skills write passes `model: sonnet`. Don't raise a
  subagent's tier; retry or re-scope it instead.

## Verification commands

| Command | Applies | Success signal |
| --- | --- | --- |
| `npm run typecheck` | Every task | Exits 0, no type errors |
| `npm run lint:new` | Every task. Runs ESLint and ignores only the known baseline error (`ThemeProvider.tsx:25`, `react-hooks/set-state-in-effect`), so any other error fails it. `npm run lint` itself exits 1 on that baseline and is not used as a gate | Last line `lint:new: 0 error(s)…`; exits 0 |
| `npm run build` | Every task (the mechanical gate runs it), and before a feature's plan is marked complete. It builds the site and is the only check that catches server/client boundary violations, `generateStaticParams` gaps, a public page that became dynamic, and blog frontmatter validation | Exits 0 |
| `npx playwright test e2e/<slug>.spec.ts -g "<E2E-id regex>"` | One browser row. No `npm run build &&` in front: the gate builds once before it runs the command, and a worker builds once before its first browser run and again only after changing code. Needs a current `.next/` build | Exits 0, the matching row passes |
| `npx playwright test e2e/<slug>.spec.ts` | **The only whole-spec e2e run the pipeline requires**: at feature completion, and again before pushing to `develop`. After `npm run build` | Exits 0; every test in the feature's spec file passes |
| `npm run test:e2e` | **Not a gate.** The full suite, optional and on request only. It is slow, so never per task, never at feature completion, never before a push, and **never in CI** | Exits 0, all tests pass |
| `npm run step:packet -- <slug> <step>` | Every task, first: writes the part of `spec.md` a worker reads to `.run-logs/<slug>/step-<N>.md` (`scripts/step-packet.sh`) | Last line `PACKET: <path> (<lines> lines, E2E rows: <n>)`; exits 0 |
| `npm run check:task -- <slug> <step> [--escalate <reasons>]` | Every task: the orchestrator runs it once the implementer has returned, and again after any fix (`scripts/check-task.sh`) | Last three lines `MECH: PASS`, `TIER: high\|low`, `ESCALATE: <reasons or none>`; exits 0 on `PASS`. It runs typecheck, `lint:new`, build and the Step's own single-test commands itself, cheapest first: a failing static check skips the rest, and a failing build skips the single-test commands (`SKIP RUN`) |
| `npm run -s verify -- <command>` | Every test, build, lint or type run a worker, the gate or the orchestrator makes (`scripts/verify/`). Keeps the whole output in a log file (default `.run-logs/verify/<time>-<hash>.log`; `--log <path>` or `VERIFY_LOG` to choose) and prints a digest of at most 90 lines: `VERIFY`, `EXIT`, `LOG`, then per section (`[playwright]`, `[typecheck]`, `[lint]`, `[build]`) the counts and each failure's `file:line`, title and first error lines. Playwright results are read from its JSON report (`VERIFY_PLAYWRIGHT_JSON`, wired in `playwright.config.ts`) | The command's own exit status; the digest's `EXIT` line repeats it |
| `npm run check:spec -- <slug>` | Once per spec, before the review packet is frozen (`/spec-this` Phase 10, `/enhance-this-spec`) (`scripts/check-spec.sh`) | Last line `SPEC-LINT: PASS`; exits 0 on `PASS` |

**There is no unit-test framework.** Playwright is the only test runner. Don't add Vitest, Jest or
another runner without asking the user first. The database is Supabase PostgreSQL; no PostgreSQL server or test database exists on this machine, so the suite uses the in-repo stand-in (a `SUPABASE_DB_URL` starting with `stand-in:`); it covers storage too (a `SUPABASE_URL` starting with `stand-in:`) and never runs the SQL or the real Storage. The owner's SIT check is the only test of the real database and the real storage.

**Only the feature's own spec runs, not the full suite.** The full suite takes too long to be a
gate. Wherever a skill says "the suite" or "the e2e suite" at completion, it means the build plus
`npx playwright test e2e/<slug>.spec.ts`; the profile overrides the skill. **E2E is not part of
CI:** `.github/workflows/pipeline.yml` stays typecheck, lint and build only. Do not add a
Playwright step.

`npm run build` writes `.next/`, and `npm run dev` shares `.next/`. Never run them at the
same time, and never run two builds at once.

**.env is off limits.** The site reads seven settings by name (`AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `ADMIN_EMAIL`, `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), set by the owner in Vercel and never committed. Do not read, print
or edit `.env*`. The test run sets its own per-run values (`playwright.config.ts` generates them); do not
set any variable yourself.

## Behavioral gate

The behavioral gate is **Playwright** (`@playwright/test`, Chromium): end-to-end tests in `e2e/`, run
against the built site served by `next start` on `http://localhost:3100`, with a per-run `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `ADMIN_EMAIL` generated by `playwright.config.ts`. Google is
replaced by a stand-in at the browser boundary; there is no emulator and no Java. The database is replaced by a stand-in file whose path `playwright.config.ts` generates per run. File storage is replaced by a stand-in directory whose path `playwright.config.ts` generates per run; the browser's calls to the stand-in storage host are answered by the tests, and a fake storage server in the test process exercises the real `fetch` code. **`.next/` must be
current**: run `npm run build` first. It covers what the compiler and linter cannot: hydration and
console errors, rendered content, routing and trailing-slash URLs, sign-in and the panel screens, theme
toggle and FOUC, scroll-spy, the mobile drawer, layout at set viewports.

**Test file conventions:**

- One spec file per feature: `e2e/<slug>.spec.ts`, the slug being the feature folder name.
  `e2e/site-smoke.spec.ts` is the baseline (landing page, blog index and post, RSS and sitemap).
- One test per `E2E-` row, its title starting with the id: `E2E-03: <what it checks>`. The
  single-test command above then runs exactly that check.
- Use relative paths with `baseURL`; never a hard-coded origin. Paths come from the route table in
  `CLAUDE.md`.
- Locate by role, label or text; use web-first assertions; never a fixed sleep. Check theme
  behaviour through the `data-theme` attribute and the tokens, not raw colour values.
- Each test starts from a fresh browser context and does not depend on another test's state.
- Traces are off by default (`trace: "off"`); re-run a failing test with `--trace on` to debug.

**`manual` is the exception**, reserved for what no automated check can observe: what a screen
reader announces, and visual judgements that no assertion expresses. A `manual` check is run by a
human in a browser and is reported as pending until they do. Don't claim a UI or flow change works
on the strength of typecheck, lint and build alone.

**Verification methods for an `E2E-` row:** `e2e` (the norm for runtime behaviour), `compiler`
(typecheck, lint or build proves it, for example a duplicate blog slug failing the build) or
`manual`.

## Feature docs

Every feature owns one folder, `docs/features/<slug>/`. The slug is the folder name and never
changes; resolve it with `ls docs/features/<slug>`. No file name carries a date or a number.

| File | Written by | Committed |
| --- | --- | --- |
| `docs/requirements/<requirement-slug>.md` | `/help-discover-this` Mode A, `/agentic-discover` | yes |
| `docs/requirements/<slug>-intent.md` | `/agentic-intent` | yes |
| `docs/requirements/<slug>-acceptance.md` | `/agentic-accept` | yes |
| `story.md` | `/help-discover-this` Mode B, `/agentic-discover` | yes |
| `spec.md`, `impact.md` | `/spec-this` (`spec.md` §8 is the implementation plan) | yes |
| `PROGRESS.md` | `/do-this` — scratch run state | no (git-ignored) |
| `log.md` | `/do-this` | yes |
| `.run-logs/<slug>/` (step packets, gate output, review reports, failed-attempt reports, `stop.md`) | `scripts/step-packet.sh`, `/do-this`, `/spec-this`, `/agentic-run` | no (git-ignored) |

`requirement/` (singular) and `spec/` (singular) are the older `/user-story-creator` output folders
and stay as they are. The pipeline never reads or writes them.

- **Standing context:** `docs/features/OVERVIEW.md` §1–3 only. Section 4 is only an index.
- **Orientation map:** `CLAUDE.md` (invariants, commands, routes, conventions), with `Reference.md`
  for the component tree, token catalog and extension points on demand.
- **Design system:** the CSS custom properties in `src/app/globals.css` (`--background`,
  `--foreground`, `--surface`, `--accent-blue`, `--accent-rose`, `--border`, `--shadow-*`), described
  in `Reference.md`. Read it before specifying or touching UI. It never overrides a story's
  functional scenarios. New UI design direction goes through `design-taste-frontend`; reworking
  existing UI goes through `redesign-existing-projects`.
- **Domain entry point:** the story's `domain:` line, if any. Otherwise start discovery from
  `CLAUDE.md` § Invariants, `src/lib/site.ts`, `src/lib/blog/types.ts` and `content/blog/`.
- **Verification vocabulary:** an `E2E-` check is `compiler`, `e2e` or `manual` (see § Behavioral
  gate). `e2e` is the norm for runtime behaviour; its test lives in the feature's spec file.
- Another feature is read only through its `spec.md`; never open another feature's `story.md`.

## Layers

Used for a task's `[Layer]` tag in `/do-this` (a label and context; the tier comes from § Gate risk
tiers, not from the layer).

| Layer | Covers |
| --- | --- |
| `data` | `content/blog/*.md`, `src/lib/blog/posts.ts`, `src/lib/blog/types.ts`, experience, project and certification data held in the components |
| `domain` | `src/lib/site.ts`, `src/lib/blog/markdown.ts`, `src/lib/blog/rss.ts`, `src/lib/blog/index.ts`, `formatDate()` |
| `route` | `src/app/**/page.tsx`, `layout.tsx`, `src/app/rss.xml/route.ts`, `sitemap.ts`, `robots.ts`, `next.config.ts`, `vercel.json`, `.github/workflows/` |
| `ui` | `src/app/components/**`, `src/app/globals.css` (tokens), `ThemeProvider.tsx` |
| `e2e` | `e2e/**`, `playwright.config.ts` |
| `tooling` | `scripts/**`, `.claude/**` |

## Model roles and escalation

The chat session is the only orchestrator. A subagent cannot spawn a subagent, so every worker is a
leaf dispatched from that session, and each is handed paths (the story, the step packet, a findings
file), never pasted spec text. The orchestrator does not read the story, the spec or a packet. Each
worker's brief is its agent definition in `.claude/agents/`; every worker is Sonnet (§ Models).

| Role | Agent | Does | Never |
| --- | --- | --- | --- |
| Orchestrator (the chat session) | — | Runs the scripts, dispatches workers, commits, writes state; asks the user only at a stop condition | Writes production code or tests; reads the spec or a diff |
| Spec writer | `pipeline-spec-writer` | Writes `spec.md` and `impact.md` from the story path; applies review findings from report paths; decides open questions itself and records them `[auto]`; revises the spec when a task is blocked on it | Rules against the story; commits |
| Spec reviewers | `spec-codebase-verifier`, `spec-cold-reader` | The independent review of a spec, one round (`spec-traceability` joins only under `/enhance-this-spec`) | Edit files |
| Test author | `pipeline-test-author` | Writes the failing tests for a Step's `E2E-` rows before any implementation | Writes production code |
| Implementer | `pipeline-implementer` | Makes the locked tests pass to the Step's contract, making and reporting its own implementation choices; in fix mode, fixes named findings | Edits a test, makes a product decision, runs the mechanical gate, commits |
| Risk reviewer | `pipeline-risk-reviewer` | The one independent review of a high-tier task's diff, before it is committed (`/do-this` Step 5) | Edit files; re-run typecheck, lint or the tests |
| Feature reviewer | `pipeline-feature-reviewer` | Reviews the whole feature once, after the last task, the build and the feature's own spec. The only LLM review of the low-tier tasks, and the one worker that reads the whole spec | Edit files |

**Escalation chain for one task.** Attempt 1 → (on failure, a second mechanical-gate fail in the same
attempt, or a risk review still failing after one fix) attempt 2, a fresh implementer given the
failed attempt's report → stop and ask the user. The attempt count is the number of
`.run-logs/<slug>/attempt-<N>-*.md` files, so it survives a restarted session.

**A blocked task is not a failed attempt and not a question for the user.** When a worker reports
`BLOCKED` or a Stop-if condition, `/do-this` hands the question to the spec writer, which decides it
(`[auto]`), amends the Step, and the task starts again from a fresh packet. At most two such
auto-revisions per feature; after that, or when the writer itself is blocked, the run stops.

**The pipeline is meant to run without the user.** The only stops are: a story that cannot be
specified without a new dependency, a secret, or a ruling on content or hosting; a task that failed
twice; auto-revisions exhausted; the Completion run or the feature review failing twice.

## Phases

Section 8 of a full spec groups its Steps into phases (`## Phase A — <name>`, each with a
**Delivers** line listing the `TS-` and `E2E-` ids it completes). A phase ends where something
coherent works: data and domain; then routes; then screens. A thin spec is one phase. Phases order
the work; they are not review points. The one review of the whole feature runs at Completion.

## Known-dirty paths

`/do-this` may ignore these and must never stage them:

- `AGENTS.md` — rewritten by `next dev` if it ever appears; never stage it.
- `next-env.d.ts` — generated by Next, already git-ignored.

## Gate risk tiers

Four checks stand between a Step and the pull request, and no more:

| Check | When | By |
| --- | --- | --- |
| Locked tests | every task with `E2E-` rows | a test author, before the code exists |
| Mechanical gate (`npm run check:task`) | every task | a script |
| Risk review | a high-tier task only, before its commit | `pipeline-risk-reviewer` |
| Feature review | once per feature, at Completion | `pipeline-feature-reviewer` |

The tier is computed by the gate script, never judged.

**High tier** when either holds:

- The Step's `Risk:` line says `high`. `/spec-this` sets it when the Step touches `src/lib/**`, the
  build or deploy config, a route handler or metadata route, the root layout, or the server/client
  boundary of the blog barrel (the invariants in `CLAUDE.md`).
- An escalation trigger fired: a file outside the Step's manifest; more than about 150 changed
  non-test lines; the implementer reported a deviation; this is attempt 2; a test passed before the
  change; the script printed a warning the orchestrator could not clear. The script sees the first
  two itself; the orchestrator passes the others with `--escalate <reasons>` (comma-separated).

**Low tier** — everything else: presentation-only changes in `src/app/components/**`, token and
style changes in `globals.css`, blog content in `content/blog/*.md`, docs, and spec-only test
changes under `e2e/`. Nothing reviews the task on its own: the mechanical gate passes it and the
feature review reads its diff.

A diff that touches a sensitive path (`src/lib/**`, `src/app/layout.tsx`, `src/app/blog/**`, the
metadata and RSS routes, `scripts/**`, `package.json`, `next.config.ts`, `vercel.json`,
`playwright.config.ts`, `.github/**`, `.claude/settings.json`) is named on the script's
`TIER-REASONS` line as a note. It does not raise the tier by itself: the spec's `Risk:` line does.

### When to add a check back

Review yield is logged in a fixed shape (`Findings:` in each task entry and in the Completion entry of
`log.md`), so this is decided on data, not on worry.

1. A defect a script check should have caught: fix the script.
2. A defect in an unreviewed low-tier task that reaches the pull request or the live site:
   `/spec-this` should have marked that kind of Step `high`. Add the kind to the rule above.
3. Two such defects within three consecutive features: turn the path note back into a tier rule (in
   `scripts/check-task.sh`) for the next two features, then re-evaluate.

**Calibration.** `/thermos` on a finished branch is the independent measure of what these checks let
through. Run it when you want that measure; it is not part of the pipeline.
