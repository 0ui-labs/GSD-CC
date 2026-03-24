#!/bin/bash
# GSD-CC Statusline — Notification hook
# Renders project status in the terminal statusline.
# Shows: current phase, milestone/slice/task position, and project type.

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only render if this is a GSD-CC project
STATE_FILE="$CWD/.gsd/STATE.md"
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Parse STATE.md frontmatter
PHASE=$(grep '^phase:' "$STATE_FILE" | head -1 | sed 's/phase: *//')
MILESTONE=$(grep '^milestone:' "$STATE_FILE" | head -1 | sed 's/milestone: *//')
SLICE=$(grep '^current_slice:' "$STATE_FILE" | head -1 | sed 's/current_slice: *//')
TASK=$(grep '^current_task:' "$STATE_FILE" | head -1 | sed 's/current_task: *//')
RIGOR=$(grep '^rigor:' "$STATE_FILE" | head -1 | sed 's/rigor: *//')

# Build position string
POSITION="$MILESTONE"
if [ "$SLICE" != "—" ] && [ -n "$SLICE" ]; then
  POSITION="$POSITION / $SLICE"
fi
if [ "$TASK" != "—" ] && [ -n "$TASK" ]; then
  POSITION="$POSITION / $TASK"
fi

# Map phase to display name
case "$PHASE" in
  "seed") PHASE_DISPLAY="Seed" ;;
  "seed-complete") PHASE_DISPLAY="Seed ✓" ;;
  "stack-complete") PHASE_DISPLAY="Stack ✓" ;;
  "roadmap-complete") PHASE_DISPLAY="Roadmap ✓" ;;
  "discuss-complete") PHASE_DISPLAY="Discuss ✓" ;;
  "plan-complete") PHASE_DISPLAY="Plan ✓" ;;
  "planning") PHASE_DISPLAY="Planning..." ;;
  "applying") PHASE_DISPLAY="Executing..." ;;
  "apply-complete") PHASE_DISPLAY="UNIFY required" ;;
  "unified") PHASE_DISPLAY="Unified ✓" ;;
  *) PHASE_DISPLAY="$PHASE" ;;
esac

# Count progress
TOTAL_SLICES=$(grep -c '| S[0-9]' "$STATE_FILE" 2>/dev/null || echo "0")
DONE_SLICES=$(grep '| done' "$STATE_FILE" | wc -l | xargs)

# Write status to bridge file for other hooks
BRIDGE_FILE="/tmp/gsd-cc-status-$(echo "$CWD" | md5sum 2>/dev/null | cut -c1-8 || echo "default").json"
jq -n \
  --arg phase "$PHASE" \
  --arg position "$POSITION" \
  --arg rigor "$RIGOR" \
  --arg total "$TOTAL_SLICES" \
  --arg done "$DONE_SLICES" \
  '{phase: $phase, position: $position, rigor: $rigor, total_slices: ($total|tonumber), done_slices: ($done|tonumber)}' \
  > "$BRIDGE_FILE" 2>/dev/null

# Output statusline data
jq -n \
  --arg pos "$POSITION" \
  --arg phase "$PHASE_DISPLAY" \
  --arg rigor "$RIGOR" \
  --arg progress "${DONE_SLICES}/${TOTAL_SLICES}" \
  '{
    "hookSpecificOutput": {
      "hookEventName": "Notification",
      "additionalContext": ("GSD-CC: " + $pos + " | " + $phase + " | " + $rigor + " | " + $progress + " slices")
    }
  }'
exit 0
