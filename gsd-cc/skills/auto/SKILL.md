---
name: gsd-cc-auto
description: >
  Start auto-mode. Dispatches tasks via claude -p in fresh sessions.
  Use when user says /gsd-cc-auto, /gsd-cc auto, or chooses "auto" when
  /gsd-cc offers manual vs. auto execution.
allowed-tools: Read, Write, Bash, Glob, AskUserQuestion
---

# /gsd-cc-auto — Auto-Mode

You start the auto-loop that executes tasks autonomously, each in a fresh context window.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output — messages, status updates — must use that language. If not found, default to English.

## Step 1: Check Prerequisites

Before starting, verify ALL of these:

### .gsd/STATE.md exists
```
If not: "No project set up. Run /gsd-cc first."
```

### At least one slice is planned
```
Check for S*-PLAN.md files.
If none: "No slice is planned yet. Run /gsd-cc to plan first."
```

If execution is about to start, also verify the current slice has
`.gsd/S{nn}-T{nn}-PLAN.xml` task plans and no legacy
`.gsd/S{nn}-T{nn}-PLAN.md` files. If legacy Markdown task plans exist:
"Legacy task plans detected. Run /gsd-cc-plan to regenerate XML task plans
before starting auto-mode."

### jq is installed
```bash
command -v jq
```
If not: "Auto-mode unavailable: jq not found. Install with: `brew install jq`. If GSD-CC was installed without jq, rerun the installer afterward to enable hooks."

### git is available
```bash
command -v git
```
If not: "Auto-mode unavailable: git not found. Install Git and ensure `git` is in your PATH."

### claude CLI is available
```bash
command -v claude || which claude
```
If not found: "Auto-mode unavailable: claude CLI not found. Install Claude Code and ensure `claude` is in your PATH."
Note: The auto-loop.sh script resolves the full path to claude automatically, so PATH issues in subprocesses are handled.

### No stale lock file
```
Check .gsd/auto.lock
```
If exists: Check if the PID is still running.
- If running: "Auto-mode is already running (PID {pid}). Stop it first or wait."
- If stale: "Found stale lock file from a previous run. Clean up and start fresh?"
  On confirmation: delete auto.lock.

## Step 2: Show Current State

Display what auto-mode will do:

```
Auto-mode ready.

  Milestone: M{n}
  Starting from: S{nn} / T{nn}
  Phase: {phase}
  Rigor: {rigor} (timeouts: {timeout}s, max turns: {max_turns})
  Remaining: {n} tasks in current slice, {m} slices total

  Each task gets a fresh context window.
  UNIFY runs automatically after each slice.
  Progress is saved to .gsd/ — you can close this terminal safely.
```

## Step 3: Ask for Budget (Optional)

Use AskUserQuestion:

```
Question: "Token-Budget setzen?"
Header: "Budget"
Options:
  - label: "Unlimited (Recommended)"
    description: "No token limit — auto-mode runs until the slice/milestone is done."
  - label: "Set a budget"
    description: "Limit total token usage. You'll be asked for the number."
```

→ "Unlimited" → no budget limit, proceed to Step 4
→ "Set a budget" → ask user for the number (via AskUserQuestion with "Other" or text input), pass as `--budget`

## Step 4: Start auto-loop.sh

Resolve the script location:

```bash
# Check local install first, then global, then the source repo fallback
if [[ -f "./.claude/skills/auto/auto-loop.sh" ]]; then
  SCRIPT="./.claude/skills/auto/auto-loop.sh"
elif [[ -f "$HOME/.claude/skills/auto/auto-loop.sh" ]]; then
  SCRIPT="$HOME/.claude/skills/auto/auto-loop.sh"
elif [[ -f "./gsd-cc/skills/auto/auto-loop.sh" ]]; then
  SCRIPT="./gsd-cc/skills/auto/auto-loop.sh"
fi
```

Start it:

```bash
bash "$SCRIPT" --budget {budget}
```

Or without budget:

```bash
bash "$SCRIPT"
```

Run this via the Bash tool. The output streams in real-time — the user sees each task starting and completing.

## Step 5: When It Finishes

Auto-mode stops when:
- **Milestone complete** — all slices unified
- **Budget reached** — token limit hit
- **Stuck** — a task failed twice
- **Timeout** — a single task exceeded its time limit
- **Error** — claude -p failed

After it stops, read `.gsd/STATE.md` and report:

```
Auto-mode finished.

  Completed: {n} tasks across {m} slices
  Status: {milestone complete | stopped at S{nn}/T{nn} | error}

  Type /gsd-cc-status for full details.
  Type /gsd-cc to continue from where auto-mode stopped.
```

## Interrupting Auto-Mode

The user can interrupt auto-mode with Ctrl+C. The trap in auto-loop.sh cleans up the lock file. When they return:
- `/gsd-cc` will detect the state and offer to resume
- No work is lost — completed tasks are committed to git
