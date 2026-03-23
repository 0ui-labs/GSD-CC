---
name: gsd-auto
description: >
  Start auto-mode. Dispatches tasks via claude -p in fresh sessions.
  Use when user says /gsd-auto, /gsd auto, or chooses "auto" when
  /gsd offers manual vs. auto execution.
allowed-tools: Read, Write, Bash, Glob
---

# /gsd-auto — Auto-Mode

You start the auto-loop that executes tasks autonomously, each in a fresh context window.

## Step 1: Check Prerequisites

Before starting, verify ALL of these:

### .gsd/STATE.md exists
```
If not: "No project set up. Run /gsd first."
```

### At least one slice is planned
```
Check for S*-PLAN.md files.
If none: "No slice is planned yet. Run /gsd to plan first."
```

### jq is installed
```bash
command -v jq
```
If not: "jq is required for auto-mode. Install with: `brew install jq`"

### claude -p works
```bash
claude -p "echo test" --output-format json --bare --max-turns 1
```
If fails: "claude -p is not working. Make sure Claude Code is installed and you're logged in with a Max plan."

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

```
Set a token budget? (Enter a number, or press Enter for unlimited)
```

If the user provides a number, pass it as `--budget`.
If they press Enter or say "no", no budget limit.

## Step 4: Start auto-loop.sh

Resolve the script location:

```bash
# Check local first, then global
if [[ -f ".claude/skills/gsd/auto/auto-loop.sh" ]]; then
  SCRIPT=".claude/skills/gsd/auto/auto-loop.sh"
elif [[ -f "$HOME/.claude/skills/gsd/auto/auto-loop.sh" ]]; then
  SCRIPT="$HOME/.claude/skills/gsd/auto/auto-loop.sh"
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

  Type /gsd-status for full details.
  Type /gsd to continue from where auto-mode stopped.
```

## Interrupting Auto-Mode

The user can interrupt auto-mode with Ctrl+C. The trap in auto-loop.sh cleans up the lock file. When they return:
- `/gsd` will detect the state and offer to resume
- No work is lost — completed tasks are committed to git
