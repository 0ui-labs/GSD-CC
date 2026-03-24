#!/bin/bash
# GSD-CC Auto-Mode Loop
# The only piece of "code" in GSD-CC. Everything else is Skills (Markdown) and State (.gsd/ files).
#
# Usage: bash auto-loop.sh [--budget <tokens>]
# Requires: claude CLI, jq, git

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────

GSD_DIR=".gsd"
LOCK_FILE="$GSD_DIR/auto.lock"
COSTS_FILE="$GSD_DIR/COSTS.jsonl"
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

if ! command -v claude &>/dev/null; then
  echo "❌ claude CLI not found. Install Claude Code first."
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "❌ jq not found. Install with: brew install jq"
  exit 1
fi

if [[ ! -f "$GSD_DIR/STATE.md" ]]; then
  echo "❌ No .gsd/STATE.md found. Run /gsd-cc first to set up a project."
  exit 1
fi

# ── Cleanup trap ───────────────────────────────────────────────────────────────

cleanup() {
  rm -f "$LOCK_FILE"
  rm -f /tmp/gsd-prompt-$$.txt
  rm -f /tmp/gsd-result-$$.json
}
trap cleanup EXIT

# ── Helper functions ───────────────────────────────────────────────────────────

read_state_field() {
  grep "^$1:" "$GSD_DIR/STATE.md" | head -1 | sed "s/^$1:[[:space:]]*//"
}

update_state_field() {
  local field="$1" value="$2"
  if grep -q "^${field}:" "$GSD_DIR/STATE.md"; then
    sed -i'' -e "s/^${field}:.*/${field}: ${value}/" "$GSD_DIR/STATE.md"
  fi
}

log_cost() {
  local unit="$1" phase="$2" result_file="$3"
  if [[ -f "$result_file" ]]; then
    jq -c "{unit: \"$unit\", phase: \"$phase\", model: .model, usage: .usage, ts: \"$(date -Iseconds)\"}" \
      "$result_file" >> "$COSTS_FILE" 2>/dev/null || true
  fi
}

# ── Main loop ──────────────────────────────────────────────────────────────────

echo "▶ GSD-CC Auto-Mode starting..."
echo "  Budget: ${BUDGET:-unlimited} tokens"
echo ""

RETRY_COUNT=0
MAX_RETRIES=2

while true; do
  # ── 1. Read state ──────────────────────────────────────────────────────────

  PHASE=$(read_state_field "phase")
  SLICE=$(read_state_field "current_slice")
  TASK=$(read_state_field "current_task")
  RIGOR=$(read_state_field "rigor")
  MILESTONE=$(read_state_field "milestone")

  # ── 2. UNIFY enforcement ───────────────────────────────────────────────────

  if [[ "$PHASE" == "apply-complete" ]]; then
    UNIFY_FILE="$GSD_DIR/${SLICE}-UNIFY.md"
    if [[ ! -f "$UNIFY_FILE" ]]; then
      echo "⚠ Running mandatory UNIFY for $SLICE..."

      # Build UNIFY prompt
      PROMPT_FILE="/tmp/gsd-prompt-$$.txt"
      echo "<state>" > "$PROMPT_FILE"
      cat "$GSD_DIR/STATE.md" >> "$PROMPT_FILE"
      echo "</state>" >> "$PROMPT_FILE"

      # Include slice plan
      if [[ -f "$GSD_DIR/${SLICE}-PLAN.md" ]]; then
        echo "<slice-plan>" >> "$PROMPT_FILE"
        cat "$GSD_DIR/${SLICE}-PLAN.md" >> "$PROMPT_FILE"
        echo "</slice-plan>" >> "$PROMPT_FILE"
      fi

      # Include all task plans for this slice
      echo "<task-plans>" >> "$PROMPT_FILE"
      for f in "$GSD_DIR/${SLICE}"-T*-PLAN.md; do
        [[ -f "$f" ]] && cat "$f" >> "$PROMPT_FILE"
      done
      echo "</task-plans>" >> "$PROMPT_FILE"

      # Include all summaries for this slice
      echo "<summaries>" >> "$PROMPT_FILE"
      for f in "$GSD_DIR/${SLICE}"-T*-SUMMARY.md; do
        [[ -f "$f" ]] && cat "$f" >> "$PROMPT_FILE"
      done
      echo "</summaries>" >> "$PROMPT_FILE"

      # Include decisions
      if [[ -f "$GSD_DIR/DECISIONS.md" ]]; then
        echo "<decisions>" >> "$PROMPT_FILE"
        cat "$GSD_DIR/DECISIONS.md" >> "$PROMPT_FILE"
        echo "</decisions>" >> "$PROMPT_FILE"
      fi

      cat "$PROMPTS_DIR/unify-instructions.txt" >> "$PROMPT_FILE"

      RESULT_FILE="/tmp/gsd-result-$$.json"
      timeout 600 claude -p "$(cat "$PROMPT_FILE")" \
        --allowedTools "Read,Write,Edit,Glob,Grep,Bash(git checkout *),Bash(git merge *),Bash(git commit *)" \
        --output-format json \
        --max-turns 15 > "$RESULT_FILE" 2>/dev/null || {
        echo "❌ UNIFY dispatch failed. Check .gsd/auto.lock for recovery."
        break
      }

      log_cost "$SLICE" "unify" "$RESULT_FILE"
      echo "✓ UNIFY complete for $SLICE."
      continue
    fi
  fi

  # ── 3. Determine next unit ─────────────────────────────────────────────────

  # Check if milestone is complete (all slices unified)
  if [[ "$PHASE" == "unified" ]]; then
    # Check roadmap for remaining slices
    NEXT_RESULT=$(claude -p "Read .gsd/STATE.md and all .gsd/M*-ROADMAP.md and .gsd/S*-UNIFY.md files. Determine the next slice that needs work (no PLAN.md or no UNIFY.md). Output ONLY valid JSON: {\"slice\":\"S01\",\"phase\":\"plan\"} or {\"done\":true} if all slices are unified." \
      --allowedTools "Read,Glob" \
      --output-format json --max-turns 3 2>/dev/null) || {
      echo "❌ Failed to determine next unit."
      break
    }

    NEXT=$(echo "$NEXT_RESULT" | jq -r '.result // empty' 2>/dev/null || echo "$NEXT_RESULT")

    if echo "$NEXT" | jq -e '.done' > /dev/null 2>&1; then
      echo ""
      echo "✅ Milestone $MILESTONE complete. All slices planned, executed, and unified."
      break
    fi

    SLICE=$(echo "$NEXT" | jq -r '.slice')
    PHASE=$(echo "$NEXT" | jq -r '.phase')
    TASK="T01"

    update_state_field "current_slice" "$SLICE"
    update_state_field "phase" "$PHASE"
    update_state_field "current_task" "$TASK"
  fi

  # ── 4. Budget check ────────────────────────────────────────────────────────

  if [[ "$BUDGET" -gt 0 ]] && [[ -f "$COSTS_FILE" ]]; then
    TOTAL=$(jq -s '[.[].usage // {} | (.input_tokens // 0) + (.output_tokens // 0)] | add // 0' "$COSTS_FILE" 2>/dev/null || echo 0)
    if [[ "$TOTAL" -gt "$BUDGET" ]]; then
      echo ""
      echo "💰 Budget reached (${TOTAL} tokens). Stopping auto-mode."
      break
    fi
  fi

  # ── 5. Set lock file ──────────────────────────────────────────────────────

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
      TASK_PLAN="$GSD_DIR/${SLICE}-${TASK}-PLAN.md"
      SLICE_PLAN="$GSD_DIR/${SLICE}-PLAN.md"

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
      echo "⚠ Unknown phase: $PHASE. Stopping."
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

  echo "▶ ${SLICE}/${TASK} (${DISPATCH_PHASE})..."

  RESULT_FILE="/tmp/gsd-result-$$.json"

  if [[ "$DISPATCH_PHASE" == "plan" ]]; then
    ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,Bash(git checkout *),Bash(git branch *)"
  else
    ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,Bash(npm *),Bash(npx *),Bash(git add *),Bash(git commit *),Bash(node *),Bash(python3 *)"
  fi

  timeout "$TIMEOUT" claude -p "$(cat "$PROMPT_FILE")" \
    --allowedTools "$ALLOWED_TOOLS" \
    --output-format json \
    --max-turns "$MAX_TURNS" > "$RESULT_FILE" 2>/dev/null || {
    EXIT_CODE=$?
    if [[ $EXIT_CODE -eq 124 ]]; then
      echo "⏰ Timeout after ${TIMEOUT}s on ${SLICE}/${TASK}. Stopping."
    else
      echo "❌ Dispatch failed (exit $EXIT_CODE) on ${SLICE}/${TASK}."
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
        echo "🔄 ${SLICE}/${TASK} stuck after $MAX_RETRIES attempts. Stopping."
        break
      fi
      echo "⚠ Expected $EXPECTED_SUMMARY not found. Retry $RETRY_COUNT/$MAX_RETRIES..."
      continue
    fi
    RETRY_COUNT=0
  fi

  if [[ "$DISPATCH_PHASE" == "plan" ]]; then
    EXPECTED_PLAN="$GSD_DIR/${SLICE}-PLAN.md"
    if [[ ! -f "$EXPECTED_PLAN" ]]; then
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [[ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]]; then
        echo "🔄 Planning ${SLICE} stuck after $MAX_RETRIES attempts. Stopping."
        break
      fi
      echo "⚠ Expected $EXPECTED_PLAN not found. Retry $RETRY_COUNT/$MAX_RETRIES..."
      continue
    fi
    RETRY_COUNT=0
  fi

  # ── 12. Git commit (fallback if task didn't commit) ────────────────────────

  if ! git diff --quiet HEAD 2>/dev/null || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    git add -A
    git commit -m "feat(${SLICE}/${TASK}): auto-mode execution" --no-verify 2>/dev/null || true
  fi

  # ── 13. Release lock ──────────────────────────────────────────────────────

  rm -f "$LOCK_FILE"

  echo "✓ ${SLICE}/${TASK} complete."

  # ── 14. Rate limiting ─────────────────────────────────────────────────────

  sleep 2

done

# ── Cleanup ────────────────────────────────────────────────────────────────────

rm -f "$LOCK_FILE"
echo ""
echo "Auto-mode finished."
