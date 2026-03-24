#!/bin/bash
# GSD-CC Workflow Guard — PostToolUse hook
# Nudges Claude back into the GSD-CC flow when it drifts.
# Advisory only — does not block operations.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only check Edit and Write on source files (not .gsd/ files)
if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ]; then
  exit 0
fi

# Skip if not a GSD-CC project
STATE_FILE="$CWD/.gsd/STATE.md"
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Allow writes to .gsd/ directory (that's the workflow itself)
if [[ "$FILE_PATH" == *".gsd/"* ]] || [[ "$FILE_PATH" == *".claude/"* ]]; then
  exit 0
fi

# Check if we're in an active execution phase
PHASE=$(grep '^phase:' "$STATE_FILE" | head -1 | sed 's/phase: *//')

case "$PHASE" in
  "seed"|"seed-complete"|"stack-complete"|"roadmap-complete"|"plan-complete"|"discuss-complete")
    # Not in execution — source file edits are unexpected
    jq -n --arg phase "$PHASE" --arg file "$FILE_PATH" '{
      "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": ("Note: You edited " + $file + " but the current GSD-CC phase is \"" + $phase + "\" which is a planning phase, not execution. Source file changes should happen during the apply phase. If this was intentional, carry on. If not, consider running /gsd-cc to check the current state.")
      }
    }'
    exit 0
    ;;
  "applying")
    # In execution — this is expected
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
