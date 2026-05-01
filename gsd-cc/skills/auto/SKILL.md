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

### State contract is available
```
Check ./.claude/templates/STATE_MACHINE.json, then
~/.claude/templates/STATE_MACHINE.json, then
./gsd-cc/templates/STATE_MACHINE.json.
```
If not found: "State contract missing. Reinstall GSD-CC or restore
STATE_MACHINE.json before starting auto-mode."

Use the contract as the authority for valid phases, required fields, empty
values, artifacts, and allowed transitions. Do not restate phase rules locally.

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

The auto-loop machine-validates all XML task plans in the current slice before
apply starts. It stops before dispatch if a plan is not auto-compatible:
filename/id mismatch, `type` other than `auto`, missing required sections,
invalid `<files>` paths, duplicate or malformed ACs, verify references to
unknown ACs, or a `<verify>` command that is neither recognized nor explicitly
allowed via `auto_apply_allowed_bash`.

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

### Apply Bash allowlist

During apply, auto-mode always grants the Git commands needed for atomic
commits (`git add *` and `git commit *`). Other Bash commands are limited to
patterns derived from the current task's `<verify>` command plus explicit
project overrides. To allow additional project-specific verification commands,
add comma-separated command patterns to `.gsd/CONFIG.md`:

```yaml
auto_apply_allowed_bash: pnpm lint *, npm run typecheck *, playwright test *
```

Do not include `Bash(...)` wrappers in the config value. Broad patterns such as
`python3 *` are allowed only when the project chooses them explicitly here.

### Approval rules

Auto-mode stops before apply dispatch when the current task matches approval
policy. Built-in approval rules cover high-risk tasks plus sensitive paths and
terms. Projects can add rules in `.gsd/CONFIG.md`:

```yaml
approval_required_paths: package.json, .github/workflows/*, migrations/*
approval_required_terms: auth, billing, payment, secret, token, deployment
approval_required_risk: high
```

`approval_required_risk` defaults to `high`; use `none` to disable risk-level
approval while keeping path and term rules active.

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
  Scope: {this slice | full milestone}
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
- **Slice complete** — current slice unified in slice mode
- **Budget reached** — token limit hit
- **Stuck** — a task failed twice
- **Timeout** — a single task exceeded its time limit
- **Error** — claude -p failed

Problem stops write recovery artifacts:
- `.gsd/AUTO-RECOVERY.md` — human-readable report with the running unit,
  stop reason, Git changes, commits since auto-mode started, log path, and
  safest next action
- `.gsd/auto-recovery.json` — machine-readable summary used by
  `/gsd-cc` and `/gsd-cc-status`

Successful slice or milestone completion does not create a recovery report.
Starting auto-mode clears stale recovery artifacts from previous problem stops.

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
