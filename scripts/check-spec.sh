#!/usr/bin/env bash
# Spec lint: the mechanical part of the /spec-this review, run before the packet is frozen.
#
# usage:
#   npm run check:spec -- <slug>        (or: bash scripts/check-spec.sh <slug>)
#
# Reads docs/features/<slug>/spec.md and checks, with no model involved:
#   S8-SHAPE  Section 8 exists and holds at least one "### Step N" block
#   TS        every TS- id of Section 2.2 is in exactly one Step's Satisfies; no Step cites an unknown TS-
#   E2E       every e2e E2E- row of Section 4 is written by exactly one Step (the id appears on a test
#             file's line under Files, or in a Change bullet that starts with a test file path); every
#             row that is not removed is run by some Verify: cited by id (ranges and "E2E-0[1-7]" are
#             expanded), or run as a whole test file, or covered by npm run test:e2e
#   PHASE     every Step sits in a "## Phase" with a **Delivers:** line; every TS- id and e2e E2E- id is
#             delivered by exactly one phase. A spec with no phase headings and no Risk line is a legacy
#             spec (one implicit phase): reported as a warning, not a failure
#   FILES     at most three non-test files per Step (tests/**, *.test.*, *.spec.* do not count)
#   WORDS     none of "choose / decide / or similar / as appropriate / TBD" in Section 8 (fails);
#             "either" is a warning (fenced code and `inline code` are not read)
#   PATHS     every `change` path exists (git ls-files, or was added by an earlier Step) and every `add`
#             path is free. Skipped once the feature has implementation commits (feat|fix|refactor|chore
#             (<slug>), or "docs(<slug>): mark implementation complete"): its paths are history.
#             CHECK_SPEC_FORCE_PATHS=1 runs it anyway
#   STEP      every Step has a Risk line (high or low), a Verify and a Stop-if
#
# Output: one "PASS|FAIL|WARN|SKIP <id> <detail>" line per finding, then a last line
#   SPEC-LINT: PASS|FAIL (<n> failure(s), <m> warning(s))
# Exit status: 0 on PASS, 1 on FAIL, 2 on a usage error.
#
# env:
#   CHECK_SPEC_FORCE_PATHS=1   run the PATHS check even for a feature that has feat(<slug>) commits

set -uo pipefail

slug="${1:-}"
if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "usage: check-spec.sh <feature-slug>" >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)" || exit 2
spec="docs/features/$slug/spec.md"
[ -f "$spec" ] || { echo "no $spec" >&2; exit 2; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fails=0
warns=0
pass() { echo "PASS $1 $2"; }
fail() { echo "FAIL $1 $2"; fails=$((fails + 1)); }
warn() { echo "WARN $1 $2"; warns=$((warns + 1)); }
skip() { echo "SKIP $1 $2"; }

# ---- split the spec ---------------------------------------------------------------------------
# Section 8 runs from "## 8." to the next "## " heading that is not a "## Phase" heading.
awk '
  /^## 8[. ]/ { on = 1; next }
  on && /^## / && !/^## Phase/ { exit }
  on { print }
' "$spec" > "$tmp/s8.md"
# Everything before Section 8 (definitions of TS- and E2E- ids).
awk '/^## 8[. ]/ { exit } { print }' "$spec" > "$tmp/pre8.md"

if ! grep -q '^### Step [0-9]' "$tmp/s8.md"; then
  if grep -q -i 'implementation order' "$spec" && ! grep -q '^## 8[. ]' "$spec"; then
    skip S8-SHAPE "thin-feature note: no Section 8 to lint"
    echo "SPEC-LINT: PASS (0 failure(s), 0 warning(s))"
    exit 0
  fi
  fail S8-SHAPE "no '### Step N' block found in Section 8"
  echo "SPEC-LINT: FAIL ($fails failure(s), $warns warning(s))"
  exit 1
fi

# Annotate every Section 8 line: step <TAB> phase <TAB> field <TAB> text.
# step 0 = before the first Step of a phase; field is the lower-cased bullet label ("satisfies",
# "depends-on", "files", "reuse", "change", "verify", "stop-if", "risk") or "delivers".
awk '
  BEGIN { step = 0; phase = ""; field = "" }
  /^## Phase/ {
    split($0, a, " "); phase = a[3]; step = 0; field = ""
    printf "%s\t%s\t%s\t%s\n", step, phase, field, $0; next
  }
  /^### Step [0-9]+/ {
    match($0, /[0-9]+/); step = substr($0, RSTART, RLENGTH) + 0; field = "head"
    printf "%s\t%s\t%s\t%s\n", step, phase, field, $0; next
  }
  /^- \*\*[^*:]+:\*\*/ {
    f = $0; sub(/^- \*\*/, "", f); sub(/:\*\*.*/, "", f); f = tolower(f); gsub(/ /, "-", f); field = f
  }
  /^\*\*Delivers:\*\*/ { field = "delivers" }
  { printf "%s\t%s\t%s\t%s\n", step, phase, field, $0 }
' "$tmp/s8.md" > "$tmp/ann.tsv"

steps="$(awk -F'\t' '$1 > 0 && !seen[$1]++ { print $1 }' "$tmp/ann.tsv")"
nsteps="$(echo "$steps" | grep -c .)"
pass S8-SHAPE "$nsteps Step block(s) in Section 8"

# text of one field of one step (with its continuation lines)
field_of() { awk -F'\t' -v s="$1" -v f="$2" '$1 == s && $3 == f { sub(/^[^\t]*\t[^\t]*\t[^\t]*\t/, ""); print }' "$tmp/ann.tsv"; }
has_field() { awk -F'\t' -v s="$1" -v f="$2" '$1 == s && $3 == f { found = 1 } END { exit !found }' "$tmp/ann.tsv"; }
phase_of() { awk -F'\t' -v s="$1" '$1 == s { print $2; exit }' "$tmp/ann.tsv"; }

is_test() { [[ "$1" =~ (^|/)tests/ ]] || [[ "$1" =~ \.(test|spec)\.[cm]?[jt]sx?$ ]]; }

# Expand every E2E- id in the text on stdin, one per line: plain ids, ranges ("E2E-01 to E2E-06",
# "E2E-01–E2E-06") and a bracket class inside a -t/-g regex ("E2E-0[1-7]").
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

# The text through which a Step writes tests: its test-file lines under Files, and the Change bullets
# that start with a test-file path. (A non-test bullet that mentions an id only refers to it.)
writer_text() {
  field_of "$1" files | grep -E '^[[:space:]]+-[[:space:]]+(add|change)[[:space:]]+`[^`]*(tests/|\.(test|spec)\.[cm]?[jt]sx?`)'
  field_of "$1" change | awk '
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

# Files of a step as "verb<TAB>path" lines
files_of() {
  field_of "$1" files | grep -E '^[[:space:]]+-[[:space:]]+(add|change|delete|remove)[[:space:]]' \
    | sed -E 's/^[[:space:]]+-[[:space:]]+(add|change|delete|remove)[[:space:]]+`?([^` ]+)`?.*/\1\t\2/'
}

# ---- TS ---------------------------------------------------------------------------------------
ts_defined="$(grep -oE '^\| TS-[0-9]+ ' "$tmp/pre8.md" | grep -oE 'TS-[0-9]+' | sort -u)"
ts_bad=0
for ts in $ts_defined; do
  n=0
  for s in $steps; do
    field_of "$s" satisfies | grep -qE "\b$ts\b" && n=$((n + 1))
  done
  if [ "$n" -ne 1 ]; then fail TS "$ts is in $n Step(s)' Satisfies (want exactly 1)"; ts_bad=1; fi
done
for s in $steps; do
  for cited in $(field_of "$s" satisfies | grep -oE 'TS-[0-9]+' | sort -u); do
    echo "$ts_defined" | grep -qx "$cited" || { fail TS "Step $s cites $cited, which Section 2.2 does not define"; ts_bad=1; }
  done
done
[ -n "$ts_defined" ] || { warn TS "no '| TS-NN |' rows found before Section 8"; ts_bad=1; }
[ "$ts_bad" -eq 0 ] && pass TS "$(echo "$ts_defined" | grep -c .) TS- id(s), each in exactly one Step"

# ---- E2E --------------------------------------------------------------------------------------
# Section 4 rows: | E2E-NN | AC | method | ...  (method e2e, e2e (P), compiler, manual, or — when removed)
awk '/^## 4[. ]/ { on = 1; next } on && /^## / { exit } on { print }' "$spec" > "$tmp/s4.md"
awk -F'|' '/^\| E2E-[0-9]+ / {
  id = $2; m = $4; gsub(/ /, "", id); gsub(/^ +| +$/, "", m); print id "\t" m
}' "$tmp/s4.md" > "$tmp/e2e-rows.tsv"
e2e_bad=0
if [ ! -s "$tmp/e2e-rows.tsv" ]; then
  warn E2E "no E2E- rows found in Section 4"
  e2e_bad=1
fi
e2e_ids_all="$(cut -f1 "$tmp/e2e-rows.tsv")"
e2e_ids_e2e="$(awk -F'\t' '$2 ~ /^e2e/ { print $1 }' "$tmp/e2e-rows.tsv")"

# Per Step: ids it writes (writer_text), ids its Verify cites, and what its Verify runs wholesale.
for s in $steps; do
  writer_text "$s" | expand_ids > "$tmp/writes-$s.txt"
  field_of "$s" verify | expand_ids > "$tmp/cites-$s.txt"
  # a Verify command that names one of the Step's own test files with no -t / -g filter runs every
  # row in that file; "npm run test:e2e" runs every row written so far
  : > "$tmp/runs-$s.txt"
  while IFS=$'\t' read -r verb path; do
    [ -n "$path" ] && is_test "$path" || continue
    if field_of "$s" verify | grep -F -- "$path" | grep -vE -- '(^|[[:space:]])-[tg][[:space:]]' | grep -qE 'playwright'; then
      cp "$tmp/writes-$s.txt" "$tmp/runs-$s.txt.new"; cat "$tmp/runs-$s.txt.new" >> "$tmp/runs-$s.txt"
    fi
  done < <(files_of "$s")
done
while IFS=$'\t' read -r id method; do
  [ -n "$id" ] || continue
  # removed rows ("—" or empty method) are neither written nor run
  case "$method" in ""|"—"|"-") continue ;; esac
  writers=""
  for s in $steps; do
    grep -qx "$id" "$tmp/writes-$s.txt" && writers="$writers $s"
  done
  nw="$(echo $writers | wc -w)"
  runs=0
  for s in $steps; do
    grep -qx "$id" "$tmp/cites-$s.txt" && runs=1
    grep -qx "$id" "$tmp/runs-$s.txt" && runs=1
    # full-suite command in a Step at or after the writer
    if field_of "$s" verify | grep -qE '`npm run (test|e2e)`'; then
      for w in $writers; do [ "$s" -ge "$w" ] && runs=1; done
    fi
  done
  case "$method" in
    e2e*)
      if [ "$nw" -ne 1 ]; then fail E2E "$id (e2e) is written by $nw Step(s)${writers:+ [$writers ]} (want exactly 1)"; e2e_bad=1; fi ;;
  esac
  if [ "$runs" -lt 1 ]; then fail E2E "$id ($method) is run by no Step's Verify"; e2e_bad=1; fi
done < "$tmp/e2e-rows.tsv"
for s in $steps; do
  for cited in $(cat "$tmp/cites-$s.txt"); do
    echo "$e2e_ids_all" | grep -qx "$cited" || warn E2E "Step $s Verify cites $cited, which Section 4 does not define (another feature's row?)"
  done
done
[ "$e2e_bad" -eq 0 ] && pass E2E "$(echo "$e2e_ids_all" | grep -c .) row(s): every e2e row written by one Step, every row run by a Verify"

# ---- PHASE ------------------------------------------------------------------------------------
has_phases=0
grep -q '^## Phase' "$tmp/s8.md" && has_phases=1
any_risk=0
for s in $steps; do has_field "$s" risk && any_risk=1; done
phase_bad=0
if [ "$has_phases" -eq 0 ]; then
  if [ "$any_risk" -eq 1 ]; then
    fail PHASE "Steps carry Risk lines but Section 8 has no '## Phase' heading"
  else
    warn PHASE "legacy spec: no '## Phase' headings (treated as one phase by /do-this); Delivers not checked"
  fi
  phase_bad=1
else
  for s in $steps; do
    [ -n "$(phase_of "$s")" ] || { fail PHASE "Step $s is outside every '## Phase'"; phase_bad=1; }
  done
  phases="$(awk -F'\t' '$1 == 0 && $2 != "" && !seen[$2]++ { print $2 }' "$tmp/ann.tsv")"
  for p in $phases; do
    d="$(awk -F'\t' -v p="$p" '$1 == 0 && $2 == p && $3 == "delivers"' "$tmp/ann.tsv")"
    [ -n "$d" ] || { fail PHASE "Phase $p has no **Delivers:** line"; phase_bad=1; }
  done
  for id in $ts_defined $e2e_ids_e2e; do
    n=0
    for p in $phases; do
      awk -F'\t' -v p="$p" '$1 == 0 && $2 == p && $3 == "delivers"' "$tmp/ann.tsv" | grep -qE "\b$id\b" && n=$((n + 1))
    done
    [ "$n" -eq 1 ] || { fail PHASE "$id is delivered by $n phase(s) (want exactly 1)"; phase_bad=1; }
  done
fi
[ "$phase_bad" -eq 0 ] && pass PHASE "every Step in a phase with a Delivers line; every TS-/e2e id delivered once"

# ---- FILES (size) -----------------------------------------------------------------------------
size_bad=0
for s in $steps; do
  n=0
  while IFS=$'\t' read -r verb path; do
    [ -n "$path" ] || continue
    is_test "$path" || n=$((n + 1))
  done < <(files_of "$s")
  [ "$n" -le 6 ] || { fail FILES "Step $s lists $n non-test files (max 6)"; size_bad=1; }
done
[ "$size_bad" -eq 0 ] && pass FILES "no Step lists more than six non-test files"

# ---- WORDS ------------------------------------------------------------------------------------
# "either" is a warning, not a failure: in the real specs every hit is "either of two named things"
# ("must not log either argument"), not an open decision. The reader still checks each one.
awk '
  /^[[:space:]]*```/ { code = !code; next }
  code { next }
  {
    line = $0
    gsub(/`[^`]*`/, "", line)
    low = tolower(line)
    if (low ~ /(^|[^a-z])(choose|decide|or similar|as appropriate|tbd)([^a-z]|$)/) printf "F %d: %s\n", NR, $0
    else if (low ~ /(^|[^a-z])either([^a-z]|$)/) printf "W %d: %s\n", NR, $0
  }
' "$tmp/s8.md" > "$tmp/words.txt"
words_bad=0
while IFS= read -r l; do
  [ -n "$l" ] || continue
  kind="${l%% *}"; rest="${l#? }"
  text="Section 8 line ${rest%%:*}: $(echo "${rest#*: }" | cut -c1-160)"
  if [ "$kind" = F ]; then fail WORDS "$text"; words_bad=1; else warn WORDS "$text (\"either\": confirm it is not an open decision)"; fi
done < "$tmp/words.txt"
[ "$words_bad" -eq 0 ] && pass WORDS "no choose/decide/or similar/as appropriate/TBD in Section 8"

# ---- PATHS ------------------------------------------------------------------------------------
built=0
subjects="$(git log --format=%s)"
grep -qE "^(feat|fix|refactor|chore)\($slug\)|^docs\($slug\): mark implementation complete" <<< "$subjects" && built=1
if [ "$built" -eq 1 ] && [ "${CHECK_SPEC_FORCE_PATHS:-0}" != 1 ]; then
  skip PATHS "implementation commits for $slug exist: add/change paths are history (CHECK_SPEC_FORCE_PATHS=1 to run anyway)"
else
  path_bad=0
  : > "$tmp/added.txt"
  tracked() {
    case "$1" in
      *\**) git ls-files -- "$1" | grep -q . ;;
      *)    git ls-files -- ":(literal)$1" | grep -q . ;;
    esac
  }
  for s in $steps; do
    while IFS=$'\t' read -r verb path; do
      [ -n "$path" ] || continue
      case "$verb" in
        add)
          if tracked "$path" || grep -qxF "$path" "$tmp/added.txt"; then
            fail PATHS "Step $s adds $path, which already exists"; path_bad=1
          fi
          echo "$path" >> "$tmp/added.txt" ;;
        change|delete|remove)
          if ! tracked "$path" && ! grep -qxF "$path" "$tmp/added.txt"; then
            fail PATHS "Step $s ${verb}s $path, which does not exist and no earlier Step adds it"; path_bad=1
          fi ;;
      esac
    done < <(files_of "$s")
  done
  [ "$path_bad" -eq 0 ] && pass PATHS "every change path exists, every add path is free"
fi

# ---- STEP (Risk, Verify, Stop-if) -------------------------------------------------------------
step_bad=0
for s in $steps; do
  if ! has_field "$s" risk; then
    fail STEP "Step $s has no '- **Risk:** high|low — <reason>' line"; step_bad=1
  else
    risk="$(field_of "$s" risk | head -n1 | sed -E 's/^- \*\*Risk:\*\*[[:space:]]*//')"
    case "$risk" in
      high*|low*) ;;
      *) fail STEP "Step $s Risk must start with high or low (got: ${risk:-empty})"; step_bad=1 ;;
    esac
    reason="$(echo "$risk" | sed -E 's/^(high|low)[[:space:]]*(—|--|-|:)?[[:space:]]*//')"
    [ -n "$reason" ] || warn STEP "Step $s Risk has no reason after high|low"
  fi
  has_field "$s" verify || { fail STEP "Step $s has no Verify"; step_bad=1; }
  has_field "$s" stop-if || { fail STEP "Step $s has no Stop-if"; step_bad=1; }
done
[ "$step_bad" -eq 0 ] && pass STEP "every Step has Risk, Verify and Stop-if"

if [ "$fails" -eq 0 ]; then
  echo "SPEC-LINT: PASS ($fails failure(s), $warns warning(s))"
  exit 0
fi
echo "SPEC-LINT: FAIL ($fails failure(s), $warns warning(s))"
exit 1
