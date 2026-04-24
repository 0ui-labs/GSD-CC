---
name: gsd-cc-status
description: >
  Show project progress, AC status, token usage, and auto-mode state.
  Use when user says /gsd-cc-status, /gsd-cc status, or asks about project
  progress, costs, or current state.
allowed-tools: Read, Glob, Grep, Bash
---

# /gsd-cc-status — Project Status

You show a clear, concise overview of where the project stands. No actions — just information and one suggested next step.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output — messages, progress reports — must use that language. If not found, default to English.

## Step 1: Read State

1. Read `.gsd/STATE.md`
2. Read `.gsd/type.json`
3. Use `Glob` to find all:
   - `S*-PLAN.md` files (planned slices)
   - `S*-UNIFY.md` files (unified slices)
   - `S*-T*-SUMMARY.md` files (completed tasks)
4. Check if `token-usage.py` script is available (see Step 5)
5. Check if `.gsd/auto.lock` exists

## Step 2: Build Milestone Overview

For each slice in the roadmap:

| Indicator | Meaning |
|-----------|---------|
| `[done]` | UNIFY.md exists |
| `[T{nn}/T{total}]` | Some tasks have summaries, execution in progress |
| `[planned]` | PLAN.md exists but no summaries yet |
| `[pending]` | No PLAN.md yet |

Display:

```
M001 — {milestone name}

  S01 {slice name}        [done]     {x}/{y} AC  ✓ unified
  S02 {slice name}        [done]     {x}/{y} AC  ✓ unified
  S03 {slice name}        [T02/T04]  {x}/{y} AC  running
  S04 {slice name}        [planned]
  S05 {slice name}        [pending]
```

## Step 3: Current Position

```
Current: S{nn} / T{nn} — {task name}
Phase:   {phase from STATE.md}
Type:    {project type} / {rigor}
```

## Step 4: AC Summary

If any slices have been executed, show aggregate AC stats:

```
Acceptance Criteria:
  Total:   {n} defined
  Passed:  {n} ✓
  Partial: {n} ⚠
  Failed:  {n} ✗
```

Read AC results from UNIFY.md files (for completed slices) and SUMMARY.md files (for in-progress slice).

## Step 5: Token Usage

The `token-usage.py` script is in the **same directory as this SKILL.md file**. Derive the script path from the location where you loaded this skill, then run it via `Bash`. If `.gsd/COSTS.jsonl` exists, pass it via `--costs` to include the auto-mode breakdown:

```bash
SCRIPT="{directory of this SKILL.md}/token-usage.py"

if [[ ! -f "$SCRIPT" ]]; then
  echo "Token usage: script not found"
elif [[ -f ".gsd/COSTS.jsonl" ]]; then
  python3 "$SCRIPT" --costs .gsd/COSTS.jsonl
else
  python3 "$SCRIPT"
fi
```

Replace `{directory of this SKILL.md}` with the actual absolute path of the directory this skill was loaded from.

Display the output as-is in the Token Usage section.

If python3 is not available: "Token usage: requires python3"

## Step 6: Auto-Mode Status

If `.gsd/auto.lock` exists:

```
Auto-mode: ACTIVE
  Current: {unit from lock}
  Phase:   {phase from lock}
  Started: {timestamp from lock}
  PID:     {pid from lock}
```

Check if the PID is still running:
```bash
kill -0 {pid} 2>/dev/null && echo "running" || echo "stale"
```

If stale: "Auto-mode: STALE (process not running, lock file remains)"

If no lock file: "Auto-mode: inactive"

## Step 7: Suggest Next Action

Based on the current state, suggest ONE next action (same logic as `/gsd-cc` router, but presented as a suggestion, not a command):

```
Next: {suggested action}
```

## Output Format

Combine all sections into a single, clean output:

```
GSD-CC Status
─────────────

M001 — {milestone name}

  S01 {name}        [done]     4/4 AC  ✓ unified
  S02 {name}        [T02/T04]  1/3 AC  running
  S03 {name}        [pending]

Current: S02 / T02 — {task name}
Phase:   applying
Type:    application / deep

Acceptance Criteria: 5/7 passed, 1 partial, 1 pending

Token Usage (all sessions)
  Sessions:       12
  API calls:    1209
  Input:       10.6k tokens
  Output:     370.4k tokens
  Cache write:  2.8M tokens
  Cache read: 138.6M tokens
  Est. cost:    42.15$ (sonnet pricing)
  Auto-mode by phase: plan 22% · apply 68% · unify 10%

Auto-mode: inactive

Next: Continue with S02/T02.
```

Keep it compact. No explanations, no walls of text. Just the facts.
