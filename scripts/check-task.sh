#!/usr/bin/env bash
# Mechanical gate for one task of a feature plan. The /do-this orchestrator runs it once the implementer has
# returned; a reviewer never sees a diff that fails it.
#
# usage:
#   npm run check:task -- <slug> <step> [--escalate <reason>[,<reason>...]]
#   (or: bash scripts/check-task.sh <slug> <step> ...)
#
# <step> is the number of a "### Step N" block in docs/features/<slug>/spec.md Section 8. The diff under
# check is the whole working tree against HEAD: staged and unstaged changes plus untracked files.
#
# Hard failures (any one makes MECH: FAIL and the exit status 1):
#   typecheck, lint (`npm run lint:new`: any error except the known ThemeProvider.tsx baseline), build, and the
#   Step's own single-test Playwright commands.
#     They run cheapest first and each later group only when every earlier run passed: a failing
#     typecheck or lint skips the build and the single-test commands (printed as SKIP RUN);
#     a failing build skips the single-test commands. A single-test command that still
#     starts with `npm run build && ` (older specs) runs without it: the build just made is current.
#     Every run goes through `npm run verify`: its whole output is kept in .run-logs/<slug>/run-<n>.log and a
#     failing run prints only its digest (counts, and per failure the file:line, title and first error lines).
#   changed paths outside the Step's Files manifest (plus package-lock.json when package.json is listed,
#     the feature's spec.md/impact.md, and CLAUDE.md, Reference.md and the profile, which are only
#     warned about because the orchestrator edits them)
#   a staged (locked) test file edited afterwards
#   a silenced check in added code lines (@ts-ignore, @ts-expect-error, @ts-nocheck, eslint-disable,
#     .skip( .only( .fixme( xit( xdescribe()
#   an E2E- id the Step names with no test titled `E2E-NN:` in its test files, or an added test title
#     carrying an id the Step does not name
#   a forbidden import, a dependency change the Step does not name, an .env* file or a staged AGENTS.md,
#     a raw colour in src/app/** (outside globals.css), a Tailwind `dark:` variant, an import of the blog
#     barrel (@/lib/blog) from a "use client" file, a `"use server"` or API route (static export)
# Warnings (each must be cleared or answered in the log; an uncleared one makes the task high tier):
#   caught error passed to console.*, arbitrary Tailwind size in added lines, new component not named
#   in Reference.md, new page/route/top-level module with no CLAUDE.md change, CLAUDE.md /
#   Reference.md / profile changed, a local date format in a component (use formatDate()),
#   test-run output containing "unstable value", "Warning:" or an unhandled error, manifest file not
#   touched
#
# The last three lines of output are always:
#   MECH: PASS|FAIL
#   TIER: high|low
#   ESCALATE: <comma-separated reasons or none>
# TIER is high when the Step's Risk line says high or ESCALATE is not none. A diff that touches a
# sensitive path (auth, db, actions, ...) is named on the TIER-REASONS line for the feature review but
# does not raise the tier. The warnings are printed above those lines, not folded into them.
#
# --escalate / env:
#   --escalate LIST  comma-separated escalation triggers the orchestrator observed and the script cannot
#                    (e.g. "implementer-deviation,attempt-2"); they are appended to ESCALATE.
#                    The CHECK_ESCALATE environment variable is the same thing; the argument exists
#                    so the gate is a single `npm` command with no environment to set
#   CHECK_SKIP_RUN=1 TEST FIXTURES ONLY. Skips typecheck, lint, build and the Step's single-test
#                    commands, so the grep, manifest and tier logic can run without node_modules. A run with it set proves nothing about the code. It
#                    prints a NOTE line, and /do-this must never set it.

set -uo pipefail

slug="${1:-}"
step="${2:-}"
extra_escalate="${CHECK_ESCALATE:-}"
shift 2 2> /dev/null || true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --escalate) extra_escalate="${extra_escalate:+$extra_escalate,}${2:-}"; shift 2 2> /dev/null || shift ;;
    --escalate=*) extra_escalate="${extra_escalate:+$extra_escalate,}${1#--escalate=}"; shift ;;
    *) shift ;;
  esac
done

final() { # MECH reason-line... — print the closing three lines and exit
  echo "MECH: $1"; echo "TIER: $2"; echo "ESCALATE: $3"
  [ "$1" = PASS ] && exit 0
  exit 1
}

if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || [[ ! "$step" =~ ^[0-9]+$ ]]; then
  echo "usage: check-task.sh <feature-slug> <step-number>" >&2
  final FAIL high "usage-error"
fi

cd "$(git rev-parse --show-toplevel)" || final FAIL high "not-a-git-repo"
spec="docs/features/$slug/spec.md"
[ -f "$spec" ] || { echo "no $spec"; final FAIL high "spec-missing"; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fails=0
warns=0
pass() { echo "PASS $1 $2"; }
fail() { echo "FAIL $1 $2"; fails=$((fails + 1)); }
warn() { echo "WARN $1 $2"; warns=$((warns + 1)); }
skip() { echo "SKIP $1 $2"; }

is_test() { [[ "$1" =~ (^|/)tests/ ]] || [[ "$1" =~ \.(test|spec)\.[cm]?[jt]sx?$ ]]; }
is_code() { [[ "$1" =~ \.(ts|tsx|js|jsx|mjs|cjs)$ ]]; }

# ---- the Step block ---------------------------------------------------------------------------
awk '
  /^## 8[. ]/ { on = 1; next }
  on && /^## / && !/^## Phase/ { exit }
  on { print }
' "$spec" | awk -v want="$step" '
  BEGIN { field = ""; inside = 0 }
  /^## Phase/ { inside = 0 }
  /^### Step [0-9]+/ {
    match($0, /[0-9]+/); n = substr($0, RSTART, RLENGTH) + 0
    inside = (n == want + 0); field = "head"
    if (inside) printf "%s\t%s\n", field, $0
    next
  }
  inside {
    if ($0 ~ /^- \*\*[^*:]+:\*\*/) {
      f = $0; sub(/^- \*\*/, "", f); sub(/:\*\*.*/, "", f); f = tolower(f); gsub(/ /, "-", f); field = f
    }
    printf "%s\t%s\n", field, $0
  }
' > "$tmp/step.tsv"
[ -s "$tmp/step.tsv" ] || { echo "no '### Step $step' in $spec Section 8"; final FAIL high "step-missing"; }

field_of() { awk -F'\t' -v f="$1" '$1 == f { sub(/^[^\t]*\t/, ""); print }' "$tmp/step.tsv"; }

files_of() { # "verb<TAB>path" lines of the Files manifest
  field_of files | grep -E '^[[:space:]]+-[[:space:]]+(add|change|delete|remove)[[:space:]]' \
    | sed -E 's/^[[:space:]]+-[[:space:]]+(add|change|delete|remove)[[:space:]]+`?([^` ]+)`?.*/\1\t\2/'
}

# every E2E- id in the text on stdin: plain, ranges ("E2E-01 to E2E-06") and "E2E-0[1-7]"
expand_ids() {
  awk '
    function emit(a, b,    w, i, t) {
      w = length(a); a += 0; b += 0
      for (i = a; i <= b; i++) { t = i ""; while (length(t) < w) t = "0" t; print "E2E-" t }
    }
    {
      s = $0
      while (match(s, /E2E-[0-9]+[^A-Za-z0-9]*(to|–|—)[^A-Za-z0-9]*E2E-[0-9]+/)) {
        r = substr(s, RSTART, RLENGTH); s = substr(s, 1, RSTART - 1) " " substr(s, RSTART + RLENGTH)
        first = r; sub(/^E2E-/, "", first); sub(/[^0-9].*/, "", first)
        last = r; sub(/.*E2E-/, "", last)
        emit(first, last)
      }
      while (match(s, /E2E-[0-9]*\[[0-9]-[0-9]\]/)) {
        r = substr(s, RSTART, RLENGTH); s = substr(s, 1, RSTART - 1) " " substr(s, RSTART + RLENGTH)
        pre = r; sub(/\[.*/, "", pre); sub(/^E2E-/, "", pre)
        lo = r; sub(/^[^\[]*\[/, "", lo); hi = lo; sub(/-.*/, "", lo); sub(/^[0-9]-/, "", hi); sub(/\].*/, "", hi)
        for (d = lo + 0; d <= hi + 0; d++) print "E2E-" pre d
      }
      while (match(s, /E2E-[0-9]+/)) {
        print substr(s, RSTART, RLENGTH); s = substr(s, 1, RSTART - 1) " " substr(s, RSTART + RLENGTH)
      }
    }
  ' | sort -u
}

# the text through which the Step writes tests: test-file lines under Files, and Change bullets that
# start with a test-file path
writer_text() {
  field_of files | grep -E '^[[:space:]]+-[[:space:]]+(add|change)[[:space:]]+`[^`]*(tests/|\.(test|spec)\.[cm]?[jt]sx?`)'
  field_of change | awk '
    function flush() { if (grp != "" && ok) print grp; grp = ""; ok = 0 }
    /^  - / {
      flush(); grp = $0
      p = $0; if (match(p, /`[^`]+`/)) { p = substr(p, RSTART + 1, RLENGTH - 2)
        if (p ~ /(^|\/)tests\// || p ~ /\.(test|spec)\.[cm]?[jt]sx?$/) ok = 1 }
      next
    }
    { grp = grp "\n" $0 }
    END { flush() }
  '
}

manifest=()
manifest_tests=()
while IFS=$'\t' read -r verb path; do
  [ -n "$path" ] || continue
  manifest+=("$path")
  if [ "$verb" = add ] || [ "$verb" = change ]; then is_test "$path" && manifest_tests+=("$path"); fi
done < <(files_of)
[ "${#manifest[@]}" -gt 0 ] || { echo "Step $step lists no files under Files"; final FAIL high "no-manifest"; }

risk_line="$(field_of risk | head -n1 | sed -E 's/^- \*\*Risk:\*\*[[:space:]]*//')"
risk="$(echo "$risk_line" | tr 'A-Z' 'a-z' | grep -oE '^(high|low)' || true)"
echo "CHECK-TASK $slug Step $step: manifest ${#manifest[@]} file(s), Risk: ${risk:-none (no Risk line)}"

# ---- the diff ---------------------------------------------------------------------------------
# changed paths and which of them are new
changed=()
new_files=()
staged_agents=0
while IFS= read -r -d '' rec; do
  xy="${rec:0:2}"; path="${rec:3}"
  if [[ "$xy" == R* || "$xy" == C* ]]; then IFS= read -r -d '' _old; fi
  [[ "$path" == .run-logs/* ]] && continue
  if [ "$path" = AGENTS.md ]; then
    [[ "${xy:0:1}" =~ [MADRC] ]] && staged_agents=1
    continue # known-dirty path (next dev rewrites it); only a staged one is a failure
  fi
  changed+=("$path")
  if [[ "$xy" == "??" || "${xy:0:1}" == A ]]; then new_files+=("$path"); fi
done < <(git status --porcelain -z -uall)

if [ "${#changed[@]}" -eq 0 ]; then
  fail DIFF "the working tree has no changes against HEAD"
fi

in_changed() { local p; for p in "${changed[@]}"; do [ "$p" = "$1" ] && return 0; done; return 1; }

# added lines: "path<TAB>text" for tracked changes (git diff HEAD) and whole untracked files
{
  git diff HEAD -U0 --no-color --no-ext-diff 2>/dev/null | awk '
    /^\+\+\+ / { f = substr($0, 7); if ($0 ~ /^\+\+\+ \/dev\/null/) f = ""; next }
    /^\+/ && f != "" { printf "%s\t%s\n", f, substr($0, 2) }
  '
  git ls-files --others --exclude-standard -z 2>/dev/null | while IFS= read -r -d '' u; do
    [[ "$u" == .run-logs/* ]] && continue
    grep -I -H -n '' -- "$u" 2>/dev/null | awk -v f="$u" '{ sub(/^[^:]*:[0-9]+:/, ""); printf "%s\t%s\n", f, $0 }'
  done
} > "$tmp/added.tsv"

added_in() { # <regex-for-path-filter> — added lines of paths matching it
  awk -F'\t' -v re="$1" '$1 ~ re { print }' "$tmp/added.tsv"
}

# ---- run the project's own checks -------------------------------------------------------------
run_cmd() { # label, command — runs it through `npm run verify`, prints PASS/FAIL and, on FAIL, the run's digest
  local label="$1" cmd="$2" log raw
  runs=$((runs + 1)); log="$tmp/run-$runs.log"; raw=".run-logs/$slug/run-$runs.log"
  # The whole output goes to $raw (read it for one failure's detail); the digest (at most 90 lines) is what is shown.
  if VERIFY_COMMAND="$cmd" VERIFY_LOG="$raw" npm run -s verify > "$log" 2>&1; then
    pass RUN "$label"
  else
    fail RUN "$label (exit $?)"
    sed 's/^/    | /' "$log"
  fi
  cat "$raw" >> "$tmp/run-all.log" 2> /dev/null
}
: > "$tmp/run-all.log"
runs=0

# the Step's own single-test commands, from backticked spans of its Verify lines
grep -oE '`[^`]+`' <<< "$(field_of verify)" | sed -E 's/^`//; s/`$//' \
  | grep -E '^(npx playwright|npm run build && npx playwright)' | awk '!seen[$0]++' > "$tmp/single.txt"

if [ "${CHECK_SKIP_RUN:-0}" = 1 ]; then
  echo "NOTE CHECK_SKIP_RUN=1: typecheck, lint, build and the Step's single-test commands were NOT run. Test fixtures only; /do-this must never set this."
  skip RUN "typecheck, lint, build, $(grep -c . "$tmp/single.txt") single-test command(s)"
else
  # Cheapest first, and each later group runs only when every run before it passed: the build
  # and the browser runs are the expensive part, and the task fails on a type error whatever they would say.
  single_count="$(grep -c . "$tmp/single.txt" || true)"
  fails_before_runs=$fails
  run_cmd "npm run typecheck" "npm run typecheck"
  run_cmd "npm run lint:new" "npm run lint:new"
  if [ "$fails" -gt "$fails_before_runs" ]; then
    skip RUN "npm run build and $single_count single-test command(s): a static check above failed"
  else
    run_cmd "npm run build" "npm run build"
    if [ "$fails" -gt "$fails_before_runs" ]; then
      skip RUN "$single_count single-test command(s): the build above failed"
    else
      while IFS= read -r c; do
        [ -n "$c" ] || continue
        # The build above is current, so a browser command runs without the `npm run build &&` that older specs
        # still carry in front of it (the rebuild would be identical).
        run_cmd "$c" "${c#npm run build && }"
      done < "$tmp/single.txt"
    fi
  fi
  # Noise the tooling itself prints on every run is not a finding: Playwright's NO_COLOR notice, and the
  # Node deprecation notices http-server (the test web server) emits.
  grep -vE 'NO_COLOR|DeprecationWarning|--trace-deprecation' "$tmp/run-all.log" > "$tmp/run-signal.log" 2> /dev/null || true
  if grep -qE 'unstable value|Warning:|[Uu]nhandled (error|rejection|exception)' "$tmp/run-signal.log"; then
    warn LOG "test/build output contains 'unstable value', 'Warning:' or an unhandled error: $(grep -E -m3 'unstable value|Warning:|[Uu]nhandled' "$tmp/run-signal.log" | cut -c1-100 | tr '\n' '|')"
  fi
fi

# ---- changed paths are inside the manifest ----------------------------------------------------
in_manifest() {
  local p="$1" m
  for m in "${manifest[@]}"; do
    [ "$p" = "$m" ] && return 0
    [[ "$m" == */ && "$p" == "$m"* ]] && return 0
    [[ "$m" == *'*'* && "$p" == $m ]] && return 0
  done
  return 1
}
manifest_has() { local m; for m in "${manifest[@]}"; do [ "$m" = "$1" ] && return 0; done; return 1; }
outside=()
doc_edits=()
for p in "${changed[@]}"; do
  if in_manifest "$p"; then continue; fi
  case "$p" in
    package-lock.json) manifest_has package.json && continue ;;
    "docs/features/$slug/spec.md"|"docs/features/$slug/impact.md") continue ;;
    CLAUDE.md|Reference.md|.claude/repo-profile.md) doc_edits+=("$p"); continue ;;
  esac
  outside+=("$p")
done
if [ "${#outside[@]}" -gt 0 ]; then
  fail MANIFEST "changed outside the Step's Files: ${outside[*]}"
else
  pass MANIFEST "every changed path is in the Step's Files"
fi
for p in "${doc_edits[@]}"; do
  warn DOCS "$p changed: confirm it is the orchestrator's doc update (do-this Step 4), not the implementer's"
done
for m in "${manifest[@]}"; do
  [[ "$m" == */ || "$m" == *'*'* ]] && continue
  in_changed "$m" || warn MANIFEST "Files lists $m but it was not touched (incomplete Step?)"
done

# ---- locked tests -----------------------------------------------------------------------------
locked_bad=0
while IFS= read -r f; do
  [ -n "$f" ] && is_test "$f" || continue
  if ! git diff --quiet -- "$f"; then fail LOCKED "$f was staged as a locked test and has been edited since"; locked_bad=1; fi
done < <(git diff --cached --name-only 2>/dev/null)
[ "$locked_bad" -eq 0 ] && pass LOCKED "no staged test file edited after staging"

# ---- silenced checks --------------------------------------------------------------------------
silenced="$(added_in '\\.(ts|tsx|js|jsx|mjs|cjs)$' | grep -E '@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|\.skip\(|\.only\(|\.fixme\(|(^|[^A-Za-z0-9_])xit\(|(^|[^A-Za-z0-9_])xdescribe\(' || true)"
if [ -n "$silenced" ]; then
  while IFS= read -r l; do fail SILENCED "added line in ${l%%$'\t'*}: $(echo "${l#*$'\t'}" | sed 's/^[[:space:]]*//' | cut -c1-100)"; done <<< "$silenced"
else
  pass SILENCED "no silenced check in added code lines"
fi

# ---- E2E ids ----------------------------------------------------------------------------------
if [ "${#manifest_tests[@]}" -eq 0 ]; then
  skip E2E "the Step lists no test file"
else
  writer_text | expand_ids > "$tmp/named.txt"
  e2e_bad=0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    found=0
    for t in "${manifest_tests[@]}"; do
      [ -f "$t" ] && grep -qE "[\"'\`]$id:" "$t" && found=1
    done
    if [ "$found" -eq 0 ]; then fail E2E "$id is named by the Step but no test titled '$id:' is in ${manifest_tests[*]}"; e2e_bad=1; fi
  done < "$tmp/named.txt"
  for t in "${manifest_tests[@]}"; do
    while IFS= read -r l; do
      [ -n "$l" ] || continue
      for id in $(echo "${l#*$'\t'}" | grep -oE "[\"'\`]E2E-[0-9]+:" | grep -oE 'E2E-[0-9]+'); do
        grep -qx "$id" "$tmp/named.txt" || { fail E2E "added title in $t carries $id, which the Step does not name"; e2e_bad=1; }
      done
    done < <(awk -F'\t' -v f="$t" '$1 == f' "$tmp/added.tsv")
  done
  [ "$e2e_bad" -eq 0 ] && pass E2E "$(grep -c . "$tmp/named.txt") named id(s) have a titled test; no added title carries an unnamed id"
fi

# ---- forbidden imports ------------------------------------------------------------------------
forbidden='["'"'"'](@supabase/[^"'"'"']*|clsx|tailwind-merge|class-variance-authority|date-fns|dayjs|moment|luxon|prisma|@prisma/client|kysely|typeorm|next-auth|jest|vitest|cypress)["'"'"']'
fi_hits="$(added_in '\\.(ts|tsx|js|jsx|mjs|cjs)$' | grep -E "(from|import|require)[^\"']*(\\(|[[:space:]])?$forbidden" || true)"
if [ -n "$fi_hits" ]; then
  while IFS= read -r l; do fail IMPORTS "forbidden import in ${l%%$'\t'*}: $(echo "${l#*$'\t'}" | sed 's/^[[:space:]]*//' | cut -c1-100)"; done <<< "$fi_hits"
else
  pass IMPORTS "no forbidden import in added lines"
fi

# ---- dependencies -----------------------------------------------------------------------------
dep_lines() {
  awk '
    /"(dependencies|devDependencies|peerDependencies|optionalDependencies)"[[:space:]]*:[[:space:]]*\{/ { on = 1; next }
    on && /\}/ { on = 0 }
    on { gsub(/^[ \t]+/, ""); print }
  ' | sort
}
if git cat-file -e HEAD:package.json 2>/dev/null && [ -f package.json ]; then
  git show HEAD:package.json | dep_lines > "$tmp/deps.head"
  dep_lines < package.json > "$tmp/deps.now"
  if ! diff -q "$tmp/deps.head" "$tmp/deps.now" > /dev/null; then
    if manifest_has package.json; then
      pass DEPS "dependencies changed and the Step lists package.json"
    else
      fail DEPS "package.json dependencies changed but the Step does not list package.json"
    fi
  else
    pass DEPS "no dependency change"
  fi
else
  skip DEPS "no package.json at HEAD"
fi

# ---- protected paths --------------------------------------------------------------------------
prot_bad=0
for p in "${changed[@]}"; do
  base="${p##*/}"
  if [[ "$base" == .env* && "$base" != .env.example ]]; then fail PROTECTED "$p is in the diff (.env files are off limits)"; prot_bad=1; fi
done
if [ "$staged_agents" -eq 1 ]; then fail PROTECTED "AGENTS.md is staged (next dev rewrites it; never stage it)"; prot_bad=1; fi
[ "$prot_bad" -eq 0 ] && pass PROTECTED "no .env* or staged AGENTS.md in the diff"

# ---- raw colours ------------------------------------------------------------------------------
colours="$(added_in '^src/app/' | awk -F'\t' '$1 != "src/app/globals.css"' | grep -E '(^|[^A-Za-z0-9_&-])#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})($|[^A-Za-z0-9_-])|(^|[^A-Za-z0-9_])(rgb|rgba|hsl|hsla|oklch)\(' || true)"
if [ -n "$colours" ]; then
  while IFS= read -r l; do fail COLOUR "raw colour in ${l%%$'\t'*}: $(echo "${l#*$'\t'}" | sed 's/^[[:space:]]*//' | cut -c1-100)"; done <<< "$colours"
else
  pass COLOUR "no raw colour in added lines of src/app/** (globals.css is where tokens are defined)"
fi

# ---- static export, theming and the blog barrel ----------------------------------------------
us_bad=0
while IFS= read -r l; do
  [ -n "$l" ] || continue
  fail STATIC "\"use server\" in ${l%%$'\t'*}: the site is a static export, there is no server"; us_bad=1
done < <(added_in '\.(ts|tsx|js|jsx|mjs|cjs)$' | grep -E $'\t'"[[:space:]]*[\"']use server[\"']" || true)
for p in "${new_files[@]}"; do
  case "$p" in
    src/app/api/*|src/middleware.ts|src/proxy.ts|middleware.ts|proxy.ts) fail STATIC "new $p: no API routes or middleware in a static export"; us_bad=1 ;;
  esac
done
[ "$us_bad" -eq 0 ] && pass STATIC "no server action, API route or middleware added"

dark="$(added_in '^src/' | grep -E '(^|[^A-Za-z0-9_-])dark:[a-z]' || true)"
if [ -n "$dark" ]; then
  while IFS= read -r l; do fail THEME "Tailwind dark: variant in ${l%%$'\t'*}: theme with the CSS tokens under [data-theme=\"dark\"]"; done <<< "$dark"
else
  pass THEME "no Tailwind dark: variant in added lines"
fi

barrel_bad=0
for p in "${changed[@]}"; do
  [ -f "$p" ] || continue
  [[ "$p" == src/* ]] || continue
  is_code "$p" || continue
  if grep -qE '^[[:space:]]*["'"'"']use client["'"'"']' "$p" && grep -qE 'from ["'"'"']@/lib/blog(/index)?["'"'"']|from ["'"'"']@/lib/blog/(posts|markdown|rss)["'"'"']' "$p"; then
    fail BARREL "$p is a client component that imports the blog barrel or a server-only blog module: import types from @/lib/blog/types only"; barrel_bad=1
  fi
done
[ "$barrel_bad" -eq 0 ] && pass BARREL "no client component imports the blog barrel"

name_bad=0
for p in "${new_files[@]}"; do
  [[ "$p" == e2e/* ]] || continue
  [[ "$p" == *.spec.ts ]] || continue
  [[ "${p##*/}" =~ ^[a-z0-9]+(-[a-z0-9]+)*\.spec\.ts$ ]] || { fail NAMING "new spec $p: e2e/<feature-slug>.spec.ts, kebab-case"; name_bad=1; }
done
[ "$name_bad" -eq 0 ] && pass NAMING "new spec files are named after their feature slug"

# ---- warnings ---------------------------------------------------------------------------------
w1="$(added_in '\\.(ts|tsx|js|jsx|mjs|cjs)$' | grep -E 'console\.(log|error|warn|info|debug)\(.*([(,][[:space:]]*(error|err|e|ex)[[:space:]]*[,)]|\b(error|err|e|ex)\.(message|stack|cause))' || true)"
if [ -n "$w1" ]; then
  while IFS= read -r l; do warn LOG-ERROR "caught error passed to console in ${l%%$'\t'*}: $(echo "${l#*$'\t'}" | sed 's/^[[:space:]]*//' | cut -c1-90)"; done <<< "$w1"
fi
w2="$(added_in '^src/app/components/' | grep -E 'toLocale(Date|Time)?String\(|new Intl\.DateTimeFormat\(' || true)"
if [ -n "$w2" ]; then
  while IFS= read -r l; do warn DATE "local date formatting in ${l%%$'\t'*}: use formatDate() from @/lib/blog/types (timeZone UTC)"; done <<< "$w2"
fi
hard="$(added_in '^src/' | grep -E 'https://thegoldenpothos\.dev' | grep -v '^src/lib/site.ts' || true)"
if [ -n "$hard" ]; then
  while IFS= read -r l; do warn ORIGIN "hard-coded site origin in ${l%%$'\t'*}: build absolute URLs with absoluteUrl()"; done <<< "$hard"
fi
w4="$(added_in '\\.(ts|tsx|css)$' | grep -E '\[[0-9.]+(px|rem|em|vh|vw|%)\]' || true)"
if [ -n "$w4" ]; then
  while IFS= read -r l; do warn TAILWIND "arbitrary size in ${l%%$'\t'*}: $(echo "${l#*$'\t'}" | grep -oE '\[[0-9.]+(px|rem|em|vh|vw|%)\]' | head -n1) (use a token from globals.css)"; done <<< "$w4"
fi
claude_changed=0; in_changed CLAUDE.md && claude_changed=1
for p in "${new_files[@]}"; do
  if [[ "$p" == src/app/components/* && "$p" == *.tsx ]]; then
    stem="${p##*/}"; stem="${stem%%.*}"
    if [ -f Reference.md ] && ! grep -qiF -- "$stem" Reference.md; then
      warn DOC-DESIGN "new component $p: its name is not in Reference.md"
    fi
  fi
  case "$p" in
    src/app/page.tsx|src/app/*/page.tsx|src/app/*/route.ts|src/app/route.ts|src/app/*/*/route.ts|src/app/*/*/page.tsx)
      [ "$claude_changed" -eq 1 ] || warn DOC-CLAUDE "new $p with no CLAUDE.md change (§ Routes)" ;;
    */*) ;;
    *.md|.*) ;;
    *) [ "$claude_changed" -eq 1 ] || warn DOC-CLAUDE "new top-level file $p with no CLAUDE.md change (§ Layout)" ;;
  esac
  if [[ "$p" =~ ^(src/lib)/([^/]+)/ ]]; then
    d="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}/"
    if [ -z "$(git ls-files -- "$d" | head -n1)" ] && [ "$claude_changed" -eq 0 ] && [ ! -e "$tmp/seen-$(echo "$d" | tr / _)" ]; then
      : > "$tmp/seen-$(echo "$d" | tr / _)"
      warn DOC-CLAUDE "new module directory $d with no CLAUDE.md change (§ Routes or Reference.md)"
    fi
  fi
done

if [ "$fails" -eq 0 ]; then mech=PASS; else mech=FAIL; fi

# ---- tier -------------------------------------------------------------------------------------
reasons=()
[ "$risk" = high ] && reasons+=("spec Risk: high")
[ -n "$risk" ] || reasons+=("no Risk line in the Step (no spec signal)")
high_paths=()
for p in "${changed[@]}"; do
  case "$p" in
    src/lib/*|src/app/layout.tsx|src/app/rss.xml/*|src/app/sitemap.ts|src/app/robots.ts|src/app/blog/*|scripts/*|package.json|next.config.ts|firebase.json|vercel.json|playwright.config.ts|.github/*|.claude/settings.json)
      high_paths+=("$p") ;;
  esac
done
tier=low
[ "$risk" = high ] && tier=high
# sensitive paths are reported for the feature review, but do not raise the tier on their own
if [ "${#high_paths[@]}" -gt 0 ]; then reasons+=("note: diff touches ${high_paths[*]}"); fi

escalate=()
[ "${#outside[@]}" -gt 0 ] && escalate+=("outside-manifest(${#outside[@]})")
# changed non-test lines: tracked (numstat) plus untracked files, minus tests, docs, lockfiles, generated SQL
nontest=0
while IFS=$'\t' read -r a d f; do
  [[ "$a" =~ ^[0-9]+$ ]] || continue
  is_test "$f" && continue
  [[ "$f" == *.md || "$f" == package-lock.json ]] && continue
  nontest=$((nontest + a + d))
done < <(git diff HEAD --numstat 2>/dev/null)
for p in "${new_files[@]}"; do
  [ -f "$p" ] || continue
  git ls-files --error-unmatch -- "$p" > /dev/null 2>&1 && continue # staged new file: already in numstat
  is_test "$p" && continue
  [[ "$p" == *.md || "$p" == package-lock.json ]] && continue
  nontest=$((nontest + $(wc -l < "$p")))
done
[ "$nontest" -gt 150 ] && escalate+=("large-diff($nontest non-test lines)")
if [ -n "$extra_escalate" ]; then
  IFS=',' read -r -a extra <<< "$extra_escalate"
  for e in "${extra[@]}"; do
    e="${e#"${e%%[![:space:]]*}"}"; e="${e%"${e##*[![:space:]]}"}"
    [ -n "$e" ] && escalate+=("$e")
  done
fi
[ "${#escalate[@]}" -gt 0 ] && tier=high
esc_txt="none"
if [ "${#escalate[@]}" -gt 0 ]; then esc_txt="$(IFS=,; echo "${escalate[*]}")"; esc_txt="${esc_txt//,/, }"; fi

echo "CHANGED ${#changed[@]} path(s), $nontest changed non-test line(s); $fails failure(s), $warns warning(s)"
[ "$warns" -gt 0 ] && echo "WARNINGS $warns: clear or answer each in the log; an uncleared warning makes the task high tier"
if [ "${#reasons[@]}" -gt 0 ]; then echo "TIER-REASONS $(IFS=';'; echo "${reasons[*]}")"; fi

final "$mech" "$tier" "$esc_txt"
