---
name: gsd-cc-help
description: >
  Show available GSD-CC commands and how they work. Use when user says
  /gsd-cc-help, /gsd-cc help, or asks what commands are available.
allowed-tools: Read, Glob
---

# /gsd-cc-help — Command Reference

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output must use that language. If not found, default to English.

## Output

Show this reference, adapted to the configured language:

```
GSD-CC — Get Shit Done on Claude Code

MAIN COMMAND
  /gsd-cc                 Reads project state, suggests the next action.
                          This is the only command you need.

PHASE COMMANDS (power users)
  /gsd-cc-seed            Start a new project — guided ideation
  /gsd-cc-discuss         Resolve ambiguities before planning
  /gsd-cc-plan            Break a slice into tasks with acceptance criteria
  /gsd-cc-apply           Execute the next task (manual mode)
  /gsd-cc-auto            Start autonomous execution via claude -p
  /gsd-cc-unify           Mandatory plan-vs-actual reconciliation

INFO & MANAGEMENT
  /gsd-cc-status          Show project progress and AC tracking
  /gsd-cc-update          Update GSD-CC to the latest version
  /gsd-cc-help            This help screen
  /gsd-cc-tutorial        Guided walkthrough with a sample project

THE FLOW
  1. /gsd-cc  →  Seed (what are you building?)
  2. /gsd-cc  →  Roadmap (milestones and slices)
  3. /gsd-cc  →  Plan (tasks with ACs and boundaries)
  4. /gsd-cc  →  Execute (manual or auto)
  5. /gsd-cc  →  UNIFY (mandatory quality check)
  6. /gsd-cc  →  Next slice or milestone complete

PROJECT FILES
  .gsd/STATE.md           Current position and progress
  .gsd/PLANNING.md        Project brief from ideation
  .gsd/PROJECT.md         Elevator pitch (3-5 sentences)
  .gsd/M001-ROADMAP.md    Milestones and slices
  .gsd/S01-PLAN.md        Slice plan with architecture notes
  .gsd/S01-T01-PLAN.xml    Task plan with ACs and boundaries
  .gsd/S01-T01-SUMMARY.md What actually happened
  .gsd/S01-UNIFY.md       Plan vs. actual comparison
  .gsd/DECISIONS.md       All decisions, append-only
  .gsd/COSTS.jsonl        Token usage tracking (auto-mode)

Per-task plans use `.xml`. Only the slice overview stays in Markdown.

TIPS
  • You only need /gsd-cc — it always knows what to do next
  • Type "auto" when asked to run tasks autonomously
  • Come back tomorrow — state survives between sessions
  • UNIFY cannot be skipped — it's what keeps quality high
```

## After showing help

If a `.gsd/` directory exists, add a one-line status: where the project currently is and what the suggested next step would be.
