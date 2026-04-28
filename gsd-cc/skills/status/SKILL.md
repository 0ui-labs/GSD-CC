---
name: gsd-cc-status
description: >
  Show project progress, AC status, token usage, and auto-mode state.
  Can also explain the current project state in plain language.
  Use when user says /gsd-cc-status, /gsd-cc status, or asks about project
  progress, costs, explanations, or current state.
allowed-tools: Read, Glob, Grep, Bash
---

# /gsd-cc-status — Project Status

You show a clear, concise overview of where the project stands. No actions — just information and one suggested next step.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output — messages, progress reports — must use that language. If not found, default to English.

## Mode Detection

Before building the output, decide which mode the user requested:

- **Explain mode** if the request includes `explain`, `state explain`,
  `erklären`, `erklaeren`, `was bedeutet der Status`, or asks what the
  current state means.
- **Status mode** for `/gsd-cc-status`, `/gsd-cc status`, progress, costs,
  token usage, or general current-state requests.

Both modes are read-only. Do not update `.gsd/`, do not generate a dashboard,
and do not execute workflow actions.

## Step 1: Read State

1. Read `.gsd/STATE.md`
2. Read `.gsd/type.json`
3. Use `Glob` to find all:
   - `S*-PLAN.md` files (planned slices)
   - `S*-UNIFY.md` files (unified slices)
   - `S*-T*-SUMMARY.md` files (completed tasks)
4. Check if `token-usage.py` script is available (see Step 5)
5. Check if `.gsd/auto.lock` exists
6. Check if `.gsd/auto-recovery.json` exists
7. Check if `.gsd/APPROVAL-REQUEST.json` exists

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

## Step 7: Last Auto-Mode Stop

If `.gsd/auto-recovery.json` exists, read it and show a compact section:

```
Last auto-mode stop:
  Reason:  {reason}
  Unit:    {unit}
  Stopped: {stopped_at}
  Report:  .gsd/AUTO-RECOVERY.md
  Next:    {safe_next_action}
```

If it does not exist, omit this section.

## Step 8: Approval Status

If `.gsd/APPROVAL-REQUEST.json` exists, read it and show a compact section:

```
Approval: pending
  Task:   {slice}/{task}
  Risk:   {risk_level}
  Reason: {first approval reason}
```

If it does not exist, show:

```
Approval: none pending
```

## Step 9: Suggest Next Action

Based on the current state, suggest ONE next action (same logic as `/gsd-cc` router, but presented as a suggestion, not a command):

```
Next: {suggested action}
```

## Explain Mode Output

If Explain mode was requested, reuse the same state-reading steps above, but
replace the compact status table with a plain-language explanation. Keep it
short and practical:

```text
GSD-CC Status Explain
─────────────────────

We are in M{nnn} / S{nn} / T{nn}.

{One short paragraph explaining what this phase means and what is already done.}

{One short paragraph explaining what is open, blocked, interrupted, or risky.}

Next: {exactly one recommended next action, with why it is the safest or most
useful next step.}
```

Explain mode must answer:

- current milestone, slice, task, and phase
- what is already complete
- what is currently open, blocked, interrupted, or waiting for UNIFY
- why the recommended next step follows from the state
- exactly one recommended next action

Use these interpretation rules:

- If `.gsd/` or `.gsd/STATE.md` is missing, explain that no GSD-CC project
  state exists yet and recommend starting with `/gsd-cc`.
- If the phase is `seed`, `seed-complete`, `stack`, `roadmap`, or another
  planning phase, explain which planning artifact exists and which planning
  artifact is still needed.
- If the current slice has a `S{nn}-PLAN.md` and no task summaries, explain
  that planning is complete but execution has not started.
- If some `S{nn}-T*-SUMMARY.md` files exist and not all tasks are complete,
  explain which task is next and that previous task summaries are the record
  of completed work.
- If the phase is `apply-blocked`, `apply-failed`, `unify-blocked`, or
  `unify-failed`, call out the blockage first. Use `blocked_reason` from
  `STATE.md` if present, then the current task summary or UNIFY file for
  supporting detail.
- If all task summaries exist and no `S{nn}-UNIFY.md` exists, explain that
  work is implemented but not reconciled, so UNIFY is mandatory before the
  next slice.
- If the current slice has `S{nn}-UNIFY.md`, explain that the slice has been
  reconciled and recommend the next pending slice, or milestone wrap-up if no
  slices remain.
- If `.gsd/auto.lock` exists and its PID is running, explain that auto-mode is
  active and recommend waiting or checking `/gsd-cc-status`.
- If `.gsd/auto.lock` exists but its PID is stale, explain that auto-mode was
  interrupted and recommend running `/gsd-cc` to recover from the stale lock.
- If `.gsd/auto-recovery.json` exists, mention the last stop reason and
  `.gsd/AUTO-RECOVERY.md` when it helps explain why the project stopped.
- If `.gsd/APPROVAL-REQUEST.json` exists, explain that auto-mode is waiting
  for explicit approval before the current task can run.

Do not include the token usage table, milestone table, charts, HTML, or
dashboard language in Explain mode unless the user specifically asked about
costs or progress numbers.

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

Last auto-mode stop:
  Reason:  dispatch_failed
  Unit:    S02/T03
  Stopped: 2026-04-28T12:00:00+02:00
  Report:  .gsd/AUTO-RECOVERY.md
  Next:    Inspect .gsd/AUTO-RECOVERY.md, then run /gsd-cc.

Approval: none pending

Next: Continue with S02/T02.
```

Keep it compact. No explanations, no walls of text. Just the facts.
