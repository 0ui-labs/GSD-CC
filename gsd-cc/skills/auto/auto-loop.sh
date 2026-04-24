#!/bin/bash
# GSD-CC Auto-Mode Loop
# The only piece of "code" in GSD-CC. Everything else is Skills (Markdown) and State (.gsd/ files).
#
# Usage: bash auto-loop.sh [--budget <tokens>]
# Requires: claude CLI, jq, git

set -euo pipefail

# ── macOS compatibility: timeout shim ─────────────────────────────────────────

if ! command -v timeout &>/dev/null; then
  if command -v gtimeout &>/dev/null; then
    timeout() { gtimeout "$@"; }
  else
    # Fallback: warn and run without timeout protection
    echo "⚠ Neither 'timeout' nor 'gtimeout' found. Tasks will run without time limits."
    echo "  Install coreutils for timeout support: brew install coreutils"
    timeout() { shift; "$@"; }
  fi
fi

# ── Resolve claude CLI path ───────────────────────────────────────────────────

CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
if [[ -z "$CLAUDE_BIN" ]]; then
  # Common locations
  for p in "/opt/homebrew/bin/claude" "/usr/local/bin/claude" "$HOME/.claude/bin/claude"; do
    [[ -x "$p" ]] && CLAUDE_BIN="$p" && break
  done
fi

if [[ -z "$CLAUDE_BIN" ]]; then
  echo "❌ Auto-mode unavailable: claude CLI not found."
  echo "   Install Claude Code and ensure \`claude\` is in your PATH."
  exit 1
fi

# ── Configuration ──────────────────────────────────────────────────────────────

GSD_DIR=".gsd"
LOCK_FILE="$GSD_DIR/auto.lock"
COSTS_FILE="$GSD_DIR/COSTS.jsonl"
LOG_FILE="$GSD_DIR/auto.log"
BUDGET="${GSD_CC_BUDGET:-0}" # 0 = unlimited

# Resolve skills directory (global or local)
if [[ -d ".claude/skills/auto" ]]; then
  SKILLS_DIR=".claude/skills"
elif [[ -d "$HOME/.claude/skills/auto" ]]; then
  SKILLS_DIR="$HOME/.claude/skills"
else
  echo "❌ GSD-CC skills not found. Run 'npx gsd-cc' to install."
  exit 1
fi

PROMPTS_DIR="${SKILLS_DIR}/auto"

# Parse --budget flag
while [[ $# -gt 0 ]]; do
  case "$1" in
    --budget) BUDGET="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Prerequisites ──────────────────────────────────────────────────────────────

if ! command -v jq &>/dev/null; then
  echo "❌ Auto-mode unavailable: jq not found. Install with: brew install jq"
  echo "   If GSD-CC was installed without jq, rerun the installer to enable hooks."
  exit 1
fi

if ! command -v git &>/dev/null; then
  echo "❌ Auto-mode unavailable: git not found."
  echo "   Install Git and ensure \`git\` is in your PATH."
  exit 1
fi

if [[ ! -f "$GSD_DIR/STATE.md" ]]; then
  echo "❌ No .gsd/STATE.md found. Run /gsd-cc first to set up a project."
  exit 1
fi

# Validate required STATE.md fields
for field in milestone current_slice current_task phase rigor; do
  val=$(grep "^$field:" "$GSD_DIR/STATE.md" | head -1 | sed "s/^$field:[[:space:]]*//" || true)
  if [[ -z "$val" || "$val" == "—" ]]; then
    echo "❌ STATE.md is missing required field: $field"
    echo "   Run /gsd-cc to fix project state before starting auto-mode."
    exit 1
  fi
done

# ── Logging ───────────────────────────────────────────────────────────────────

# Tee all output to both stdout and log file. Tests can disable this because
# some sandboxed shells disallow process substitution through /dev/fd.
if [[ "${GSD_CC_DISABLE_TEE:-0}" != "1" ]]; then
  exec > >(tee -a "$LOG_FILE") 2>&1
fi

log() {
  echo "[$(date -Iseconds)] $*"
}

# ── Cleanup trap ───────────────────────────────────────────────────────────────

cleanup() {
  rm -f "$LOCK_FILE"
  rm -rf "${LOCK_FILE}.d"
  rm -f /tmp/gsd-prompt-$$.txt
  rm -f /tmp/gsd-result-$$.json
  rm -f /tmp/gsd-stderr-$$.log
}
trap cleanup EXIT

# ── Helper functions ───────────────────────────────────────────────────────────

read_state_field() {
  grep "^$1:" "$GSD_DIR/STATE.md" | head -1 | sed "s/^$1:[[:space:]]*//"
}

read_optional_state_field() {
  grep "^$1:" "$GSD_DIR/STATE.md" | head -1 | sed "s/^$1:[[:space:]]*//" || true
}

update_state_field() {
  local field="$1" value="$2"
  if grep -q "^${field}:" "$GSD_DIR/STATE.md"; then
    sed -i '' "s/^${field}:.*/${field}: ${value}/" "$GSD_DIR/STATE.md"
  fi
}

log_cost() {
  local unit="$1" phase="$2" result_file="$3"
  if [[ -f "$result_file" ]]; then
    jq -c "{unit: \"$unit\", phase: \"$phase\", model: .model, usage: .usage, ts: \"$(date -Iseconds)\"}" \
      "$result_file" >> "$COSTS_FILE" 2>/dev/null || true
  fi
}

fail_validation() {
  local message="$1" hint="${2:-}"
  log "❌ $message"
  if [[ -n "$hint" ]]; then
    log "   $hint"
  fi
  exit 1
}

normalize_auto_scope() {
  local raw
  raw="$1"

  case "$raw" in
    ""|"slice") echo "slice" ;;
    "milestone") echo "milestone" ;;
    *) return 1 ;;
  esac
}

slice_plan_path() {
  local slice="$1"
  echo "$GSD_DIR/${slice}-PLAN.md"
}

task_plan_xml_path() {
  local slice="$1" task="$2"
  echo "$GSD_DIR/${slice}-${task}-PLAN.xml"
}

find_matching_files() {
  local pattern="$1"
  compgen -G "$pattern" || true
}

require_file() {
  local path="$1" label="$2" hint="$3"
  if [[ ! -f "$path" ]]; then
    fail_validation "Missing ${label}: $path" "$hint"
  fi
}

require_matching_files() {
  local pattern="$1" label="$2" hint="$3"
  if ! compgen -G "$pattern" > /dev/null; then
    fail_validation "Missing ${label} matching: $pattern" "$hint"
  fi
}

assert_no_legacy_task_plan_markdown() {
  local slice="$1"
  local hint="Run /gsd-cc-plan to regenerate XML task plans before restarting auto-mode."
  local legacy_files=()
  local legacy_file

  while IFS= read -r legacy_file; do
    [[ -z "$legacy_file" ]] && continue
    legacy_files+=("$legacy_file")
  done < <(find_matching_files "$GSD_DIR/${slice}-T*-PLAN.md")

  if [[ ${#legacy_files[@]} -gt 0 ]]; then
    fail_validation "Legacy task plan detected: ${legacy_files[0]}" "$hint"
  fi
}

validate_phase_artifacts() {
  local phase="$1" slice="$2" task="$3"
  local roadmap_hint="Run /gsd-cc to create a roadmap before starting auto-mode."
  local replan_hint="Run /gsd-cc-plan to regenerate the slice plan artifacts before restarting auto-mode."
  local reapply_hint="Run /gsd-cc-apply to regenerate the task summary artifacts before restarting auto-mode."
  local slice_plan
  local task_plan

  if [[ -z "$phase" || -z "$slice" || -z "$task" ]]; then
    fail_validation "STATE.md is missing phase, current_slice, or current_task." \
      "Run /gsd-cc to repair project state before restarting auto-mode."
  fi

  require_matching_files "$GSD_DIR/M*-ROADMAP.md" "roadmap files" "$roadmap_hint"

  case "$phase" in
    plan|roadmap-complete|seed-complete|discuss-complete)
      assert_no_legacy_task_plan_markdown "$slice"
      ;;
    plan-complete|applying)
      slice_plan=$(slice_plan_path "$slice")
      task_plan=$(task_plan_xml_path "$slice" "$task")
      assert_no_legacy_task_plan_markdown "$slice"
      require_file "$slice_plan" "slice plan" "$replan_hint"
      require_file "$task_plan" "task plan" "$replan_hint"
      ;;
    apply-complete)
      slice_plan=$(slice_plan_path "$slice")
      assert_no_legacy_task_plan_markdown "$slice"
      require_file "$slice_plan" "slice plan" "$replan_hint"
      require_matching_files "$GSD_DIR/${slice}-T*-PLAN.xml" "task plans" "$replan_hint"
      require_matching_files "$GSD_DIR/${slice}-T*-SUMMARY.md" "task summaries" "$reapply_hint"
      ;;
  esac
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

strip_task_file_annotation() {
  local value
  value=$(trim_whitespace "$1")
  value=$(printf '%s' "$value" | sed -E \
    's/[[:space:]]+\([^)]*\)$//;
     s/[[:space:]]+-[[:space:]].*$//;
     s/[[:space:]]+#[[:space:]].*$//;
     s/[[:space:]]+\/\/[[:space:]].*$//;
     s/^([^[:space:]]+):[[:space:]].*$/\1/')
  trim_whitespace "$value"
}

normalize_repo_path() {
  local path
  path=$(trim_whitespace "$1")

  while [[ "$path" == ./* ]]; do
    path="${path#./}"
  done

  case "$path" in
    ""|"."|".."|/*|~*|*/ ) return 1 ;;
  esac

  if [[ "$path" =~ (^|/)\.\.(/|$) ]]; then
    return 1
  fi

  printf '%s\n' "$path"
}

extract_task_name() {
  awk '
    /<name>/ {
      sub(/^.*<name>/, "")
      sub(/<\/name>.*$/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      if ($0 != "") {
        print
        exit
      }
    }
  ' "$1"
}

parse_task_plan_files() {
  local plan_path="$1"
  local raw_line
  local cleaned_line
  local normalized_path
  local found=0

  while IFS= read -r raw_line; do
    cleaned_line=$(printf '%s' "$raw_line" | sed -E 's/<!--.*-->//g')
    cleaned_line=$(trim_whitespace "$cleaned_line")

    [[ -z "$cleaned_line" ]] && continue

    case "$cleaned_line" in
      \#*|//*|*:) continue ;;
    esac

    cleaned_line=$(printf '%s' "$cleaned_line" | sed -E 's/^[-*][[:space:]]+//; s/^[0-9]+[.)][[:space:]]+//')
    cleaned_line=$(strip_task_file_annotation "$cleaned_line")

    [[ -z "$cleaned_line" ]] && continue

    normalized_path=$(normalize_repo_path "$cleaned_line") || return 1
    printf '%s\n' "$normalized_path"
    found=1
  done < <(
    awk '
      /<files>/ {
        in_files=1
        sub(/^.*<files>/, "")
      }
      in_files {
        if (/<\/files>/) {
          sub(/<\/files>.*$/, "")
          print
          exit
        }
        print
      }
    ' "$plan_path"
  )

  [[ "$found" -eq 1 ]]
}

extract_summary_status() {
  awk '
    /^##[[:space:]]+Status[[:space:]]*$/ {
      in_status=1
      next
    }
    /^##[[:space:]]+/ && in_status {
      exit
    }
    in_status {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      if ($0 != "") {
        print tolower($0)
        exit
      }
    }
  ' "$1"
}

path_in_list() {
  local needle="$1"
  shift

  local candidate
  for candidate in "$@"; do
    [[ "$candidate" == "$needle" ]] && return 0
  done

  return 1
}

collect_tracked_changes() {
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    git diff --name-only HEAD -- 2>/dev/null || true
  else
    git status --porcelain | awk '
      substr($0, 1, 2) != "??" {
        path = substr($0, 4)
        sub(/^.* -> /, "", path)
        if (path != "") {
          print path
        }
      }
    ' || true
  fi
}

collect_untracked_changes() {
  git ls-files --others --exclude-standard 2>/dev/null || true
}

is_auto_runtime_path() {
  case "$1" in
    "$GSD_DIR/auto.lock"|"$GSD_DIR/auto.log"|"$GSD_DIR/COSTS.jsonl") return 0 ;;
    *) return 1 ;;
  esac
}

CLASSIFIED_ALLOWED_TRACKED=()
CLASSIFIED_ALLOWED_UNTRACKED=()
CLASSIFIED_DISALLOWED_TRACKED=()
CLASSIFIED_DISALLOWED_UNTRACKED=()

reset_change_classification() {
  CLASSIFIED_ALLOWED_TRACKED=()
  CLASSIFIED_ALLOWED_UNTRACKED=()
  CLASSIFIED_DISALLOWED_TRACKED=()
  CLASSIFIED_DISALLOWED_UNTRACKED=()
}

classify_worktree_changes() {
  local allowlist=("$@")
  local tracked_changes=()
  local untracked_changes=()
  local path

  reset_change_classification

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    tracked_changes+=("$path")
  done < <(collect_tracked_changes)

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    untracked_changes+=("$path")
  done < <(collect_untracked_changes)

  if [[ ${#tracked_changes[@]} -gt 0 ]]; then
    for path in "${tracked_changes[@]}"; do
      [[ -z "$path" ]] && continue
      if is_auto_runtime_path "$path"; then
        continue
      fi
      if [[ ${#allowlist[@]} -gt 0 ]] && path_in_list "$path" "${allowlist[@]}"; then
        CLASSIFIED_ALLOWED_TRACKED+=("$path")
      else
        CLASSIFIED_DISALLOWED_TRACKED+=("$path")
      fi
    done
  fi

  if [[ ${#untracked_changes[@]} -gt 0 ]]; then
    for path in "${untracked_changes[@]}"; do
      [[ -z "$path" ]] && continue
      if is_auto_runtime_path "$path"; then
        continue
      fi
      if [[ ${#allowlist[@]} -gt 0 ]] && path_in_list "$path" "${allowlist[@]}"; then
        CLASSIFIED_ALLOWED_UNTRACKED+=("$path")
      else
        CLASSIFIED_DISALLOWED_UNTRACKED+=("$path")
      fi
    done
  fi
}

has_allowed_classified_changes() {
  [[ "${#CLASSIFIED_ALLOWED_TRACKED[@]}" -gt 0 || "${#CLASSIFIED_ALLOWED_UNTRACKED[@]}" -gt 0 ]]
}

has_disallowed_classified_changes() {
  [[ "${#CLASSIFIED_DISALLOWED_TRACKED[@]}" -gt 0 || "${#CLASSIFIED_DISALLOWED_UNTRACKED[@]}" -gt 0 ]]
}

log_paths() {
  local path
  for path in "$@"; do
    log "   - $path"
  done
}

warn_if_dirty_worktree() {
  local tracked_changes=()
  local untracked_changes=()
  local path

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    tracked_changes+=("$path")
  done < <(collect_tracked_changes)

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    untracked_changes+=("$path")
  done < <(collect_untracked_changes)

  if [[ "${#tracked_changes[@]}" -gt 0 || "${#untracked_changes[@]}" -gt 0 ]]; then
    log "⚠ Git worktree is already dirty."
    log "   Auto-mode will only create fallback commits when the remaining"
    log "   changes are limited to the current task's owned files."
  fi
}

run_apply_fallback_commit() {
  local slice="$1"
  local task="$2"
  local task_plan
  local summary_path
  local task_files_output
  local summary_status
  local task_name
  local commit_subject
  local commit_body
  local allowlist=()
  local stage_paths=()
  local path

  task_plan=$(task_plan_xml_path "$slice" "$task")
  summary_path="$GSD_DIR/${slice}-${task}-SUMMARY.md"

  if [[ ! -f "$task_plan" ]]; then
    log "❌ Fallback commit aborted: missing task plan $task_plan."
    log "   Auto-mode stops instead of guessing which files belong to ${slice}/${task}."
    return 1
  fi

  task_files_output=$(parse_task_plan_files "$task_plan") || {
    log "❌ Fallback commit aborted: could not parse <files> in $task_plan."
    log "   Auto-mode stops instead of guessing which files belong to ${slice}/${task}."
    return 1
  }

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if [[ ${#allowlist[@]} -eq 0 ]] || ! path_in_list "$path" "${allowlist[@]}"; then
      allowlist+=("$path")
    fi
  done <<< "$task_files_output"

  for path in "$summary_path" "$GSD_DIR/STATE.md"; do
    if [[ ${#allowlist[@]} -eq 0 ]] || ! path_in_list "$path" "${allowlist[@]}"; then
      allowlist+=("$path")
    fi
  done

  classify_worktree_changes "${allowlist[@]}"

  if ! has_allowed_classified_changes; then
    if has_disallowed_classified_changes; then
      log "ℹ No fallback commit needed for ${slice}/${task}; unrelated worktree changes remain untouched."
    fi
    return 0
  fi

  if has_disallowed_classified_changes; then
    log "❌ Fallback commit aborted: unrelated changes detected."
    log "   Current task: ${slice}/${task}"
    log "   Unrelated files:"
    if [[ ${#CLASSIFIED_DISALLOWED_TRACKED[@]} -gt 0 ]]; then
      log_paths "${CLASSIFIED_DISALLOWED_TRACKED[@]}"
    fi
    if [[ ${#CLASSIFIED_DISALLOWED_UNTRACKED[@]} -gt 0 ]]; then
      log_paths "${CLASSIFIED_DISALLOWED_UNTRACKED[@]}"
    fi
    log "   Resolve or stash unrelated worktree changes before restarting auto-mode."
    return 1
  fi

  if [[ ! -f "$summary_path" ]]; then
    log "❌ Fallback commit aborted: missing task summary $summary_path."
    log "   Auto-mode only fallback-commits tasks with a recorded complete status."
    return 1
  fi

  summary_status=$(extract_summary_status "$summary_path")
  if [[ "$summary_status" != "complete" ]]; then
    log "❌ Fallback commit aborted: ${summary_path} status is '${summary_status:-missing}'."
    log "   Auto-mode only fallback-commits tasks with status 'complete'."
    return 1
  fi

  task_name=$(extract_task_name "$task_plan")
  if [[ -z "$task_name" ]]; then
    log "❌ Fallback commit aborted: could not parse <name> in $task_plan."
    log "   Auto-mode stops instead of inventing a vague commit message."
    return 1
  fi

  if [[ ${#CLASSIFIED_ALLOWED_TRACKED[@]} -gt 0 ]]; then
    for path in "${CLASSIFIED_ALLOWED_TRACKED[@]}"; do
      stage_paths+=("$path")
    done
  fi

  if [[ ${#CLASSIFIED_ALLOWED_UNTRACKED[@]} -gt 0 ]]; then
    for path in "${CLASSIFIED_ALLOWED_UNTRACKED[@]}"; do
      stage_paths+=("$path")
    done
  fi

  for path in "${stage_paths[@]}"; do
    git add -- "$path"
  done

  if git diff --cached --quiet 2>/dev/null; then
    log "❌ Fallback commit aborted: no staged task-scoped changes were produced."
    log "   Inspect the git worktree before restarting auto-mode."
    return 1
  fi

  commit_subject="feat(${slice}/${task}): ${task_name}"
  commit_body=$'Auto-mode applied fallback Git handling after the task\ncompleted without creating its own commit.\n\nOnly task-scoped files from the plan, summary, and\nSTATE metadata were staged.'

  if ! git commit -m "$commit_subject" -m "$commit_body"; then
    log "❌ Fallback commit failed for ${slice}/${task}."
    log "   Inspect the git worktree before restarting auto-mode."
    return 1
  fi

  log "✓ Fallback committed task-scoped changes for ${slice}/${task}."
  log_paths "${stage_paths[@]}"
  return 0
}

# Acquire lock atomically using mkdir (atomic on all filesystems)
acquire_lock() {
  local lock_dir="${LOCK_FILE}.d"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    # Lock exists — check if holder is still alive
    if [[ -f "$LOCK_FILE" ]]; then
      local lock_pid
      lock_pid=$(jq -r '.pid // empty' "$LOCK_FILE" 2>/dev/null || true)
      if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
        echo "❌ Auto-mode is already running (PID $lock_pid)."
        exit 1
      fi
    fi
    # Stale lock — reclaim
    rm -rf "$lock_dir"
    mkdir "$lock_dir" 2>/dev/null || { echo "❌ Could not acquire lock."; exit 1; }
  fi
  echo "{\"unit\":\"${SLICE:-init}/${TASK:-init}\",\"phase\":\"${PHASE:-init}\",\"pid\":$$,\"started\":\"$(date -Iseconds)\"}" > "$LOCK_FILE"
}

release_lock() {
  rm -f "$LOCK_FILE"
  rm -rf "${LOCK_FILE}.d"
}

# Find the next slice that needs work (no PLAN or no UNIFY)
# Returns slice name (e.g. "S03") or empty if milestone is complete
find_next_slice() {
  local roadmap
  roadmap=$(ls "$GSD_DIR"/M*-ROADMAP.md 2>/dev/null | head -1)
  if [[ -z "$roadmap" ]]; then
    return
  fi

  # Extract slice IDs from roadmap (### S01, ### S02, etc.)
  grep -oE '### S[0-9]+' "$roadmap" | sed 's/### //' | while read -r slice; do
    if [[ ! -f "$GSD_DIR/${slice}-UNIFY.md" ]]; then
      echo "$slice"
      return
    fi
  done
}

# Dispatch a claude -p call with prompt from file, stderr captured to log
dispatch_claude() {
  local prompt_file="$1" result_file="$2" allowed_tools="$3" max_turns="$4" timeout_secs="$5"
  local stderr_file="/tmp/gsd-stderr-$$.log"

  timeout "$timeout_secs" "$CLAUDE_BIN" -p "$(cat "$prompt_file")" \
    --allowedTools "$allowed_tools" \
    --output-format json \
    --max-turns "$max_turns" > "$result_file" 2>"$stderr_file"
  local exit_code=$?

  # Append stderr to log if non-empty
  if [[ -s "$stderr_file" ]]; then
    log "stderr from claude -p:"
    cat "$stderr_file" >> "$LOG_FILE"
  fi

  return $exit_code
}

# ── Main loop ──────────────────────────────────────────────────────────────────

log "▶ GSD-CC Auto-Mode starting..."
log "  Budget: ${BUDGET:-unlimited} tokens"
echo ""

# Acquire lock before entering the loop
PHASE=$(read_state_field "phase")
SLICE=$(read_state_field "current_slice")
TASK=$(read_state_field "current_task")
AUTO_SCOPE_RAW=$(read_optional_state_field "auto_mode_scope")
AUTO_SCOPE_MISSING=0
if [[ -z "$AUTO_SCOPE_RAW" ]]; then
  AUTO_SCOPE_MISSING=1
fi
if ! AUTO_SCOPE=$(normalize_auto_scope "$AUTO_SCOPE_RAW"); then
  fail_validation "Unsupported auto_mode_scope: $AUTO_SCOPE_RAW" \
    "Use 'slice' or 'milestone' in .gsd/STATE.md."
fi
START_SLICE="$SLICE"
validate_phase_artifacts "$PHASE" "$SLICE" "$TASK"
acquire_lock
warn_if_dirty_worktree

log "  Scope: $AUTO_SCOPE"
log "  Starting slice: $START_SLICE"
if [[ "$AUTO_SCOPE_MISSING" -eq 1 ]]; then
  log "⚠ auto_mode_scope is missing; defaulting to slice mode."
  log "   Choose Auto (full milestone) through /gsd-cc to run beyond one slice."
fi

RETRY_COUNT=0
MAX_RETRIES=2

while true; do
  # ── 1. Read state ──────────────────────────────────────────────────────────

  PHASE=$(read_state_field "phase")
  SLICE=$(read_state_field "current_slice")
  TASK=$(read_state_field "current_task")
  RIGOR=$(read_state_field "rigor")
  MILESTONE=$(read_state_field "milestone")

  if [[ "$AUTO_SCOPE" == "slice" && "$SLICE" != "$START_SLICE" ]]; then
    log "Auto (this slice) complete for $START_SLICE."
    log "   Refusing to continue with $SLICE in slice scope."
    break
  fi

  validate_phase_artifacts "$PHASE" "$SLICE" "$TASK"

  # ── 2. UNIFY enforcement ───────────────────────────────────────────────────

  if [[ "$PHASE" == "apply-complete" ]]; then
    UNIFY_FILE="$GSD_DIR/${SLICE}-UNIFY.md"
    if [[ ! -f "$UNIFY_FILE" ]]; then
      log "⚠ Running mandatory UNIFY for $SLICE..."

      # Build UNIFY prompt
      PROMPT_FILE="/tmp/gsd-prompt-$$.txt"
      echo "<state>" > "$PROMPT_FILE"
      cat "$GSD_DIR/STATE.md" >> "$PROMPT_FILE"
      echo "</state>" >> "$PROMPT_FILE"

      # Include slice plan
      if [[ -f "$(slice_plan_path "$SLICE")" ]]; then
        echo "<slice-plan>" >> "$PROMPT_FILE"
        cat "$(slice_plan_path "$SLICE")" >> "$PROMPT_FILE"
        echo "</slice-plan>" >> "$PROMPT_FILE"
      fi

      # Include all task plans for this slice
      TASK_PLAN_FILES=()
      while IFS= read -r task_plan_file; do
        [[ -z "$task_plan_file" ]] && continue
        TASK_PLAN_FILES+=("$task_plan_file")
      done < <(find_matching_files "$GSD_DIR/${SLICE}-T*-PLAN.xml")
      echo "<task-plans>" >> "$PROMPT_FILE"
      if [[ ${#TASK_PLAN_FILES[@]} -gt 0 ]]; then
        for f in "${TASK_PLAN_FILES[@]}"; do
          cat "$f" >> "$PROMPT_FILE"
        done
      fi
      echo "</task-plans>" >> "$PROMPT_FILE"

      # Include all summaries for this slice
      SUMMARY_FILES=()
      while IFS= read -r summary_file; do
        [[ -z "$summary_file" ]] && continue
        SUMMARY_FILES+=("$summary_file")
      done < <(find_matching_files "$GSD_DIR/${SLICE}-T*-SUMMARY.md")
      echo "<summaries>" >> "$PROMPT_FILE"
      if [[ ${#SUMMARY_FILES[@]} -gt 0 ]]; then
        for f in "${SUMMARY_FILES[@]}"; do
          cat "$f" >> "$PROMPT_FILE"
        done
      fi
      echo "</summaries>" >> "$PROMPT_FILE"

      # Include decisions
      if [[ -f "$GSD_DIR/DECISIONS.md" ]]; then
        echo "<decisions>" >> "$PROMPT_FILE"
        cat "$GSD_DIR/DECISIONS.md" >> "$PROMPT_FILE"
        echo "</decisions>" >> "$PROMPT_FILE"
      fi

      cat "$PROMPTS_DIR/unify-instructions.txt" >> "$PROMPT_FILE"

      RESULT_FILE="/tmp/gsd-result-$$.json"
      dispatch_claude "$PROMPT_FILE" "$RESULT_FILE" \
        "Read,Write,Edit,Glob,Grep,Bash(git checkout *),Bash(git merge *),Bash(git commit *)" \
        15 600 || {
        log "❌ UNIFY dispatch failed. Check $LOG_FILE for details."
        break
      }

      log_cost "$SLICE" "unify" "$RESULT_FILE"

      if [[ "$AUTO_SCOPE" == "slice" ]]; then
        log "✓ UNIFY complete for $START_SLICE."
        log "Auto (this slice) complete for $START_SLICE."
        break
      fi

      # ── REASSESS after UNIFY ──────────────────────────────────────────────
      log "▶ Running REASSESS after $SLICE..."

      PROMPT_FILE="/tmp/gsd-prompt-$$.txt"
      echo "<state>" > "$PROMPT_FILE"
      cat "$GSD_DIR/STATE.md" >> "$PROMPT_FILE"
      echo "</state>" >> "$PROMPT_FILE"

      [[ -f "$GSD_DIR/PROJECT.md" ]] && { echo "<project>"; cat "$GSD_DIR/PROJECT.md"; echo "</project>"; } >> "$PROMPT_FILE"

      for f in "$GSD_DIR"/M*-ROADMAP.md; do
        [[ -f "$f" ]] && { echo "<roadmap>"; cat "$f"; echo "</roadmap>"; } >> "$PROMPT_FILE"
      done

      [[ -f "$GSD_DIR/DECISIONS.md" ]] && { echo "<decisions>"; cat "$GSD_DIR/DECISIONS.md"; echo "</decisions>"; } >> "$PROMPT_FILE"

      # Include all UNIFY files as history
      echo "<unify-history>" >> "$PROMPT_FILE"
      for f in "$GSD_DIR"/S*-UNIFY.md; do
        [[ -f "$f" ]] && cat "$f" >> "$PROMPT_FILE"
      done
      echo "</unify-history>" >> "$PROMPT_FILE"

      cat "$PROMPTS_DIR/reassess-instructions.txt" >> "$PROMPT_FILE"

      RESULT_FILE="/tmp/gsd-result-$$.json"
      dispatch_claude "$PROMPT_FILE" "$RESULT_FILE" \
        "Read,Write,Edit,Glob,Grep" \
        10 300 || {
        log "⚠ REASSESS dispatch failed (non-critical). Continuing..."
      }

      log_cost "$SLICE" "reassess" "$RESULT_FILE"
      log "✓ UNIFY + REASSESS complete for $SLICE."
      continue
    fi
  fi

  # ── 3. Determine next unit ─────────────────────────────────────────────────

  # Check if milestone is complete (all slices unified)
  if [[ "$AUTO_SCOPE" == "slice" && "$PHASE" == "unified" ]]; then
    log "Auto (this slice) complete for $START_SLICE."
    log "   Run /gsd-cc to review and choose the next step."
    break
  fi

  if [[ "$PHASE" == "unified" ]]; then
    NEXT_SLICE=$(find_next_slice)

    if [[ -z "$NEXT_SLICE" ]]; then
      echo ""
      log "✅ Milestone $MILESTONE complete. All slices planned, executed, and unified."
      break
    fi

    SLICE="$NEXT_SLICE"
    TASK="T01"

    # Determine phase for next slice
    if [[ -f "$GSD_DIR/${SLICE}-PLAN.md" ]]; then
      NEXT_PHASE="plan-complete"
    else
      NEXT_PHASE="plan"
    fi

    validate_phase_artifacts "$NEXT_PHASE" "$SLICE" "$TASK"
    PHASE="$NEXT_PHASE"
    update_state_field "current_slice" "$SLICE"
    update_state_field "phase" "$PHASE"
    update_state_field "current_task" "$TASK"
    log "▶ Moving to next slice: $SLICE ($PHASE)"
  fi

  # ── 4. Budget check ────────────────────────────────────────────────────────

  if [[ "$BUDGET" -gt 0 ]] && [[ -f "$COSTS_FILE" ]]; then
    TOTAL=$(jq -s '[.[].usage // {} | (.input_tokens // 0) + (.output_tokens // 0)] | add // 0' "$COSTS_FILE" 2>/dev/null || echo 0)
    if [[ "$TOTAL" -gt "$BUDGET" ]]; then
      echo ""
      log "💰 Budget reached (${TOTAL} tokens). Stopping auto-mode."
      break
    fi
  fi

  # ── 5. Update lock file ─────────────────────────────────────────────────────

  echo "{\"unit\":\"${SLICE}/${TASK}\",\"phase\":\"${PHASE}\",\"pid\":$$,\"started\":\"$(date -Iseconds)\"}" > "$LOCK_FILE"

  # ── 6. Build prompt ────────────────────────────────────────────────────────

  PROMPT_FILE="/tmp/gsd-prompt-$$.txt"
  echo "<state>" > "$PROMPT_FILE"
  cat "$GSD_DIR/STATE.md" >> "$PROMPT_FILE"
  echo "</state>" >> "$PROMPT_FILE"

  case "$PHASE" in
    plan|roadmap-complete|seed-complete|discuss-complete)
      # Planning phase: include project, roadmap, decisions
      [[ -f "$GSD_DIR/PROJECT.md" ]] && { echo "<project>"; cat "$GSD_DIR/PROJECT.md"; echo "</project>"; } >> "$PROMPT_FILE"

      for f in "$GSD_DIR"/M*-ROADMAP.md; do
        [[ -f "$f" ]] && { echo "<roadmap>"; cat "$f"; echo "</roadmap>"; } >> "$PROMPT_FILE"
      done

      [[ -f "$GSD_DIR/DECISIONS.md" ]] && { echo "<decisions>"; cat "$GSD_DIR/DECISIONS.md"; echo "</decisions>"; } >> "$PROMPT_FILE"

      # Include context if it exists
      [[ -f "$GSD_DIR/${SLICE}-CONTEXT.md" ]] && { echo "<context>"; cat "$GSD_DIR/${SLICE}-CONTEXT.md"; echo "</context>"; } >> "$PROMPT_FILE"

      cat "$PROMPTS_DIR/plan-instructions.txt" >> "$PROMPT_FILE"
      DISPATCH_PHASE="plan"
      ;;

    plan-complete|applying)
      # Execution phase: include task plan, slice plan, decisions, prior summaries
      TASK_PLAN="$(task_plan_xml_path "$SLICE" "$TASK")"
      SLICE_PLAN="$(slice_plan_path "$SLICE")"

      [[ -f "$TASK_PLAN" ]] && { echo "<task-plan>"; cat "$TASK_PLAN"; echo "</task-plan>"; } >> "$PROMPT_FILE"
      [[ -f "$SLICE_PLAN" ]] && { echo "<slice-plan>"; cat "$SLICE_PLAN"; echo "</slice-plan>"; } >> "$PROMPT_FILE"
      [[ -f "$GSD_DIR/DECISIONS.md" ]] && { echo "<decisions>"; cat "$GSD_DIR/DECISIONS.md"; echo "</decisions>"; } >> "$PROMPT_FILE"

      # Prior task summaries for context
      for f in "$GSD_DIR/${SLICE}"-T*-SUMMARY.md; do
        [[ -f "$f" ]] && { echo "<prior-summary>"; cat "$f"; echo "</prior-summary>"; } >> "$PROMPT_FILE"
      done

      cat "$PROMPTS_DIR/apply-instructions.txt" >> "$PROMPT_FILE"
      DISPATCH_PHASE="apply"
      ;;

    *)
      log "⚠ Unknown phase: $PHASE. Stopping."
      break
      ;;
  esac

  # ── 7. Rigor-based timeouts ────────────────────────────────────────────────

  case "$RIGOR" in
    tight)    MAX_TURNS=15; TIMEOUT=300 ;;
    standard) MAX_TURNS=25; TIMEOUT=600 ;;
    deep)     MAX_TURNS=40; TIMEOUT=1200 ;;
    creative) MAX_TURNS=30; TIMEOUT=900 ;;
    *)        MAX_TURNS=25; TIMEOUT=600 ;;
  esac

  # ── 8. Dispatch ────────────────────────────────────────────────────────────

  log "▶ ${SLICE}/${TASK} (${DISPATCH_PHASE})..."

  RESULT_FILE="/tmp/gsd-result-$$.json"

  if [[ "$DISPATCH_PHASE" == "plan" ]]; then
    ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,Bash(git checkout *),Bash(git branch *),Bash(git add *),Bash(git commit *)"
  else
    ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,Bash(npm *),Bash(npx *),Bash(git add *),Bash(git commit *),Bash(node *),Bash(python3 *)"
  fi

  dispatch_claude "$PROMPT_FILE" "$RESULT_FILE" "$ALLOWED_TOOLS" "$MAX_TURNS" "$TIMEOUT" || {
    EXIT_CODE=$?
    if [[ $EXIT_CODE -eq 124 ]]; then
      log "⏰ Timeout after ${TIMEOUT}s on ${SLICE}/${TASK}. Stopping."
    else
      log "❌ Dispatch failed (exit $EXIT_CODE) on ${SLICE}/${TASK}. Check $LOG_FILE for stderr."
    fi
    log_cost "${SLICE}/${TASK}" "$DISPATCH_PHASE" "$RESULT_FILE"
    break
  }

  # ── 9. Log costs ──────────────────────────────────────────────────────────

  log_cost "${SLICE}/${TASK}" "$DISPATCH_PHASE" "$RESULT_FILE"

  # ── 10. Update state ──────────────────────────────────────────────────────

  update_state_field "last_updated" "$(date -Iseconds)"

  # ── 11. Stuck detection ────────────────────────────────────────────────────

  if [[ "$DISPATCH_PHASE" == "apply" ]]; then
    EXPECTED_SUMMARY="$GSD_DIR/${SLICE}-${TASK}-SUMMARY.md"
    if [[ ! -f "$EXPECTED_SUMMARY" ]]; then
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [[ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]]; then
        log "🔄 ${SLICE}/${TASK} stuck after $MAX_RETRIES attempts. Stopping."
        break
      fi
      log "⚠ Expected $EXPECTED_SUMMARY not found. Retry $RETRY_COUNT/$MAX_RETRIES..."
      continue
    fi
    RETRY_COUNT=0
  fi

  if [[ "$DISPATCH_PHASE" == "plan" ]]; then
    EXPECTED_PLAN="$GSD_DIR/${SLICE}-PLAN.md"
    if [[ ! -f "$EXPECTED_PLAN" ]]; then
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [[ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]]; then
        log "🔄 Planning ${SLICE} stuck after $MAX_RETRIES attempts. Stopping."
        break
      fi
      log "⚠ Expected $EXPECTED_PLAN not found. Retry $RETRY_COUNT/$MAX_RETRIES..."
      continue
    fi
    RETRY_COUNT=0
  fi

  # ── 12. Git fallback (apply only) ──────────────────────────────────────────

  if [[ "$DISPATCH_PHASE" == "apply" ]]; then
    if ! run_apply_fallback_commit "$SLICE" "$TASK"; then
      log "🛑 Stopping auto-mode so the git worktree can be inspected safely."
      break
    fi
  fi

  # ── 13. Release lock ──────────────────────────────────────────────────────

  release_lock

  log "✓ ${SLICE}/${TASK} complete."

  # ── 14. Rate limiting ─────────────────────────────────────────────────────

  sleep 2

done

# ── Cleanup ────────────────────────────────────────────────────────────────────

release_lock
echo ""
log "Auto-mode finished."
