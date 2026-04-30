#!/bin/bash
# GSD-CC Boundary Guard — PreToolUse hook
# Blocks Write/Edit/MultiEdit operations on files listed in .gsd/STATE.md boundaries.
# This is a HARD enforcement — Claude cannot bypass this regardless of prompting.

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only check file mutation operations
if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ] && [ "$TOOL_NAME" != "MultiEdit" ]; then
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

trim_value() {
  sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

normalize_path() {
  local path="$1"

  path=$(printf '%s\n' "$path" | trim_value)
  path="${path//$'\r'/}"
  while [[ "$path" == *'//'* ]]; do
    path="${path//\/\//\/}"
  done

  if [[ "$path" == "$CWD/"* ]]; then
    path="${path#"$CWD"/}"
  fi

  while [[ "$path" == ./* ]]; do
    path="${path#./}"
  done

  while [[ "$path" == */ && "$path" != "/" ]]; do
    path="${path%/}"
  done

  printf '%s\n' "$path"
}

has_glob_meta() {
  case "$1" in
    *'*'*|*'?'*|*'['*) return 0 ;;
    *) return 1 ;;
  esac
}

matches_boundary() {
  local path="$1"
  local boundary="$2"

  if [ "$path" = "$boundary" ]; then
    return 0
  fi

  if has_glob_meta "$boundary" && [[ "$path" == $boundary ]]; then
    return 0
  fi

  if ! has_glob_meta "$boundary" && [[ "$path" == "$boundary"/* ]]; then
    return 0
  fi

  return 1
}

RELATIVE_PATH=$(normalize_path "$FILE_PATH")

# Check each boundary file or directory
while IFS= read -r BOUNDARY_FILE; do
  BOUNDARY_FILE=$(normalize_path "$BOUNDARY_FILE")
  if [ -z "$BOUNDARY_FILE" ]; then
    continue
  fi

  # Check exact file, recursive directory, or explicit glob match.
  if matches_boundary "$RELATIVE_PATH" "$BOUNDARY_FILE"; then
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
