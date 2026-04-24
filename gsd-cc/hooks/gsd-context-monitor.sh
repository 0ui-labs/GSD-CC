#!/bin/bash
# GSD-CC Context Monitor — PostToolUse hook
# Injects warnings when context usage is getting high.
# Uses the transcript file size as a proxy for context consumption.

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')

# Skip if no transcript path
if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  exit 0
fi

# Check if we're in a GSD-CC project
if [ ! -d "$CWD/.gsd" ]; then
  exit 0
fi

# Use transcript line count as context proxy
# Typical context window: ~200K tokens ≈ ~2000 transcript lines for a heavy session
LINE_COUNT=$(wc -l < "$TRANSCRIPT" | xargs)

# Debounce: only warn every 20 tool calls
DEBOUNCE_FILE="/tmp/gsd-cc-ctx-monitor-$$"
if [ -f "$DEBOUNCE_FILE" ]; then
  LAST_WARN=$(cat "$DEBOUNCE_FILE")
  DIFF=$((LINE_COUNT - LAST_WARN))
  if [ "$DIFF" -lt 50 ]; then
    exit 0
  fi
fi

# Warning thresholds (based on transcript lines)
if [ "$LINE_COUNT" -gt 1500 ]; then
  echo "$LINE_COUNT" > "$DEBOUNCE_FILE"
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PostToolUse",
      "additionalContext": "⚠️ CRITICAL: Context window is very full. You MUST wrap up the current task immediately, write the summary, and instruct the user to start a fresh session. Do NOT start new work."
    }
  }'
  exit 0
elif [ "$LINE_COUNT" -gt 1000 ]; then
  echo "$LINE_COUNT" > "$DEBOUNCE_FILE"
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PostToolUse",
      "additionalContext": "⚠️ WARNING: Context window is filling up. Finish the current task soon and prepare to hand off to a fresh session."
    }
  }'
  exit 0
fi

exit 0
