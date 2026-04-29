# GSD-CC auto-mode recovery helpers.
# Sourced by auto-loop.sh; every function must be safe under strict Bash.

AUTO_RECOVERY_WRITTEN=0

auto_recovery_gsd_available() {
  [[ -n "${GSD_DIR:-}" && -d "$GSD_DIR" ]]
}

auto_recovery_markdown_path() {
  printf '%s/AUTO-RECOVERY.md\n' "$GSD_DIR"
}

auto_recovery_json_path() {
  printf '%s/auto-recovery.json\n' "$GSD_DIR"
}

auto_recovery_clear() {
  AUTO_RECOVERY_WRITTEN=0

  if ! auto_recovery_gsd_available; then
    return 0
  fi

  rm -f "$(auto_recovery_markdown_path)" "$(auto_recovery_json_path)"
}

auto_recovery_read_state_field() {
  local field="$1"

  if [[ ! -f "${GSD_DIR:-}/STATE.md" ]]; then
    return 0
  fi

  grep "^$field:" "$GSD_DIR/STATE.md" | head -1 | sed "s/^$field:[[:space:]]*//" || true
}

auto_recovery_git_available() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

auto_recovery_current_branch() {
  if ! auto_recovery_git_available; then
    return 0
  fi

  git branch --show-current 2>/dev/null || true
}

auto_recovery_current_head() {
  if ! auto_recovery_git_available; then
    return 0
  fi

  git rev-parse --short HEAD 2>/dev/null || true
}

auto_recovery_collect_commits() {
  if ! auto_recovery_git_available || [[ -z "${AUTO_RUN_START_HEAD:-}" ]]; then
    return 0
  fi

  git log --oneline "${AUTO_RUN_START_HEAD}..HEAD" 2>/dev/null || true
}

auto_recovery_collect_status() {
  if ! auto_recovery_git_available; then
    return 0
  fi

  git status --porcelain 2>/dev/null || true
}

auto_recovery_collect_uncommitted_files() {
  if ! auto_recovery_git_available; then
    return 0
  fi

  {
    auto_recovery_collect_status | awk '
      substr($0, 1, 2) != "??" {
        path = substr($0, 4)
        sub(/^.* -> /, "", path)
        if (path != "") {
          print path
        }
      }
    '
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | awk '
    !seen[$0] {
      seen[$0] = 1
      path = substr($0, 4)
      if (substr($0, 1, 3) == "?? ") {
        sub(/^.* -> /, "", path)
        print path
      } else if ($0 != "") {
        print $0
      }
    }
  '
}

auto_recovery_json_lines() {
  if command -v jq >/dev/null 2>&1; then
    jq -R -s 'split("\n") | map(select(length > 0))'
  else
    printf '[]\n'
  fi
}

auto_recovery_capture_start() {
  AUTO_RUN_STARTED_AT="${AUTO_RUN_STARTED_AT:-$(iso_now)}"
  AUTO_RUN_START_BRANCH="$(auto_recovery_current_branch)"
  AUTO_RUN_START_HEAD="$(auto_recovery_current_head)"
}

auto_recovery_print_lines_or_none() {
  local content="$1"

  if [[ -z "$content" ]]; then
    printf '%s\n' '- None detected.'
    return 0
  fi

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    printf '%s\n' "- $line"
  done <<< "$content"
}

auto_recovery_write() {
  local reason="$1"
  local message="$2"
  local safe_next_action="${3:-Inspect the report, resolve any listed worktree changes, then run /gsd-cc.}"

  local markdown_path
  local json_path
  local stopped_at
  local scope
  local milestone
  local slice
  local task
  local unit
  local phase
  local dispatch_phase
  local current_branch
  local current_head
  local commits
  local status_lines
  local uncommitted_files
  local commits_json
  local uncommitted_json

  if [[ "${AUTO_RECOVERY_WRITTEN:-0}" == "1" ]]; then
    return 0
  fi

  if ! auto_recovery_gsd_available; then
    return 0
  fi

  AUTO_RECOVERY_WRITTEN=1

  markdown_path="$(auto_recovery_markdown_path)"
  json_path="$(auto_recovery_json_path)"
  stopped_at="$(iso_now)"
  scope="${AUTO_SCOPE:-$(auto_recovery_read_state_field "auto_mode_scope")}"
  milestone="${MILESTONE:-$(auto_recovery_read_state_field "milestone")}"
  slice="${SLICE:-$(auto_recovery_read_state_field "current_slice")}"
  task="${TASK:-$(auto_recovery_read_state_field "current_task")}"
  unit="${slice:-unknown}/${task:-unknown}"
  phase="${PHASE:-$(auto_recovery_read_state_field "phase")}"
  dispatch_phase="${DISPATCH_PHASE:-}"
  current_branch="$(auto_recovery_current_branch)"
  current_head="$(auto_recovery_current_head)"
  commits="$(auto_recovery_collect_commits)"
  status_lines="$(auto_recovery_collect_status)"
  uncommitted_files="$(auto_recovery_collect_uncommitted_files)"
  commits_json="$(printf '%s\n' "$commits" | auto_recovery_json_lines)"
  uncommitted_json="$(printf '%s\n' "$uncommitted_files" | auto_recovery_json_lines)"

  if command -v jq >/dev/null 2>&1; then
    jq -n \
      --arg status "problem" \
      --arg reason "$reason" \
      --arg message "$message" \
      --arg scope "$scope" \
      --arg unit "$unit" \
      --arg phase "$phase" \
      --arg dispatch_phase "$dispatch_phase" \
      --arg started_at "${AUTO_RUN_STARTED_AT:-}" \
      --arg stopped_at "$stopped_at" \
      --arg start_branch "${AUTO_RUN_START_BRANCH:-}" \
      --arg current_branch "$current_branch" \
      --arg start_head "${AUTO_RUN_START_HEAD:-}" \
      --arg current_head "$current_head" \
      --argjson commits_since_start "$commits_json" \
      --argjson uncommitted_files "$uncommitted_json" \
      --arg log_file "$LOG_FILE" \
      --arg safe_next_action "$safe_next_action" \
      '{
        status: $status,
        reason: $reason,
        message: $message,
        scope: $scope,
        unit: $unit,
        phase: $phase,
        dispatch_phase: $dispatch_phase,
        started_at: $started_at,
        stopped_at: $stopped_at,
        start_branch: $start_branch,
        current_branch: $current_branch,
        start_head: $start_head,
        current_head: $current_head,
        commits_since_start: $commits_since_start,
        uncommitted_files: $uncommitted_files,
        log_file: $log_file,
        safe_next_action: $safe_next_action
      }' > "$json_path" 2>/dev/null || true
  fi

  {
    printf '%s\n\n' '# Auto-Mode Recovery'
    printf '%s\n\n' 'Auto-mode stopped before completing normally.'
    printf '%s\n' '## What Was Running'
    printf '%s\n' "- Scope: ${scope:-unknown}"
    printf '%s\n' "- Milestone: ${milestone:-unknown}"
    printf '%s\n' "- Slice: ${slice:-unknown}"
    printf '%s\n' "- Task: ${task:-unknown}"
    printf '%s\n' "- Phase: ${phase:-unknown}"
    printf '%s\n\n' "- Dispatch phase: ${dispatch_phase:-unknown}"

    printf '%s\n' '## Why It Stopped'
    printf '%s\n' "- Reason: $reason"
    printf '%s\n\n' "- Message: $message"

    printf '%s\n' '## What Changed'
    if [[ -z "$status_lines" ]]; then
      printf '%s\n\n' '- No uncommitted Git changes detected.'
    else
      printf '%s\n' '```text'
      printf '%s\n' "$status_lines"
      printf '%s\n\n' '```'
    fi

    printf '%s\n' '## Commits Since Auto-Mode Started'
    auto_recovery_print_lines_or_none "$commits"
    printf '\n'

    printf '%s\n' '## Remaining Uncommitted Files'
    auto_recovery_print_lines_or_none "$uncommitted_files"
    printf '\n'

    printf '%s\n' '## Logs'
    printf '%s\n\n' "- Detailed log: \`$LOG_FILE\`"

    printf '%s\n' '## Safest Next Action'
    printf '%s\n' "$safe_next_action"
  } > "$markdown_path" 2>/dev/null || true

  if declare -F auto_event_recovery_written >/dev/null 2>&1; then
    auto_event_recovery_written \
      "reason=$reason" \
      "artifact=$markdown_path" \
      "markdown=$markdown_path" \
      "json=$json_path" \
      "log_file=$LOG_FILE" \
      "safe_next_action=$safe_next_action"
  fi
}
