#!/bin/bash
# GSD-CC Auto-Mode Loop
# The only piece of "code" in GSD-CC. Everything else is Skills (Markdown) and State (.gsd/ files).
#
# Usage: bash auto-loop.sh [--budget <tokens>]
# Requires: claude CLI, jq, git

set -euo pipefail

AUTO_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/runtime.sh"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/events.sh"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/recovery.sh"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/state.sh"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/task-plan.sh"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/git.sh"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/allowlist.sh"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/approval.sh"
# shellcheck source=/dev/null
source "$AUTO_SCRIPT_DIR/lib/dispatch.sh"

setup_timeout
resolve_claude_bin

# ── Configuration ──────────────────────────────────────────────────────────────

GSD_DIR=".gsd"
LOCK_FILE="$GSD_DIR/auto.lock"
COSTS_FILE="$GSD_DIR/COSTS.jsonl"
LOG_FILE="$GSD_DIR/auto.log"
BUDGET="${GSD_CC_BUDGET:-0}" # 0 = unlimited

resolve_skills_dir

# Parse --budget flag
while [[ $# -gt 0 ]]; do
  case "$1" in
    --budget) BUDGET="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

require_auto_dependencies
setup_logging
auto_recovery_clear
AUTO_RUN_STARTED_AT="$(iso_now)"
auto_recovery_capture_start
trap cleanup EXIT
trap 'auto_recovery_write "interrupted" "Auto-mode was interrupted by a signal." "Inspect .gsd/AUTO-RECOVERY.md, then run /gsd-cc to resume safely."; exit 130' INT
trap 'auto_recovery_write "interrupted" "Auto-mode was terminated by a signal." "Inspect .gsd/AUTO-RECOVERY.md, then run /gsd-cc to resume safely."; exit 143' TERM

record_auto_problem_stop() {
  local reason="$1"
  local message="$2"
  local safe_next_action="${3:-Inspect .gsd/AUTO-RECOVERY.md, resolve the listed issue, then run /gsd-cc.}"

  auto_recovery_write "$reason" "$message" "$safe_next_action"
}

# ── Main loop ──────────────────────────────────────────────────────────────────

if ! STATE_MACHINE_FILE=$(state_machine_path); then
  fail_validation "STATE_MACHINE.json not found." \
    "Reinstall GSD-CC or restore gsd-cc/templates/STATE_MACHINE.json."
fi

log "▶ GSD-CC Auto-Mode starting..."
log "  Budget: ${BUDGET:-unlimited} tokens"
echo ""

# Acquire lock before entering the loop
PHASE=$(read_optional_state_field "phase")
SLICE=$(read_optional_state_field "current_slice")
TASK=$(read_optional_state_field "current_task")
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
validate_current_state
ensure_auto_phase_ready "$PHASE"
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
AUTO_EVENT_LAST_SLICE=""

emit_slice_started_once() {
  if [[ -z "${SLICE:-}" || "$SLICE" == "-" || "$SLICE" == "—" ]]; then
    return 0
  fi

  if [[ "$AUTO_EVENT_LAST_SLICE" == "$SLICE" ]]; then
    return 0
  fi

  AUTO_EVENT_LAST_SLICE="$SLICE"
  auto_event_slice_started "scope=$AUTO_SCOPE"
}

auto_event_auto_started "scope=$AUTO_SCOPE" "budget=$BUDGET"

while true; do
  # ── 1. Read state ──────────────────────────────────────────────────────────

  PHASE=$(read_optional_state_field "phase")
  SLICE=$(read_optional_state_field "current_slice")
  TASK=$(read_optional_state_field "current_task")
  RIGOR=$(read_optional_state_field "rigor")
  MILESTONE=$(read_optional_state_field "milestone")
  DISPATCH_PHASE=""
  TASK_ATTEMPT=1

  if [[ "$AUTO_SCOPE" == "slice" && "$SLICE" != "$START_SLICE" ]]; then
    log "Auto (this slice) complete for $START_SLICE."
    log "   Refusing to continue with $SLICE in slice scope."
    break
  fi

  validate_current_state
  ensure_auto_phase_ready "$PHASE"
  emit_slice_started_once
  auto_event_phase_started "scope=$AUTO_SCOPE"

  # ── 2. UNIFY enforcement ───────────────────────────────────────────────────

  if [[ "$PHASE" == "apply-complete" ]]; then
    ensure_base_branch_recorded >/dev/null
    UNIFY_FILE="$GSD_DIR/${SLICE}-UNIFY.md"
    if [[ ! -f "$UNIFY_FILE" ]]; then
      log "⚠ Running mandatory UNIFY for $SLICE..."
      DISPATCH_PHASE="unify"

      # Build UNIFY prompt
      PROMPT_FILE="$(runtime_tmp_file "gsd-prompt-$$.txt")"
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

      if [[ -f "$GSD_DIR/APPROVALS.jsonl" ]]; then
        echo "<approvals>" >> "$PROMPT_FILE"
        cat "$GSD_DIR/APPROVALS.jsonl" >> "$PROMPT_FILE"
        echo "</approvals>" >> "$PROMPT_FILE"
      fi

      cat "$PROMPTS_DIR/unify-instructions.txt" >> "$PROMPT_FILE"

      RESULT_FILE="$(runtime_tmp_file "gsd-result-$$.json")"
      auto_event_dispatch_started "scope=$AUTO_SCOPE" "dispatch_phase=$DISPATCH_PHASE"
      dispatch_claude "$PROMPT_FILE" "$RESULT_FILE" \
        "Read,Write,Edit,Glob,Grep,Bash(git switch *),Bash(git checkout *),Bash(git merge *),Bash(git commit *)" \
        15 600 || {
        auto_event_dispatch_failed "scope=$AUTO_SCOPE" "dispatch_phase=$DISPATCH_PHASE" "exit_code=$?"
        log "❌ UNIFY dispatch failed. Check $LOG_FILE for details."
        record_auto_problem_stop "dispatch_failed" \
          "UNIFY dispatch failed for $SLICE." \
          "Inspect $LOG_FILE and .gsd/AUTO-RECOVERY.md, then run /gsd-cc to resume."
        break
      }

      log_cost "$SLICE" "unify" "$RESULT_FILE"
      validate_current_state "$PHASE"
      auto_event_phase_completed "scope=$AUTO_SCOPE" "dispatch_phase=$DISPATCH_PHASE"

      if [[ "$AUTO_SCOPE" == "slice" ]]; then
        log "✓ UNIFY complete for $START_SLICE."
        log "Auto (this slice) complete for $START_SLICE."
        break
      fi

      PHASE=$(read_optional_state_field "phase")

      # ── REASSESS after UNIFY ──────────────────────────────────────────────
      log "▶ Running REASSESS after $SLICE..."

      PROMPT_FILE="$(runtime_tmp_file "gsd-prompt-$$.txt")"
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

      RESULT_FILE="$(runtime_tmp_file "gsd-result-$$.json")"
      DISPATCH_PHASE="reassess"
      auto_event_dispatch_started "scope=$AUTO_SCOPE" "dispatch_phase=$DISPATCH_PHASE"
      dispatch_claude "$PROMPT_FILE" "$RESULT_FILE" \
        "Read,Write,Edit,Glob,Grep" \
        10 300 || {
        auto_event_dispatch_failed "scope=$AUTO_SCOPE" "dispatch_phase=$DISPATCH_PHASE" "exit_code=$?"
        log "⚠ REASSESS dispatch failed (non-critical). Continuing..."
      }

      log_cost "$SLICE" "reassess" "$RESULT_FILE"
      validate_current_state "$PHASE"
      log "✓ UNIFY + REASSESS complete for $SLICE."
      continue
    fi
  fi

  # ── 3. Determine next unit ─────────────────────────────────────────────────

  # Check if milestone is complete (all slices unified)
  if [[ "$AUTO_SCOPE" == "slice" && "$PHASE" == "unified" ]]; then
    auto_event_phase_completed "scope=$AUTO_SCOPE"
    log "Auto (this slice) complete for $START_SLICE."
    log "   Run /gsd-cc to review and choose the next step."
    break
  fi

  if [[ "$PHASE" == "unified" ]]; then
    NEXT_SLICE=$(find_next_slice)

    if [[ -z "$NEXT_SLICE" ]]; then
      echo ""
      auto_event_phase_completed "scope=$AUTO_SCOPE"
      log "✅ Milestone $MILESTONE complete. All slices planned, executed, and unified."
      break
    fi

    auto_event_phase_completed "scope=$AUTO_SCOPE"
    SLICE="$NEXT_SLICE"
    TASK="T01"

    # Determine phase for next slice
    if [[ -f "$GSD_DIR/${SLICE}-PLAN.md" ]]; then
      NEXT_PHASE="plan-complete"
    else
      NEXT_PHASE="plan"
    fi

    validate_phase_transition "$PHASE" "$NEXT_PHASE"
    update_state_field "current_slice" "$SLICE"
    update_state_field "current_task" "$TASK"
    transition_phase "$PHASE" "$NEXT_PHASE"
    PHASE="$NEXT_PHASE"
    validate_current_state
    log "▶ Moving to next slice: $SLICE ($PHASE)"
    emit_slice_started_once
    auto_event_phase_started "scope=$AUTO_SCOPE"
  fi

  # ── 4. Budget check ────────────────────────────────────────────────────────

  if [[ "$BUDGET" -gt 0 ]] && [[ -f "$COSTS_FILE" ]]; then
    TOTAL=$(jq -s '[.[].usage // {} | (.input_tokens // 0) + (.output_tokens // 0)] | add // 0' "$COSTS_FILE" 2>/dev/null || echo 0)
    if [[ "$TOTAL" -gt "$BUDGET" ]]; then
      echo ""
      auto_event_budget_reached "scope=$AUTO_SCOPE" "total_tokens=$TOTAL" "budget=$BUDGET"
      log "💰 Budget reached (${TOTAL} tokens). Stopping auto-mode."
      record_auto_problem_stop "budget_reached" \
        "Token budget reached at ${TOTAL} tokens." \
        "Review token usage, raise or clear the budget if appropriate, then run /gsd-cc."
      break
    fi
  fi

  # ── 5. Update lock file ─────────────────────────────────────────────────────

  case "$PHASE" in
    plan|roadmap-complete|discuss-complete)
      prepare_planning_branch "$MILESTONE" "$SLICE"
      ;;
  esac

  echo "{\"unit\":\"${SLICE}/${TASK}\",\"phase\":\"${PHASE}\",\"pid\":$$,\"started\":\"$(iso_now)\"}" > "$LOCK_FILE"

  # ── 6. Build prompt ────────────────────────────────────────────────────────

  PROMPT_FILE="$(runtime_tmp_file "gsd-prompt-$$.txt")"
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
      record_auto_problem_stop "validation_failed" \
        "Auto-mode stopped on unknown phase: $PHASE." \
        "Run /gsd-cc to inspect and repair the current state."
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

  RESULT_FILE="$(runtime_tmp_file "gsd-result-$$.json")"

  if [[ "$DISPATCH_PHASE" == "plan" ]]; then
    ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,Bash(git switch *),Bash(git checkout *),Bash(git branch *),Bash(git add *),Bash(git commit *)"
  else
    TASK_ATTEMPT=$((RETRY_COUNT + 1))
    auto_event_task_started \
      "scope=$AUTO_SCOPE" \
      "attempt=$TASK_ATTEMPT" \
      "task_plan=$TASK_PLAN" \
      "artifact=$TASK_PLAN"
    if ! ensure_apply_approval "$SLICE" "$TASK" "$TASK_PLAN"; then
      break
    fi
    build_apply_allowed_tools "$TASK_PLAN"
    ALLOWED_TOOLS="$APPLY_ALLOWED_TOOLS"
    log_apply_allowlist
  fi

  auto_event_dispatch_started "scope=$AUTO_SCOPE" "dispatch_phase=$DISPATCH_PHASE"
  dispatch_claude "$PROMPT_FILE" "$RESULT_FILE" "$ALLOWED_TOOLS" "$MAX_TURNS" "$TIMEOUT" || {
    EXIT_CODE=$?
    auto_event_dispatch_failed "scope=$AUTO_SCOPE" "dispatch_phase=$DISPATCH_PHASE" "exit_code=$EXIT_CODE"
    if [[ $EXIT_CODE -eq 124 ]]; then
      log "⏰ Timeout after ${TIMEOUT}s on ${SLICE}/${TASK}. Stopping."
      record_auto_problem_stop "timeout" \
        "Dispatch timed out after ${TIMEOUT}s on ${SLICE}/${TASK}." \
        "Inspect the partial work and consider splitting the task before running /gsd-cc."
    else
      log "❌ Dispatch failed (exit $EXIT_CODE) on ${SLICE}/${TASK}. Check $LOG_FILE for stderr."
      record_auto_problem_stop "dispatch_failed" \
        "Dispatch failed with exit $EXIT_CODE on ${SLICE}/${TASK}." \
        "Inspect $LOG_FILE and .gsd/AUTO-RECOVERY.md, then run /gsd-cc to resume."
    fi
    log_cost "${SLICE}/${TASK}" "$DISPATCH_PHASE" "$RESULT_FILE"
    break
  }

  # ── 9. Log costs ──────────────────────────────────────────────────────────

  log_cost "${SLICE}/${TASK}" "$DISPATCH_PHASE" "$RESULT_FILE"
  validate_current_state "$PHASE"

  # ── 10. Update state ──────────────────────────────────────────────────────

  update_state_field "last_updated" "$(iso_now)"

  # ── 11. Stuck detection ────────────────────────────────────────────────────

  if [[ "$DISPATCH_PHASE" == "apply" ]]; then
    EXPECTED_SUMMARY="$GSD_DIR/${SLICE}-${TASK}-SUMMARY.md"
    if [[ ! -f "$EXPECTED_SUMMARY" ]]; then
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [[ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]]; then
        log "🔄 ${SLICE}/${TASK} stuck after $MAX_RETRIES attempts. Stopping."
        record_auto_problem_stop "stuck_missing_summary" \
          "Expected summary $EXPECTED_SUMMARY was not created after $MAX_RETRIES attempts." \
          "Inspect the task output and worktree, then run /gsd-cc to retry or repair."
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
        record_auto_problem_stop "stuck_missing_plan" \
          "Expected plan $EXPECTED_PLAN was not created after $MAX_RETRIES attempts." \
          "Inspect the planning output and worktree, then run /gsd-cc to retry or repair."
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
      record_auto_problem_stop "git_safety_stop" \
        "Auto-mode stopped because fallback Git handling could not safely commit task-scoped changes." \
        "Inspect the uncommitted files, resolve unrelated changes, then run /gsd-cc."
      break
    fi
    auto_event_task_completed \
      "scope=$AUTO_SCOPE" \
      "attempt=$TASK_ATTEMPT" \
      "task_plan=$TASK_PLAN" \
      "summary=$EXPECTED_SUMMARY" \
      "artifact=$EXPECTED_SUMMARY"
  fi

  # ── 13. Release lock ──────────────────────────────────────────────────────

  auto_event_phase_completed "scope=$AUTO_SCOPE" "dispatch_phase=$DISPATCH_PHASE"
  release_lock

  log "✓ ${SLICE}/${TASK} complete."

  # ── 14. Rate limiting ─────────────────────────────────────────────────────

  sleep 2

done

# ── Cleanup ────────────────────────────────────────────────────────────────────

release_lock
echo ""
MILESTONE=$(read_optional_state_field "milestone")
SLICE=$(read_optional_state_field "current_slice")
TASK=$(read_optional_state_field "current_task")
PHASE=$(read_optional_state_field "phase")
auto_event_auto_finished "scope=${AUTO_SCOPE:-unknown}" "budget=$BUDGET"
log "Auto-mode finished."
