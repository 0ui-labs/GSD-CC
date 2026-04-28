#!/bin/bash
# GSD-CC Statusline — PostToolUse hook
# Injects current project status as additionalContext after each tool use.
# This keeps Claude aware of the current position in the project.
# Also writes a bridge file for other hooks to read.

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

tmp_dir() {
  local dir="${TMPDIR:-/tmp}"
  dir="${dir%/}"
  if [ -z "$dir" ]; then
    dir="/tmp"
  fi
  printf '%s\n' "$dir"
}

normalize_count() {
  local value="$1"
  value=$(printf '%s\n' "$value" | awk 'NF { print $1; exit }')

  case "$value" in
    ''|*[!0-9]*) printf '0\n' ;;
    *) printf '%s\n' "$value" ;;
  esac
}

count_matches() {
  local pattern="$1"
  local file="$2"
  local count

  count=$(grep -c "$pattern" "$file" 2>/dev/null)
  normalize_count "$count"
}

CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only render if this is a GSD-CC project
STATE_FILE="$CWD/.gsd/STATE.md"
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Debounce: only inject status every 10 tool calls
DEBOUNCE_FILE="$(tmp_dir)/gsd-cc-statusline-$(echo "$CWD" | cksum | cut -d' ' -f1)"
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
TOTAL_SLICES=$(count_matches '| S[0-9]' "$STATE_FILE")
DONE_SLICES=$(count_matches '| done' "$STATE_FILE")

# Write bridge file for other hooks
BRIDGE_DIR="$(tmp_dir)"
BRIDGE_FILE="$BRIDGE_DIR/gsd-cc-bridge-$(echo "$CWD" | cksum | cut -d' ' -f1).json"
BRIDGE_TMP="$BRIDGE_FILE.$$.tmp"

if jq -n \
  --arg phase "$PHASE" \
  --arg position "$POSITION" \
  --arg total "$TOTAL_SLICES" \
  --arg done "$DONE_SLICES" \
  '{phase: $phase, position: $position, total_slices: ($total|tonumber), done_slices: ($done|tonumber)}' \
  > "$BRIDGE_TMP" 2>/dev/null && [ -s "$BRIDGE_TMP" ]; then
  mv "$BRIDGE_TMP" "$BRIDGE_FILE" 2>/dev/null || rm -f "$BRIDGE_TMP"
else
  rm -f "$BRIDGE_TMP"
fi

# No additionalContext output — this hook is silent.
# It only maintains the bridge file for cross-hook communication.
exit 0
