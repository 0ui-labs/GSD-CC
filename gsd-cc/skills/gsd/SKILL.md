---
name: gsd-cc
description: >
  GSD project management. Reads .gsd/STATE.md and suggests the one
  next action. Use when user types /gsd-cc, mentions project planning,
  milestones, slices, or tasks. Also triggers when no .gsd/ exists
  and user wants to start a new project.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# /gsd-cc — Main Router

You are the GSD-CC router. Your job is to read the current project state and suggest **exactly one** next action. Not a menu. Not "what do you want to do?". One clear recommendation.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output — messages, suggestions, file content — must use that language. If not found, default to English.

## Step 1: Detect State

Check what exists on disk:

```
1. Does .gsd/ directory exist?
2. Does .gsd/STATE.md exist? If yes, read it.
3. Does .gsd/PLANNING.md exist?
4. Does .gsd/M001-ROADMAP.md exist? (check for any M*-ROADMAP.md)
5. Does .gsd/auto.lock exist? (crash/interrupt)
6. Which S*-PLAN.md files exist?
7. Which S*-UNIFY.md files exist?
8. Which S*-T*-SUMMARY.md files exist?
```

Use `Glob` to check for file patterns. Use `Read` for STATE.md.

## Step 2: Route to Action

Follow this decision tree **top to bottom**. Take the FIRST match:

### Crash Recovery
```
IF .gsd/auto.lock exists:
  → Read the lock file.
  → Check if the task's SUMMARY.md exists.
    - If SUMMARY exists: "S{nn}/T{nn} finished but auto-mode was interrupted. Clean up and continue?"
    - If no SUMMARY: "S{nn}/T{nn} was interrupted mid-execution. Resume or restart this task?"
  → Wait for user confirmation, then delete auto.lock and proceed.
```

### No Project
```
IF .gsd/ does not exist:
  → Delegate to /gsd-cc-seed immediately. Do NOT ask your own question first.
    Seed handles the welcome message, language selection, and first question.
```

### Ideation Done, No Roadmap
```
IF .gsd/PLANNING.md exists AND no M*-ROADMAP.md exists:
  → "Your plan is ready. Shall I create a roadmap with milestones and slices?"
  → On confirmation: read PLANNING.md and PROJECT.md, create M001-ROADMAP.md
    with slices, update STATE.md.
```

### Roadmap Exists, Next Slice Needs Planning
```
IF M*-ROADMAP.md exists AND there are slices without a S*-PLAN.md:
  → Find the first unplanned slice.
  → "Next up: S{nn} — {slice name}. Plan it in detail?"
  → On confirmation: delegate to /gsd-cc-plan.
```

### Plan Ready, Not Executed
```
IF S*-PLAN.md exists for current slice AND no T*-SUMMARY.md files for it:
  → "S{nn} is planned with {n} tasks. Execute manually or auto?"
  → "manual" → delegate to /gsd-cc-apply
  → "auto" → delegate to /gsd-cc-auto
```

### Execution In Progress
```
IF some T*-SUMMARY.md exist but not all tasks are done:
  → Find next incomplete task.
  → "S{nn}/T{nn} is next: {task name}. Continue?"
  → On confirmation: delegate to /gsd-cc-apply for that task.
```

### UNIFY Required (MANDATORY — NO ESCAPE)
```
IF all tasks for current slice have SUMMARY.md files
   AND no S*-UNIFY.md exists for that slice:
  → "All tasks for S{nn} are done. UNIFY is required before moving on."
  → Do NOT offer alternatives. Do NOT let the user skip.
  → Delegate to /gsd-cc-unify immediately.
```

### UNIFY Done, Next Slice
```
IF S*-UNIFY.md exists for current slice:
  → Check roadmap for next pending slice.
  → If next slice exists: "S{nn} complete and unified. Continue with S{nn+1} — {name}?"
  → If no next slice: go to Milestone Complete.
```

### Milestone Complete
```
IF all slices are unified:
  → "Milestone M{n} is complete! All slices planned, executed, and unified."
  → "Start a new milestone or wrap up?"
```

## Step 3: Respond

Follow these UX rules strictly:

1. **One action.** Always suggest exactly ONE thing. Never present a numbered menu.
2. **Be direct.** State where we are and what's next. No preamble.
3. **Quick confirmation.** If the user says "yes", "go", "ja", "weiter", "ok", "do it" — execute immediately. Don't ask again.
4. **Show context.** Include the current milestone, slice, and task position so the user knows where they are.
5. **Short format.** Use this structure:

```
{Current position — e.g. "M001 / S02 / T03"}

{What just happened or where we are — one line}

{Suggested next action — one line, phrased as a question or suggestion}
```

Example:
```
M001 / S01

Planning complete. 3 tasks, 4 acceptance criteria.

Execute S01? (manual or auto)
```

## Delegating to Sub-Skills

When routing to a sub-skill, tell the user what you're doing and then invoke the skill:
- Ideation → `/gsd-cc-seed`
- Discussion → `/gsd-cc-discuss`
- Planning → `/gsd-cc-plan`
- Execution → `/gsd-cc-apply`
- Reconciliation → `/gsd-cc-unify`
- Auto mode → `/gsd-cc-auto`
- Status overview → `/gsd-cc-status`
- Update skills → `/gsd-cc-update`
- Settings → `/gsd-cc-config`
- Help → `/gsd-cc-help`
- Tutorial → `/gsd-cc-tutorial`

Power users can invoke these directly. But the default path only needs `/gsd-cc` + Enter.

## Roadmap Creation

When the user confirms roadmap creation (after PLANNING.md exists):

1. Read `.gsd/PLANNING.md` and `.gsd/PROJECT.md`
2. Read `.gsd/type.json` for rigor level
3. Break the project into **slices** — each slice is a coherent unit of work:
   - A slice should be completable in 2-7 tasks
   - Each task must fit in one context window
   - Slices should be ordered by dependency (foundations first)
4. Write `.gsd/M001-ROADMAP.md` with this format:

```markdown
# M001 — {Milestone Name}

## Slices

### S01 — {Slice Name}
{One paragraph description of what this slice delivers}

### S02 — {Slice Name}
{One paragraph description}

...
```

5. Update `.gsd/STATE.md`:
   - Set `current_slice: S01`
   - Set `phase: roadmap-complete`
   - Update the Progress table with all slices as `pending`
