#!/bin/bash
# GSD-CC Prompt Injection Guard — PreToolUse hook
# Scans Write/Edit operations targeting .gsd/ files for prompt injection patterns.
# Blocks suspicious content from being written into planning artifacts.

INPUT=$(cat)

iso_now() {
  if date -Iseconds >/dev/null 2>&1; then
    date -Iseconds
  else
    date '+%Y-%m-%dT%H:%M:%S%z'
  fi
}

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only check Edit and Write operations
if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only scan writes to .gsd/ directory (planning artifacts)
if [[ "$FILE_PATH" != *".gsd/"* ]]; then
  exit 0
fi

# Get the content being written
if [ "$TOOL_NAME" = "Write" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
elif [ "$TOOL_NAME" = "Edit" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
fi

if [ -z "$CONTENT" ]; then
  exit 0
fi

# Check for prompt injection patterns
SUSPICIOUS=false
REASON=""

# Pattern 1: Direct instruction override attempts
if echo "$CONTENT" | grep -iqE 'ignore (previous|prior|above|all) (instructions|prompts|rules)'; then
  SUSPICIOUS=true
  REASON="Detected 'ignore previous instructions' pattern"
fi

# Pattern 2: Role reassignment
if echo "$CONTENT" | grep -iqE '(you are now|act as|pretend to be|your new role|forget your|disregard your)'; then
  SUSPICIOUS=true
  REASON="Detected role reassignment pattern"
fi

# Pattern 3: System prompt extraction
if echo "$CONTENT" | grep -iqE '(show|reveal|print|output|display) (your|the|system) (prompt|instructions|rules)'; then
  SUSPICIOUS=true
  REASON="Detected system prompt extraction attempt"
fi

# Pattern 4: Invisible Unicode characters (macOS-compatible using perl)
if command -v perl >/dev/null 2>&1; then
  if echo "$CONTENT" | perl -ne 'exit 1 if /[\x{200B}\x{200C}\x{200D}\x{FEFF}\x{202A}-\x{202E}\x{2066}-\x{2069}]/' 2>/dev/null; then
    : # no match
  else
    SUSPICIOUS=true
    REASON="Detected invisible Unicode characters"
  fi
fi

# Pattern 5: Base64-encoded instructions in suspicious context
if echo "$CONTENT" | grep -iqE '(decode|eval|execute|base64).*[A-Za-z0-9+/]{50,}'; then
  SUSPICIOUS=true
  REASON="Detected potentially encoded instructions"
fi

# Pattern 6: HTML/script injection in markdown
if echo "$CONTENT" | grep -iqE '<script|javascript:|on(load|error|click)='; then
  SUSPICIOUS=true
  REASON="Detected script injection in planning artifact"
fi

if [ "$SUSPICIOUS" = true ]; then
  echo "$(iso_now) BLOCKED file=$FILE_PATH reason=$REASON" >> "${HOME}/.gsd/guard.log"
  jq -n --arg reason "$REASON" --arg file "$FILE_PATH" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": ("PROMPT INJECTION BLOCKED: " + $reason + " in " + $file + ". This content cannot be written to planning artifacts. If this is a false positive, the user can write the file manually.")
    }
  }'
  exit 0
fi

# Content is clean
exit 0
