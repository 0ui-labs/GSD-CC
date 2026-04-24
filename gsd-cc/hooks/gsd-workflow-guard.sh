#!/bin/bash
# GSD-CC Workflow Guard — PostToolUse hook
# Nudges Claude back into the GSD-CC flow when it drifts.
# Advisory only — does not block operations.

set -euo pipefail

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# Extract all needed values in a single jq call
IFS=$'\t' read -r TOOL_NAME CWD FILE_PATH <<< "$(echo "$INPUT" | jq -r '[.tool_name, .cwd, (.tool_input.file_path // "")] | join("\t")')"

# Only check Edit and Write on source files
if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ]; then
  exit 0
fi

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip if not a GSD-CC project
STATE_FILE="$CWD/.gsd/STATE.md"
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Allow writes to .gsd/ and .claude/ directories (workflow internals)
# Resolve to a canonical path relative to CWD to prevent path traversal
REAL_CWD=$(cd "$CWD" && pwd -P)
REAL_FILE=$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && echo "$(pwd -P)/$(basename "$FILE_PATH")" || echo "$FILE_PATH")
REL_PATH="${REAL_FILE#"$REAL_CWD"/}"

if [[ "$REL_PATH" == .gsd/* ]] || [[ "$REL_PATH" == .claude/* ]]; then
  exit 0
fi

# Read phase from STATE.md (single process, no pipe — safe with pipefail)
PHASE=$(awk '/^phase: */{sub(/^phase: */, ""); print; exit}' "$STATE_FILE")

# Allowlist: only known execution phases pass silently.
# Any other phase (planning or unknown) triggers a warning.
case "$PHASE" in
  "applying")
    # In execution — source file edits are expected
    exit 0
    ;;
  *)
    # Not in execution — source file edits are unexpected
    jq -n --arg phase "$PHASE" --arg file "$FILE_PATH" '{
      "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": ("Note: You edited " + $file + " but the current GSD-CC phase is \"" + $phase + "\" which is a planning phase, not execution. Source file changes should happen during the apply phase. If this was intentional, carry on. If not, consider running /gsd-cc to check the current state.")
      }
    }'
    exit 0
    ;;
esac
