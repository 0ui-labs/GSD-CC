---
name: gsd-cc-plan
description: >
  Research, decompose, and plan the current slice. Produces task plans
  with BDD acceptance criteria and explicit boundaries. Use when /gsd-cc
  routes here, when user says /gsd-cc-plan, or when a slice needs planning.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# /gsd-cc-plan — Slice Planning

You turn a slice description into a set of executable task plans. Each task gets BDD acceptance criteria and explicit boundaries. The result is a set of files that `/gsd-cc-apply` or `auto-loop.sh` can execute without ambiguity.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output — messages, plans, acceptance criteria, boundaries — must use that language. If not found, default to English.

## State Contract

Before updating `.gsd/STATE.md`, follow the phase contract in
`./.claude/templates/STATE_MACHINE.json`, `~/.claude/templates/STATE_MACHINE.json`,
or `./gsd-cc/templates/STATE_MACHINE.json` as the source repo fallback.
Do not invent phase names or required-field rules locally.

## Step 1: Load Context

Read these files (all that exist):

1. `.gsd/STATE.md` — get `current_slice`, `milestone`, `rigor`, `project_type`, `base_branch`
2. `.gsd/M001-ROADMAP.md` — find the current slice description
3. `.gsd/PLANNING.md` — overall project context
4. `.gsd/DECISIONS.md` — all decisions made so far
5. `.gsd/S{nn}-CONTEXT.md` — discuss phase output (if it exists)
6. `.gsd/type.json` — rigor and type config
7. `.gsd/VISION.md` — if it exists, the user's detailed intentions. Acceptance criteria should align with vision details. If a task implements something the user described in the vision, reference it.

## Step 2: Research

Before decomposing, understand the codebase and ecosystem. Spawn a **read-only research subagent** (or do it yourself if subagents aren't available):

### What to Research

1. **Codebase scan** — What files and patterns are relevant to this slice? Ignore parts of the codebase that this slice won't touch.
2. **Stack analysis** — What dependencies and frameworks are in use that this slice builds on?
3. **Existing code** — What's already built from previous slices? What interfaces exist that this slice must integrate with?
4. **Ecosystem check** — Are there libraries that solve parts of this slice? What's the idiomatic approach for this stack?

### Research Output

Write `.gsd/M{n}-RESEARCH.md` (one per milestone, append if it exists):

```markdown
## Research for S{nn}

### Codebase State
{What exists, file structure, patterns observed}

### Relevant Interfaces
{Functions, types, APIs that this slice must work with}

### Dependencies
{Installed packages, available tools}

### Recommendations
{Libraries to use, patterns to follow, pitfalls to avoid}
```

**Research is read-only.** Do not create or modify any project files during research. Only write to `.gsd/`.

## Step 3: Decompose into Tasks

Break the slice into tasks. Follow these iron rules:

### Iron Rules

1. **A task that doesn't fit in one context window is two tasks.** If you need more than ~15 files of context + output, split it.
2. **1-7 tasks per slice.** If you have more than 7, the slice is too big — tell the user and suggest splitting the slice.
3. **Tasks are ordered by dependency.** T01 creates foundations, T02 builds on them, etc.
4. **Each task is independently verifiable.** After completing T01, you can prove it works before starting T02.

### For Each Task, Define:

#### `<name>`
Short, descriptive name. "Core types and interfaces", not "Do stuff".

#### `<files>`
List every file this task will create or modify. Be specific — full paths.
Prefer bare repo-relative paths, one per line. Auto-mode derives fallback Git
ownership from this section, so it must stay machine-readable. If you need a
short note, keep the path first on the line and the note trailing it.

#### `<acceptance_criteria>`
**MANDATORY.** At least one AC per task. Every AC uses BDD format:

```xml
<ac id="AC-1">
  Given {precondition — what state exists before}
  When {action — what the code does}
  Then {outcome — what must be true after}
</ac>
```

Good ACs are:
- **Testable** — you can write a test or run a command to verify
- **Specific** — "returns a 400 status with error message" not "handles errors"
- **Independent** — each AC tests one behavior

#### `<action>`
Step-by-step instructions. Numbered list. Concrete enough that Claude Code can execute them without guessing. Reference the ACs: "Write tests covering AC-1 and AC-2."

#### `<boundaries>`
**MANDATORY.** List files, directories, or globs that this task MUST NOT change.
Directory entries protect all children recursively:

```xml
<boundaries>
  DO NOT CHANGE:
  - src/types.ts (read-only, owned by T01)
  - src/generated/ (generated output owned by build step)
  - src/**/*.generated.ts (generated files)
  - package.json (no new deps without approval)
  - .gsd/ (do not modify state files during execution)
</boundaries>
```

If there are no restrictions, explicitly state: "No boundary restrictions for this task."

Every file created by a previous task that this task should not modify MUST be listed here.

#### `<verify>`
The command or check that proves the ACs pass. Must reference AC IDs:

```xml
<verify>npm test -- --grep "parser" (AC-1, AC-2)</verify>
```

#### `<done>`
One sentence: what must be true when this task is complete.

## Step 4: Write Plan Files

### Slice Plan: `.gsd/S{nn}-PLAN.md`

Overview of the entire slice:

```markdown
# S{nn} — {Slice Name}

## Overview
{What this slice delivers, 2-3 sentences}

## Tasks

| Task | Name | Files | ACs |
|------|------|-------|-----|
| T01  | {name} | {count} files | {count} ACs |
| T02  | {name} | {count} files | {count} ACs |
...

## All Acceptance Criteria

| AC | Task | Criterion |
|----|------|-----------|
| AC-1 | T01 | {Given/When/Then summary} |
| AC-2 | T01 | {Given/When/Then summary} |
| AC-3 | T02 | {Given/When/Then summary} |
...

## Boundaries

{Consolidated list of all boundary restrictions across tasks}

## Dependencies

T01 → T02 → T03 (or describe the actual graph)
```

### Per-Task Plans: `.gsd/S{nn}-T{nn}-PLAN.xml`

One file per task, using the PLAN.xml template format:

Do NOT write `.gsd/S{nn}-T{nn}-PLAN.md`. Markdown is reserved for the slice
overview file `.gsd/S{nn}-PLAN.md`.

```xml
<task id="S{nn}-T{nn}" type="auto">
  <name>{task name}</name>

  <files>
    {file list}
  </files>

  <acceptance_criteria>
    <ac id="AC-{n}">
      Given {precondition}
      When {action}
      Then {outcome}
    </ac>
  </acceptance_criteria>

  <action>
    1. {step}
    2. {step}
    ...
  </action>

  <boundaries>
    DO NOT CHANGE:
    - {file} ({reason})
  </boundaries>

  <verify>{command} (AC-{n}, AC-{m})</verify>
  <done>{completion criteria}</done>
</task>
```

## Step 5: Quality Gate

Before finishing, check against `checklists/planning-ready.md`:

Read the first checklist path that exists:

- `./.claude/checklists/planning-ready.md`
- `~/.claude/checklists/planning-ready.md`
- `./gsd-cc/checklists/planning-ready.md` (source repo fallback)

Verify ALL items from the checklist. Do not cherry-pick — every item must pass.

If any check fails, fix it before proceeding. Do not skip the quality gate.

## Step 6: Create Git Branch

Resolve `base_branch` from `.gsd/STATE.md`. If it is missing, run the router's
base branch detection before continuing and write the result to
`.gsd/STATE.md`.

Before switching branches, check the worktree. If there are uncommitted
unrelated changes, stop and ask the user to commit, stash, or clean them.

Create the slice branch from the configured base branch:

```bash
git switch {base_branch}
git switch -c gsd/M{n}/S{nn}
```

If `git switch` is unavailable, use the equivalent `git checkout` commands.

If the slice branch already exists (resuming), switch to it instead of
recreating it. Verify it is based on `{base_branch}` before continuing; if it
is not, warn the user and stop so the branch ancestry can be inspected.

## Step 7: Update STATE.md

```
current_slice: S{nn}
current_task: T01
phase: plan-complete
```

## Step 8: Confirm and End Session

```
✓ Planning complete for S{nn}: {slice name}

  {n} tasks, {m} acceptance criteria
  Boundaries defined for all tasks
  Quality gate passed

  .gsd/S{nn}-PLAN.md          — slice overview
  .gsd/S{nn}-T01-PLAN.xml      — {task 1 name}
  .gsd/S{nn}-T02-PLAN.xml      — {task 2 name}
  ...
  Branch: gsd/M{n}/S{nn}

┌─────────────────────────────────────────────┐
│  Start a fresh session for execution:       │
│                                             │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
│                                             │
│  I'll ask: manual or auto?                  │
└─────────────────────────────────────────────┘
```

**Do NOT continue in this session.** The planning conversation consumes context window space. Execution needs a clean slate.
