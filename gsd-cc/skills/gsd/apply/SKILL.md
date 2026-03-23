---
name: gsd-apply
description: >
  Execute the next task in the current slice. Loads task plan, enforces
  boundaries, implements actions, verifies acceptance criteria, writes
  summary, commits to git. Use when /gsd routes here, when user says
  /gsd-apply, or when a planned slice is ready for execution.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# /gsd-apply — Task Execution

You execute one task at a time from the current slice plan. Each task has a plan with acceptance criteria and boundaries. Follow the plan precisely.

## Step 1: Determine Current Task

1. Read `.gsd/STATE.md` — get `current_slice` and `current_task`
2. If `current_task` is `—` or empty, start with `T01`
3. Construct the task plan path: `.gsd/S{nn}-T{nn}-PLAN.md`

If the task plan file doesn't exist, stop and tell the user: "No plan found for S{nn}/T{nn}. Run /gsd-plan first."

## Step 2: Load Context (Context Matrix)

Load ONLY these files — nothing else:

| File | Purpose |
|------|---------|
| `.gsd/S{nn}-T{nn}-PLAN.md` | The task plan (primary input) |
| `.gsd/S{nn}-PLAN.md` | Slice overview for context |
| `.gsd/DECISIONS.md` | Decisions that affect implementation |
| `.gsd/S{nn}-T{prev}-SUMMARY.md` | Previous task summaries (all that exist for this slice) |

**Do NOT load:** PLANNING.md, ROADMAP.md, PROJECT.md, RESEARCH.md, CONTEXT.md, or files from other slices. These are not needed during execution and waste context window space.

## Step 3: Read and Announce the Plan

Parse the task plan XML. Display to the user:

```
S{nn} / T{nn} — {task name}

Files: {file list}
ACs:   {count} acceptance criteria
```

Then read the boundaries aloud:

```
Boundaries:
  DO NOT CHANGE: {file list with reasons}
```

This makes boundaries visible to you and to the user before any code is written.

## Step 4: Enforce Boundaries

Before writing any code, internalize the boundary rules:

**For each file listed in `<boundaries>` as DO NOT CHANGE:**
- Do NOT open it in Edit
- Do NOT write to it
- You MAY Read it for reference
- If you find yourself needing to change a boundary file, STOP and tell the user: "T{nn} needs to modify {file} which is in the boundaries. This is a plan issue — should I adjust?"

This is non-negotiable. Boundary violations are tracked in UNIFY.

## Step 5: Execute Actions

Follow the `<action>` steps from the task plan. For each step:

1. **Do exactly what it says.** Don't reinterpret or "improve" the plan.
2. **Create or modify files** as specified in `<files>`.
3. **Write tests** if the action says to write tests.
4. **Reference ACs** — make sure your implementation satisfies the acceptance criteria.

If you encounter an issue during execution:
- **Minor issue** (typo in plan, obvious small fix): fix it, note it in the summary.
- **Major issue** (plan is wrong, dependency missing, approach doesn't work): STOP. Tell the user. Don't improvise a different approach.

## Step 6: Verify Acceptance Criteria

Run the `<verify>` command from the task plan. For each AC:

```
AC-1: {Given/When/Then summary}
      → Pass ✓ | Partial ⚠ | Fail ✗
      Evidence: {test output, manual verification, etc.}
```

**All ACs must pass before proceeding.** If an AC fails:
1. Try to fix the issue (within the scope of this task)
2. Re-run verification
3. If it still fails after a reasonable attempt, mark it as Partial or Fail and note why in the summary

## Step 7: Write Task Summary

Create `.gsd/S{nn}-T{nn}-SUMMARY.md`:

```markdown
# S{nn}/T{nn} — {task name}

## Status
{complete | partial | blocked}

## What Was Done
{Brief description of what was implemented, 3-5 bullet points}

## Files Changed
{List of files created or modified, with one-line description each}

## Acceptance Criteria Results

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 | Pass ✓ | {evidence} |
| AC-2 | Pass ✓ | {evidence} |

## Decisions Made
{Any implementation decisions not in the original plan, with rationale.
"None — implemented as planned." if nothing deviated.}

## Issues
{Any problems encountered. "None." if clean execution.}
```

## Step 8: Git Commit

Stage and commit the changes from this task:

```bash
git add {specific files changed by this task}
git commit -m "feat(S{nn}/T{nn}): {task name}"
```

**Commit only the files this task changed.** Do not `git add -A` — that could include unrelated changes.

## Step 9: Update STATE.md

Determine what comes next:

### If there are more tasks in this slice:
```
current_task: T{nn+1}
phase: applying
```

### If this was the LAST task in the slice:
```
current_task: T{nn}
phase: apply-complete
unify_required: true
```

Setting `phase: apply-complete` triggers the UNIFY requirement. The `/gsd` router will not allow any other action until UNIFY is done.

Update the Progress table in STATE.md with the AC results.

## Step 10: Report and Continue

```
S{nn}/T{nn} complete.

  AC-1: Pass ✓
  AC-2: Pass ✓
  Committed: feat(S{nn}/T{nn}): {task name}

{If more tasks: "Next: T{nn+1} — {name}. Continue?"}
{If last task: "All tasks done. UNIFY is required next. Type /gsd to proceed."}
```

If the user says "yes", "go", "weiter" — immediately start the next task (go back to Step 1 with the next task).

## Multi-Task Flow

In manual mode, the user stays in the session. After each task:
- Report results
- Ask if they want to continue
- If yes, seamlessly start the next task
- The user can interrupt at any time between tasks

This is different from auto mode (`/gsd-auto`), where each task gets its own fresh `claude -p` session.
