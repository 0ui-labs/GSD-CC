#!/bin/bash
# GSD-CC Boundary Guard — PreToolUse hook
# Blocks Write/Edit operations on files listed in .gsd/STATE.md boundaries.
# This is a HARD enforcement — Claude cannot bypass this regardless of prompting.

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only check Edit and Write operations
if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ]; then
  exit 0
fi

# Get the file being edited/written
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Check if STATE.md exists and has boundaries
STATE_FILE="$CWD/.gsd/STATE.md"
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Extract boundary files from STATE.md
# Boundaries section contains lines like: - path/to/file (reason)
BOUNDARIES=$(sed -n '/^## Boundaries Active/,/^##/p' "$STATE_FILE" | grep '^ *- ' | sed 's/^ *- //' | sed 's/ (.*//')

if [ -z "$BOUNDARIES" ]; then
  exit 0
fi

# Normalize the target file path (make relative to CWD if absolute)
RELATIVE_PATH="$FILE_PATH"
if [[ "$FILE_PATH" == "$CWD"* ]]; then
  RELATIVE_PATH="${FILE_PATH#$CWD/}"
fi

# Check each boundary file
while IFS= read -r BOUNDARY_FILE; do
  BOUNDARY_FILE=$(echo "$BOUNDARY_FILE" | xargs) # trim whitespace
  if [ -z "$BOUNDARY_FILE" ]; then
    continue
  fi

  # Check exact match or path containment
  if [ "$RELATIVE_PATH" = "$BOUNDARY_FILE" ] || [ "$FILE_PATH" = "$BOUNDARY_FILE" ]; then
    jq -n --arg file "$BOUNDARY_FILE" '{
      "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": ("BOUNDARY VIOLATION: " + $file + " is in the DO NOT CHANGE list for this task. This file is protected. If you need to modify it, stop and discuss with the user first.")
      }
    }'
    exit 0
  fi
done <<< "$BOUNDARIES"

# File not in boundaries — allow
exit 0
