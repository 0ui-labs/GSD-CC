#!/bin/bash
# GSD-CC Statusline — PostToolUse hook
# Injects current project status as additionalContext after each tool use.
# This keeps Claude aware of the current position in the project.
# Also writes a bridge file for other hooks to read.

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only render if this is a GSD-CC project
STATE_FILE="$CWD/.gsd/STATE.md"
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Debounce: only inject status every 10 tool calls
DEBOUNCE_FILE="/tmp/gsd-cc-statusline-$(echo "$CWD" | cksum | cut -d' ' -f1)"
COUNTER=0
if [ -f "$DEBOUNCE_FILE" ]; then
  COUNTER=$(cat "$DEBOUNCE_FILE")
fi
COUNTER=$((COUNTER + 1))
echo "$COUNTER" > "$DEBOUNCE_FILE"
if [ $((COUNTER % 10)) -ne 0 ]; then
  exit 0
fi

# Parse STATE.md frontmatter
PHASE=$(grep '^phase:' "$STATE_FILE" | head -1 | sed 's/phase: *//')
MILESTONE=$(grep '^milestone:' "$STATE_FILE" | head -1 | sed 's/milestone: *//')
SLICE=$(grep '^current_slice:' "$STATE_FILE" | head -1 | sed 's/current_slice: *//')
TASK=$(grep '^current_task:' "$STATE_FILE" | head -1 | sed 's/current_task: *//')

# Build position string
POSITION="$MILESTONE"
if [ "$SLICE" != "—" ] && [ -n "$SLICE" ]; then
  POSITION="$POSITION / $SLICE"
fi
if [ "$TASK" != "—" ] && [ -n "$TASK" ]; then
  POSITION="$POSITION / $TASK"
fi

# Count progress
TOTAL_SLICES=$(grep -c '| S[0-9]' "$STATE_FILE" 2>/dev/null || echo "0")
DONE_SLICES=$(grep '| done' "$STATE_FILE" 2>/dev/null | wc -l | xargs)

# Write bridge file for other hooks
BRIDGE_FILE="/tmp/gsd-cc-bridge-$(echo "$CWD" | cksum | cut -d' ' -f1).json"
jq -n \
  --arg phase "$PHASE" \
  --arg position "$POSITION" \
  --arg total "$TOTAL_SLICES" \
  --arg done "$DONE_SLICES" \
  '{phase: $phase, position: $position, total_slices: ($total|tonumber), done_slices: ($done|tonumber)}' \
  > "$BRIDGE_FILE" 2>/dev/null

# No additionalContext output — this hook is silent.
# It only maintains the bridge file for cross-hook communication.
exit 0
