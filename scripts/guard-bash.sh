#!/usr/bin/env bash
# PreToolUse hook for the Bash tool (wired in .claude/settings.json). It reads the hook payload (JSON)
# on stdin and refuses, by exiting 2 with the reason on stderr, a command that:
#   - stages everything:           git add -A | --all | .      (stage explicit paths)
#   - commits everything:          git commit -a | -am | --all
#   - skips the hooks:             --no-verify on any git command, or git commit -n
#   - protected branches:          no commit/merge/cherry-pick/revert/am while the current branch is
#                                  protected; no push, delete or ref update that targets one (git push origin
#                                  main, HEAD:develop, :master, --delete, --all, a bare git push from a protected
#                                  branch; gh api writes to refs/heads/<protected>; the GitHub MCP file-write
#                                  tools with branch=<protected>). The list is PROTECTED_BRANCHES, default
#                                  "develop main master". Work on a feature branch and open a pull request.
#   - pull requests to other bases: gh pr create without --base develop (it would fall back to the default
#                                  branch), gh pr edit --base <other>, and the GitHub MCP pull request tools
#                                  with a base other than develop. Pull requests always target develop.
#   - force-pushes:                git push --force | -f | --force-with-lease | --force-if-includes | --mirror,
#                                  a '+' refspec (git push origin +main), or a forced ref update through
#                                  the API (gh api ... force=true). Refused in every session: nobody force
#                                  pushes to any branch. A plain git push, and gh pr create, are allowed.
# Everything else exits 0. A diff cannot show which commands a subagent ran; this stops them.
#
# The command is split like a shell would (quotes, backslashes, ; & | ( ) ` { } and newlines end a
# command; comments and heredoc bodies are ignored), and `bash -c "..."`, `sh -c`, `eval` strings are
# checked the same way. The value after -m / --message / --body / --title of a git or gh command is
# prose, not a file, so it is not scanned for .env. This is a guard against slips by a model, not a
# security boundary: a determined command can still hide a path from it.
#
# usage (by the harness):   echo '{"tool_name":"Bash","tool_input":{"command":"git add ."}}' | scripts/guard-bash.sh
# exit 0 = allow, 2 = block (message on stderr). If the payload cannot be read (no jq and no node),
# it allows and says so on stderr rather than blocking every command.

set -uo pipefail

payload="$(cat)"

# one field of the hook payload: command | tool | branch. Exit status 3 = no jq and no node.
field_of() {
  local jqf jsf
  case "$1" in
    command) jqf='.tool_input.command // empty'; jsf='(j.tool_input && j.tool_input.command) || ""' ;;
    tool)    jqf='.tool_name // empty';          jsf='j.tool_name || ""' ;;
    branch)  jqf='.tool_input.branch // empty';  jsf='(j.tool_input && j.tool_input.branch) || ""' ;;
    base)    jqf='.tool_input.base // empty';    jsf='(j.tool_input && j.tool_input.base) || ""' ;;
    base_ref) jqf='.tool_input.base_ref // empty'; jsf='(j.tool_input && j.tool_input.base_ref) || ""' ;;
  esac
  if command -v jq > /dev/null 2>&1; then
    printf '%s' "$payload" | jq -r "$jqf" 2> /dev/null
  elif command -v node > /dev/null 2>&1; then
    printf '%s' "$payload" | node -e '
      let d = ""; process.stdin.on("data", c => d += c).on("end", () => {
        try { const j = JSON.parse(d); process.stdout.write(String('"$jsf"')); } catch (e) {}
      });' 2> /dev/null
  else
    echo "guard-bash: neither jq nor node is available; command not checked" >&2
    return 3
  fi
}

PROTECTED="${PROTECTED_BRANCHES:-develop main master}"
PR_BASE_BRANCH=develop   # pull requests always target this; /run-this opens the pipeline's pull request with this base
current_branch() { git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2> /dev/null; }
is_protected() { # a branch name or refs/heads/<name>
  local n="${1#refs/heads/}" p
  [ -n "$n" ] || return 1
  for p in $PROTECTED; do [ "$n" = "$p" ] && return 0; done
  return 1
}

tool="$(field_of tool)"
[ $? -eq 3 ] && exit 0

# The GitHub MCP file-write tools take a branch: never a protected one.
case "$tool" in
  mcp__github__push_files|mcp__github__create_or_update_file|mcp__github__delete_file)
    br="$(field_of branch)"
    if is_protected "$br"; then
      echo "guard-bash: refused: '$br' is a protected branch ($PROTECTED). Write to a feature branch and open a pull request." >&2
      exit 2
    fi
    exit 0 ;;
esac

case "$tool" in
  mcp__github__create_pull_request|mcp__github__update_pull_request|mcp__github__create_pull_request_with_copilot)
    if [ "$tool" = mcp__github__create_pull_request_with_copilot ]; then field=base_ref; else field=base; fi
    pr_base="$(field_of $field)"
    if [ -n "$pr_base" ] && [ "$pr_base" != "$PR_BASE_BRANCH" ]; then
      echo "guard-bash: refused: a pull request targets '$pr_base'. Pull requests always target $PR_BASE_BRANCH." >&2
      exit 2
    fi
    if [ -z "$pr_base" ] && [ "$tool" != mcp__github__update_pull_request ]; then
      echo "guard-bash: refused: say which base. Pull requests always target $PR_BASE_BRANCH; pass $field=$PR_BASE_BRANCH." >&2
      exit 2
    fi
    exit 0 ;;
esac

cmd="$(field_of command)"
[ -n "$cmd" ] || exit 0

# Split a command string into words, one per line. A line holding only the byte \003 ends a simple
# command. Newlines inside a word are written as \002 (undone when a -c string is split again).
tokenize() {
  awk '
    BEGIN { RS = "\001"; SEP = "\003" }
    function flush() {
      if (have || tok != "") { gsub(/\n/, "\002", tok); print tok }
      tok = ""; have = 0
    }
    function sep() { flush(); print SEP }
    {
      s = $0; n = length(s); i = 1; tok = ""; have = 0; q = ""; pend = ""; dash = 0
      while (i <= n) {
        c = substr(s, i, 1)
        if (q == "\047") { if (c == "\047") q = ""; else tok = tok c; i++; continue }
        if (q == "\"") {
          if (c == "\\" && i < n) {
            d2 = substr(s, i + 1, 1)
            if (d2 == "$" || d2 == "`" || d2 == "\"" || d2 == "\\" || d2 == "\n") { tok = tok d2; i += 2 } else { tok = tok c; i++ }
            continue
          }
          if (c == "\"") { q = ""; i++; continue }
          tok = tok c; i++; continue
        }
        if (c == "\047" || c == "\"") { q = c; have = 1; i++; continue }
        if (c == "\\" && i < n) { tok = tok substr(s, i + 1, 1); have = 1; i += 2; continue }
        if (c == "#" && tok == "" && !have) { while (i <= n && substr(s, i, 1) != "\n") i++; continue }
        if (c == " " || c == "\t") { flush(); i++; continue }
        if (c == "<" && substr(s, i + 1, 1) == "<" && substr(s, i + 2, 1) != "<") {
          # heredoc: read the delimiter word, then drop the body that starts on the next line
          i += 2; dash = 0
          if (substr(s, i, 1) == "-") { dash = 1; i++ }
          while (substr(s, i, 1) == " ") i++
          d = ""
          while (i <= n) {
            c = substr(s, i, 1)
            if (c == " " || c == "\t" || c == "\n" || c == ";" || c == "&" || c == "|" || c == "<" || c == ">" || c == ")") break
            if (c != "\047" && c != "\"" && c != "\\") d = d c
            i++
          }
          pend = d
          continue
        }
        if (c == "\n") {
          sep(); i++
          if (pend != "") {
            while (i <= n) {
              e = index(substr(s, i), "\n"); line = (e == 0) ? substr(s, i) : substr(s, i, e - 1)
              i += (e == 0) ? length(line) : e
              l2 = line; if (dash) sub(/^\t+/, "", l2)
              if (l2 == pend) break
            }
            pend = ""
          }
          continue
        }
        if (c == ";" || c == "&" || c == "|" || c == "(" || c == ")" || c == "`" || c == "{" || c == "}") { sep(); i++; continue }
        tok = tok c; have = 1; i++
      }
      flush(); print SEP
    }
  '
}

blocked=""
block() { blocked="$1"; }

# does this word name an environment file other than .env.example?
is_env_file() {
  local w="$1" piece
  local -a pieces
  IFS='<>=:,' read -ra pieces <<< "$w"
  for piece in "${pieces[@]}"; do
    [[ "$piece" =~ (^|/)\.env(\.[A-Za-z0-9_-]+)*$ ]] || continue
    [[ "$piece" =~ (^|/)\.env\.example$ ]] && continue
    return 0
  done
  return 1
}

# analyse one simple command (its words are the arguments)
analyze() {
  [ "$#" -gt 0 ] || return 0
  local -a w=("$@")
  local i=0 t prev

  # drop leading VAR=value words and wrapper commands
  while [ "$i" -lt "${#w[@]}" ]; do
    t="${w[$i]}"
    if [[ "$t" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then i=$((i + 1)); continue; fi
    case "$t" in
      sudo|command|exec|time|nice|nohup|builtin) i=$((i + 1)); continue ;;
      env) i=$((i + 1)); while [ "$i" -lt "${#w[@]}" ] && { [[ "${w[$i]}" == -* ]] || [[ "${w[$i]}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; }; do i=$((i + 1)); done; continue ;;
    esac
    break
  done
  w=("${w[@]:$i}")
  [ "${#w[@]}" -gt 0 ] || return 0
  local first="${w[0]}"
  first="${first##*/}"

  # nested command strings: bash -c "...", sh -c '...', eval "..."
  case "$first" in
    bash|sh|zsh|dash|ksh)
      for ((i = 1; i < ${#w[@]}; i++)); do
        if [[ "${w[$i]}" =~ ^-[A-Za-z]*c$ ]] && [ $((i + 1)) -lt "${#w[@]}" ]; then
          scan_string "${w[$((i + 1))]}"
        fi
      done ;;
    eval)
      for ((i = 1; i < ${#w[@]}; i++)); do scan_string "${w[$i]}"; done ;;
  esac

  local prose=0
  { [ "$first" = git ] || [ "$first" = gh ]; } && prose=1

  # environment files: any word, except the prose value of -m / --message / --body / --title
  prev=""
  for ((i = 1; i < ${#w[@]}; i++)); do
    t="${w[$i]}"
    if [ "$prose" -eq 1 ]; then
      case "$prev" in -m|--message|--body|--title|-b) prev="$t"; continue ;; esac
      case "$t" in --message=*|--body=*|--title=*) prev="$t"; continue ;; esac
    fi
    if is_env_file "$t"; then
      block "refused: '$t' is an environment file. .env and .env.local are off limits (CLAUDE.md § Never violate); .env.example is fine."
      return 0
    fi
    prev="$t"
  done
  if [ "$first" != git ] && is_env_file "${w[0]}"; then
    block "refused: '${w[0]}' is an environment file (CLAUDE.md § Never violate)."
    return 0
  fi

  if [ "$first" = gh ] && [ "${w[1]:-}" = pr ] && { [ "${w[2]:-}" = create ] || [ "${w[2]:-}" = edit ]; }; then
    local pr_base="" pr_seen=0
    for ((i = 3; i < ${#w[@]}; i++)); do
      case "${w[$i]}" in
        --base|-B) pr_base="${w[$((i + 1))]:-}"; pr_seen=1 ;;
        --base=*)  pr_base="${w[$i]#--base=}"; pr_seen=1 ;;
        -B?*)      pr_base="${w[$i]#-B}"; pr_seen=1 ;;
      esac
    done
    if [ "${w[2]}" = create ] && [ "$pr_seen" = 0 ]; then
      block "refused: 'gh pr create' without --base falls back to the repository's default branch. Pull requests always target $PR_BASE_BRANCH: add --base $PR_BASE_BRANCH."
      return 0
    fi
    if [ "$pr_seen" = 1 ] && [ "$pr_base" != "$PR_BASE_BRANCH" ]; then
      block "refused: this pull request targets '$pr_base'. Pull requests always target $PR_BASE_BRANCH."
      return 0
    fi
  fi

  if [ "$first" = gh ] && [ "${w[1]:-}" = api ]; then
    local writes=0 m pat="${PROTECTED// /|}"
    for ((i = 2; i < ${#w[@]}; i++)); do
      case "${w[$i]}" in
        -f|-F|--field|--raw-field|--input) writes=1 ;;
        -X|--method) m="${w[$((i + 1))]:-}"; [ "${m^^}" = GET ] || writes=1 ;;
      esac
    done
    if [ "$writes" = 1 ]; then
      for ((i = 2; i < ${#w[@]}; i++)); do
        if [[ "${w[$i]}" =~ refs/heads/(${pat})(/|\?|$) ]] || [[ "${w[$i]}" =~ ^(branch|ref)=(refs/heads/)?(${pat})$ ]]; then
          block "refused: this gh api call writes to a protected branch (${PROTECTED}). Use a feature branch and a pull request."
          return 0
        fi
      done
    fi
    for ((i = 2; i < ${#w[@]}; i++)); do
      if [[ "${w[$i]}" =~ force[=:]\ *true ]] || [[ "${w[$i]}" =~ \"force\"[[:space:]]*:[[:space:]]*true ]]; then
        block "refused: 'gh api' with force=true force-updates a ref. Nobody force pushes to any branch."
        return 0
      fi
    done
  fi

  [ "$first" = git ] || return 0

  # git: skip global options to find the subcommand
  i=1
  while [ "$i" -lt "${#w[@]}" ] && [[ "${w[$i]}" == -* ]]; do
    case "${w[$i]}" in
      -C|-c|--git-dir|--work-tree|--namespace|--exec-path) i=$((i + 2)) ;;
      *) i=$((i + 1)) ;;
    esac
  done
  local sub="${w[$i]:-}"
  local j a k
  case "$sub" in
    commit|merge|cherry-pick|revert|am)
      cur="$(current_branch)"
      if is_protected "$cur"; then
        block "refused: '$cur' is a protected branch ($PROTECTED); 'git $sub' would add commits to it. Switch to a feature branch first."
        return 0
      fi ;;
  esac
  if [ "$sub" = push ]; then
    local -a pos=()
    local skip=0
    for ((j = i + 1; j < ${#w[@]}; j++)); do
      a="${w[$j]}"
      if [ "$skip" = 1 ]; then skip=0; continue; fi
      case "$a" in
        --force|--force=*|--force-with-lease|--force-with-lease=*|--force-if-includes|--mirror|+*)
          block "refused: 'git push $a' force-pushes. Nobody force pushes to any branch; push normally, or add a commit that fixes the problem."
          return 0 ;;
        --all)
          block "refused: 'git push --all' pushes every local branch, protected ones included ($PROTECTED). Push the one branch by name."
          return 0 ;;
        -o|--push-option|--repo|--receive-pack|--exec) skip=1; continue ;;
      esac
      if [[ "$a" =~ ^-[A-Za-z]*f[A-Za-z]*$ ]]; then
        block "refused: 'git push $a' force-pushes (-f). Nobody force pushes to any branch."
        return 0
      fi
      [[ "$a" == -* ]] && continue
      # a refspec such as origin:+main or HEAD:+main
      if [[ "$a" == *:+* ]]; then
        block "refused: the '+' refspec '$a' force-pushes. Nobody force pushes to any branch."
        return 0
      fi
      pos+=("$a")
    done
    # pos[0] is the remote; the rest are refspecs. No refspec means the current branch is pushed.
    local r dst cur
    cur="$(current_branch)"
    if [ "${#pos[@]}" -le 1 ]; then
      if is_protected "$cur"; then
        block "refused: '$cur' is a protected branch ($PROTECTED); a bare 'git push' would push it. Switch to a feature branch."
        return 0
      fi
    else
      for ((k = 1; k < ${#pos[@]}; k++)); do
        r="${pos[$k]}"
        if [ "$r" = HEAD ]; then dst="$cur"
        elif [[ "$r" == *:* ]]; then dst="${r##*:}"; [ -n "$dst" ] || dst="$cur"
        else dst="$r"; fi
        if is_protected "$dst"; then
          block "refused: 'git push ... $r' targets '${dst#refs/heads/}', a protected branch ($PROTECTED). Push a feature branch and open a pull request."
          return 0
        fi
      done
    fi
  fi
  for ((j = i + 1; j < ${#w[@]}; j++)); do
    a="${w[$j]}"
    if [ "$a" = --no-verify ]; then
      block "refused: --no-verify skips the hooks. Fix what the hook reports instead."
      return 0
    fi
    case "$sub" in
      add)
        if [ "$a" = . ] || [ "$a" = --all ] || [[ "$a" =~ ^-[A-Za-z]*A[A-Za-z]*$ ]]; then
          block "refused: 'git add $a' stages everything. Stage explicit paths (CLAUDE.md § Never violate)."
          return 0
        fi ;;
      commit)
        if [ "$a" = --all ] || [[ "$a" =~ ^-[^-mFCcStu]*a ]]; then
          block "refused: 'git commit $a' commits every tracked change. Stage explicit paths, then commit (CLAUDE.md § Never violate)."
          return 0
        fi
        if [[ "$a" =~ ^-[^-mFCcStu]*n ]]; then
          block "refused: 'git commit $a' is --no-verify. Fix what the hook reports instead."
          return 0
        fi ;;
    esac
  done
  return 0
}

check_tokens() { # reads tokens (see tokenize) on stdin
  local -a seg=()
  local t
  while IFS= read -r t; do
    if [ "$t" = $'\003' ]; then
      analyze "${seg[@]+"${seg[@]}"}"
      seg=()
      [ -n "$blocked" ] && return 0
    else
      seg+=("${t//$'\002'/$'\n'}")
    fi
  done
}

scan_string() { # a command string, from -c or eval
  [ -n "$blocked" ] && return 0
  local out
  out="$(printf '%s' "$1" | tokenize)"
  check_tokens <<< "$out"
}

out="$(printf '%s' "$cmd" | tokenize)"
check_tokens <<< "$out"

if [ -n "$blocked" ]; then
  echo "guard-bash: $blocked" >&2
  exit 2
fi
exit 0
