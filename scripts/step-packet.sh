#!/usr/bin/env bash
# Write the packet for one task of a feature plan: the only part of spec.md a worker subagent reads.
#
# usage:
#   npm run step:packet -- <slug> <step>
#   (or: bash scripts/step-packet.sh <slug> <step>)
#
# <step> is the number of a "### Step N" block in docs/features/<slug>/spec.md Section 8. The packet
# is copied out of spec.md mechanically, never summarised, so it cannot drift from the spec:
#   the feature title
#   Section 2.1 Approach, 2.7 Decisions made (do not revisit), 2.8 Do not touch
#   the Step's phase heading and its Delivers line
#   the "### Step N" block, verbatim
#   Section 4 (Verification mapping) with every E2E- row the Step does not name left out; the
#     fixtures and notes of that section are kept, because the rows refer to them
#
# It is written to .run-logs/<slug>/step-<N>.md (git-ignored; check-task.sh ignores .run-logs/).
# The last line of output is always:
#   PACKET: <path> (<lines> lines, E2E rows: <n>)      exit 0
#   PACKET: FAIL <reason>                              exit 1
# The orchestrator passes the path to its subagents and does not read the file itself.

set -uo pipefail

slug="${1:-}"
step="${2:-}"

die() { echo "PACKET: FAIL $*"; exit 1; }

if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || [[ ! "$step" =~ ^[0-9]+$ ]]; then
  echo "usage: step-packet.sh <feature-slug> <step-number>" >&2
  die "usage-error"
fi

cd "$(git rev-parse --show-toplevel)" || die "not-a-git-repo"
spec="docs/features/$slug/spec.md"
[ -f "$spec" ] || die "no $spec"

out_dir=".run-logs/$slug"
out="$out_dir/step-$step.md"
mkdir -p "$out_dir" || die "cannot create $out_dir"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# a "### <number> <title>" subsection of Section 2, heading included, up to the next heading
subsection() { # number, e.g. 2.7
  awk -v want="$1" '
    /^###? / {
      if (on) exit
      if ($0 ~ ("^### " want "([ .]|$)")) { on = 1; print; next }
    }
    on { print }
  ' "$spec"
}

# Section 8 only: up to the next "## " heading that is not a "## Phase"
awk '
  /^## 8[. ]/ { on = 1; next }
  on && /^## / && !/^## Phase/ { exit }
  on { print }
' "$spec" > "$tmp/plan.md"
[ -s "$tmp/plan.md" ] || die "no Section 8 in $spec (a thin spec has no packet: give the worker spec.md itself)"

# the Step block, and the phase heading with its Delivers line
awk -v want="$step" -v phase_out="$tmp/phase.md" '
  /^## Phase/ { phase = $0; delivers = ""; inside = 0; next }
  /^\*\*Delivers:\*\*/ { if (!inside) delivers = $0 }
  /^### Step [0-9]+/ {
    match($0, /[0-9]+/); n = substr($0, RSTART, RLENGTH) + 0
    inside = (n == want + 0)
    if (inside) { print phase > phase_out; if (delivers != "") { print "" > phase_out; print delivers > phase_out } }
  }
  inside { print }
' "$tmp/plan.md" > "$tmp/step.md"
[ -s "$tmp/step.md" ] || die "no '### Step $step' in $spec Section 8"

# every E2E- id the Step names: plain ids, "E2E-01 to E2E-06" ranges and "E2E-0[1-7]"
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
' "$tmp/step.md" | sort -u > "$tmp/ids.txt"

# Section 4 without the E2E- rows the Step does not name
awk -v ids="$tmp/ids.txt" -v count_out="$tmp/rows.txt" '
  BEGIN { while ((getline id < ids) > 0) want[id] = 1; rows = 0 }
  /^## 4[. ]/ { on = 1; print; next }
  on && /^## / { on = 0 }
  !on { next }
  /^\|[[:space:]]*E2E-[0-9]+/ {
    id = $0; sub(/^\|[[:space:]]*/, "", id); sub(/[^A-Za-z0-9-].*/, "", id)
    if (id in want) { print; rows++ }
    next
  }
  { print }
  END { print rows > count_out }
' "$spec" > "$tmp/verification.md"
rows="$(cat "$tmp/rows.txt" 2> /dev/null || echo 0)"
named="$(grep -c . "$tmp/ids.txt" || true)"

{
  echo "# Step packet: $slug, Step $step"
  echo
  echo "Copied from \`$spec\` by \`scripts/step-packet.sh\`. This is everything a worker needs from the"
  echo "spec for this task. Do not open \`spec.md\` unless your brief tells you to. Never edit this file."
  echo
  echo "Feature: $(grep -m1 '^# ' "$spec" | sed 's/^# //')"
  echo
  echo "## From Section 2 of the spec"
  echo
  for n in 2.1 2.7 2.8; do
    if [ -n "$(subsection "$n")" ]; then subsection "$n"; echo; else echo "### $n (not in this spec)"; echo; fi
  done
  echo "## The task"
  echo
  [ -s "$tmp/phase.md" ] && { cat "$tmp/phase.md"; echo; }
  cat "$tmp/step.md"
  echo
  if [ "$named" -eq 0 ]; then
    echo "## Tests for this task"
    echo
    echo "The Step names no \`E2E-\` id, so no test is written for it."
  else
    echo "## Tests for this task (Section 4 of the spec; rows the Step does not name are left out)"
    echo
    cat "$tmp/verification.md"
  fi
} > "$out"

if [ "$named" -ne "$rows" ]; then
  echo "WARN the Step names $named E2E id(s) but Section 4 has a row for $rows of them"
fi
echo "PACKET: $out ($(wc -l < "$out" | tr -d ' ') lines, E2E rows: $rows)"
