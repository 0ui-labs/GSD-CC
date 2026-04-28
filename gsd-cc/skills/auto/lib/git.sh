# GSD-CC auto-mode Git safety helpers.

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

is_inside_git_worktree() {
  [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null || true)" == "true" ]]
}

normalize_branch_value() {
  local value
  value=$(trim_whitespace "${1:-}")
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"

  case "$value" in
    ""|"-"|"—") return 0 ;;
  esac

  printf '%s\n' "$value"
}

local_branch_exists() {
  local branch="$1"
  git show-ref --verify --quiet "refs/heads/$branch"
}

validate_base_branch_name() {
  local branch="$1"
  git check-ref-format --branch "$branch" >/dev/null 2>&1
}

current_branch_is_gsd_slice() {
  case "$1" in
    gsd/M*/S*) return 0 ;;
    *) return 1 ;;
  esac
}

detect_base_branch() {
  local candidate
  local current_branch
  local remote_head
  local common_branch

  candidate=$(normalize_branch_value "$(read_optional_state_field "base_branch")")
  if [[ -n "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate=$(normalize_branch_value "$(read_config_field "base_branch")")
  if [[ -n "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate=$(normalize_branch_value "${GSD_CC_BASE_BRANCH:-}")
  if [[ -n "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  remote_head=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)
  remote_head="${remote_head#origin/}"
  candidate=$(normalize_branch_value "$remote_head")
  if [[ -n "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  current_branch=$(git branch --show-current 2>/dev/null || true)
  candidate=$(normalize_branch_value "$current_branch")
  if [[ -n "$candidate" ]] && ! current_branch_is_gsd_slice "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  for common_branch in main master trunk develop; do
    if local_branch_exists "$common_branch"; then
      printf '%s\n' "$common_branch"
      return 0
    fi
  done

  return 1
}

ensure_base_branch_recorded() {
  local base_branch

  if ! is_inside_git_worktree; then
    return 0
  fi

  base_branch=$(detect_base_branch) || {
    fail_validation "Could not detect a Git base branch." \
      "Set base_branch in .gsd/STATE.md or export GSD_CC_BASE_BRANCH."
  }

  if ! validate_base_branch_name "$base_branch"; then
    fail_validation "Invalid base_branch: $base_branch" \
      "Use a valid local branch name, for example main, master, trunk, or develop."
  fi

  upsert_state_field "base_branch" "$base_branch"
  printf '%s\n' "$base_branch"
}

assert_clean_for_branch_switch() {
  local allowlist=("$@")

  classify_worktree_changes "${allowlist[@]}"
  if ! has_disallowed_classified_changes; then
    return 0
  fi

  log "❌ Cannot prepare planning branch: worktree has unrelated changes."
  log "   Commit, stash, or clean these paths before auto-mode switches branches:"
  if [[ ${#CLASSIFIED_DISALLOWED_TRACKED[@]} -gt 0 ]]; then
    log_paths "${CLASSIFIED_DISALLOWED_TRACKED[@]}"
  fi
  if [[ ${#CLASSIFIED_DISALLOWED_UNTRACKED[@]} -gt 0 ]]; then
    log_paths "${CLASSIFIED_DISALLOWED_UNTRACKED[@]}"
  fi
  return 1
}

switch_to_branch() {
  local branch="$1"

  git switch "$branch" 2>/dev/null || git checkout "$branch"
}

create_branch_from_current() {
  local branch="$1"

  git switch -c "$branch" 2>/dev/null || git checkout -b "$branch"
}

prepare_planning_branch() {
  local milestone="$1"
  local slice="$2"
  local base_branch
  local slice_branch

  if ! is_inside_git_worktree; then
    log "⚠ Not inside a Git worktree; skipping base branch preparation."
    return 0
  fi

  base_branch=$(ensure_base_branch_recorded)
  if [[ -z "$base_branch" ]]; then
    return 0
  fi

  if ! local_branch_exists "$base_branch"; then
    fail_validation "Configured base_branch '$base_branch' does not exist locally." \
      "Create or fetch the local base branch before planning a slice."
  fi

  if ! assert_clean_for_branch_switch "$GSD_DIR/STATE.md"; then
    exit 1
  fi

  slice_branch="gsd/${milestone}/${slice}"

  if local_branch_exists "$slice_branch"; then
    if ! git merge-base --is-ancestor "$base_branch" "$slice_branch" 2>/dev/null; then
      fail_validation "Existing slice branch '$slice_branch' is not based on '$base_branch'." \
        "Inspect the branch ancestry before continuing planning."
    fi
    switch_to_branch "$slice_branch"
  else
    switch_to_branch "$base_branch"
    create_branch_from_current "$slice_branch"
  fi

  log "  Base branch: $base_branch"
  log "  Slice branch: $slice_branch"
}

run_apply_fallback_commit() {
  local slice="$1"
  local task="$2"
  local task_plan
  local summary_path
  local task_files_output
  local summary_status
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

  commit_subject="feat(${slice}/${task}): apply task"
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
