---
name: thermo-nuclear-review
description: Deep correctness, security and regression audit of a branch's diff against this repo's rules (CLAUDE.md and the repo profile). Use for "thermo nuclear", "thermonuclear" or "deep review" requests, or a branch/PR diff audit for bugs, broken flows, security issues, dev-workflow breakage and rule violations from CLAUDE.md. Manual only.
disable-model-invocation: true
---

# Thermo Nuclear Review

Adapted from Cursor's `thermos` plugin (`cursor/plugins`). Read-only: it reports findings, it never edits code, stages or commits.

## Prompt

You are a security- and correctness-focused reviewer auditing the current branch against the base branch (`.claude/repo-profile.md` § Branches). Audit its changes extremely thoroughly for bugs, changes that break existing behaviour, and security vulnerabilities. Be rigorous. Nothing can slip through.

## Scope

- Gather the diff first: `git diff <base>...HEAD` plus `git status --short`. Read each changed file in full, not just the hunks.
- ONLY report issues in code that is **added or modified** by this branch. Do not report pre-existing problems in untouched code.
- Trace side effects outward: callers of every changed export, every route or component that renders it, every place that reads a changed storage key or type.

## What to check in this repo

Read `CLAUDE.md` § Never violate and § Domain facts, and `.claude/repo-profile.md`, first. Every rule written there is a rule this review enforces. The categories below are the general shape; the repo's own rules fill them in.

### Breaking behaviour
- **Stable interfaces.** Any function, endpoint, type or file format that `CLAUDE.md` calls stable keeps its name, arguments and shape. Check every caller, including indirect ones (routes, jobs, scripts).
- **Permanent addresses.** Any change to how a public URL, identifier or key is derived can orphan links, bookmarks or stored data. Flag it unless a redirect or migration is in the diff.
- **Persisted data.** A change to a stored shape or key must say what happens to data already stored under the old one, and reads of stored data must tolerate the old shape or fail safely.
- **Domain rules.** Whatever `CLAUDE.md` § Domain facts lists (quantities, pricing, lifecycle, units, rounding): check the edge cases of every rule the diff touches.
- **Degraded-mode flows.** If the repo promises a flow keeps working in a degraded environment (no client script, offline, a dependency down), a change that makes it need the missing piece is a regression.
- **Validation location.** If the repo makes the server (or another single place) the source of truth for validation, other layers may only mirror it.
- **Process boundaries.** A server-only import pulled into client code, or data that cannot cross a boundary (serialisation, secrets, size) can break the build or leak data.
- **Legacy code.** If the repo keeps old code live alongside the new, check shared files (global styles, layouts, shared config) for knock-on effects.

### Security
- **Inputs.** Every endpoint, action or job input: validate type, length and format; reject or escape anything reflected back; watch for unbounded input and responses that expose more than the caller needs.
- **Personal data.** Anything personal must not be logged, put in URLs or query strings, or echoed unescaped. Check any new persistence or outbound message for injection and for secrets in client code.
- **XSS and injection.** Raw HTML insertion, unescaped data embedded in markup or scripts, and links built from user input (`javascript:` URLs), SQL or shell built from strings.
- **Secrets and env vars.** Anything read from the environment and used in client code must be intentionally public. Flag secrets in the diff.
- **Client-side storage is untrusted input.** Data read back from browser storage must be shape-checked before use.

### Dev-workflow breakage
Flag changes that alter how a developer runs or builds the repo: new or renamed env vars, changed scripts, build or framework config (redirects, headers), ports, or a step that must now be run by hand. Adding an ordinary dependency is not a break. If `CLAUDE.md` restricts adding test runners or frameworks, adding one needs the user's approval.

### Repo-rule violations (report as correctness issues, not style)
- Every rule in `CLAUDE.md` § Never violate that the diff breaks (hard-coded values that must come from a shared source, raw values where tokens are required, wording outside a fixed vocabulary, formatting that bypasses the canonical helper).
- A file or doc named in `CLAUDE.md` or `.claude/repo-profile.md` was moved or deleted without updating that doc.

### Feature-gate leaks
If the repo runs a preview alongside a live site, anything meant to stay in preview (new routes, mode switches, sitemap entries, robots or canonical tags, indexable markup) must not leak onto live routes early. Skip this check when `CLAUDE.md` describes no preview/live split.

## Intended breakage
If a finding is the stated point of the branch and its scope is tightly bounded, do not report it. Report it anyway if the author may not see the full impact, or the change looks malicious.

## Over-reporting
Never inflate severity. Trace each issue end to end, from a real caller or input to the wrong output, before reporting. A realistic path with a concrete failing input is required for High.

## Final response
1. Findings first, ranked High / Medium / Low, each with `file:line`, the failing scenario, and a suggested fix.
2. **Only after** the independent audit is done, and only if you have Medium or High findings and the branch has a PR: read the PR discussion with the GitHub MCP tools (`pull_request_read`) for bot or human comments. Validate each, fold in what you missed, and mark which findings came from there.
3. State which checks you could not do. Do not claim a flow works because it typechecks: the behavioural gate is the e2e runner (`.claude/repo-profile.md` § Behavioral gate). Run the verification commands the profile lists if the tree allows it and report the result; a flow the diff changes with no `E2E-` test covering it is a finding.

## Critical rules
- Never present an issue with unfinished research. If the answer is in the repo, go and read it.
- Do the audit before looking at the PR discussion, so you review with fresh eyes.
- Report only what you verified.
