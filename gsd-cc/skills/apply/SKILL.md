---
name: gsd-cc-apply
description: >
  Execute the next task in the current slice. Loads task plan, enforces
  boundaries, implements actions, verifies acceptance criteria, writes
  summary, commits to git. Use when /gsd-cc routes here, when user says
  /gsd-cc-apply, or when a planned slice is ready for execution.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# /gsd-cc-apply — Task Execution

You execute one task at a time from the current slice plan. Each task has a plan with acceptance criteria and boundaries. Follow the plan precisely.

## Language

Determine the language from these sources, in order of priority:

1. `language` field in `.gsd/STATE.md`
2. `language` field in `.gsd/CONFIG.md`
3. "GSD-CC language: {lang}" in CLAUDE.md

If none of these are found, default to English and warn the user: "No language configured. Defaulting to English. Set it in STATE.md or CONFIG.md to avoid this warning."

All output — messages, summaries, commit messages — must use the resolved language.

## State Contract

Before updating `.gsd/STATE.md`, follow the phase contract in
`./.claude/templates/STATE_MACHINE.json`, `~/.claude/templates/STATE_MACHINE.json`,
or `./gsd-cc/templates/STATE_MACHINE.json` as the source repo fallback.
Do not invent phase names or required-field rules locally.

## Step 1: Determine Current Task

1. Read `.gsd/STATE.md` — get `current_slice`, `current_task`, and `base_branch`
2. If `current_task` is `—` or empty, start with `T01`
3. Construct the task plan path: `.gsd/S{nn}-T{nn}-PLAN.xml`

If the task plan file doesn't exist, stop and tell the user: "No plan found for S{nn}/T{nn}. Run /gsd-cc-plan first."
If `.gsd/S{nn}-T{nn}-PLAN.md` exists instead, treat it as a legacy artifact
and stop with: "Legacy Markdown task plan detected for S{nn}/T{nn}. Run
/gsd-cc-plan to regenerate the XML task plan first."

## Step 2: Load Context (Context Matrix)

Load ONLY these files — nothing else:

| File | Required | Purpose |
|------|----------|---------|
| `.gsd/S{nn}-T{nn}-PLAN.xml` | **yes** | The task plan (primary input) — stop if missing |
| `.gsd/S{nn}-PLAN.md` | **yes** | Slice overview for context — stop if missing |
| `.gsd/DECISIONS.md` | no | Decisions that affect implementation — skip silently if missing |
| `.gsd/S{nn}-T{prev}-SUMMARY.md` | no | Previous task summaries (all that exist for this slice) — skip if none exist |
| `.gsd/VISION.md` | no | User's detailed intentions — skip silently if missing |

If a **required** file is missing, stop and tell the user which file is missing and what to do (e.g. "Run /gsd-cc-plan first").

**Do NOT load:** PLANNING.md, ROADMAP.md, PROJECT.md, RESEARCH.md, CONTEXT.md, or files from other slices. These are not needed during execution and waste context window space.

**Vision alignment:** If the task implements something described in VISION.md, ensure the implementation matches the user's intention. If you must deviate, note it in the task summary: "Vision says X, implemented Y because Z."

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

If the task plan contains `parallel: true`, note this to the user:

```
Note: This task is marked as parallelizable — it has no dependencies on
adjacent tasks and could run concurrently with other parallel-marked tasks.
```

This makes boundaries and parallelizability visible to you and to the user before any code is written.

## Step 4: Enforce Boundaries

Before writing any code, internalize the boundary rules:

**For each file, directory, or glob listed in `<boundaries>` as DO NOT CHANGE:**
- Do NOT open it in Edit
- Do NOT write to it
- You MAY Read it for reference
- If you find yourself needing to change a boundary path, STOP and tell the user: "T{nn} needs to modify {path} which is in the boundaries. This is a plan issue — should I adjust?"

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

## Step 6: Run Existing Tests

Before verifying acceptance criteria, run the existing test suite to catch regressions:

1. Detect the project's test runner (look for `package.json` scripts, `Makefile`, `Cargo.toml`, `pytest.ini`, etc.)
2. If **no test suite exists**, skip this step and note in the summary: "No existing test suite found — skipped regression check."
3. Run the test suite. Scoping strategy:
   - If the `<files>` section of the task plan maps to a specific test file or directory, run only those tests.
   - If the task plan includes a `<test_scope>` hint, use that.
   - Otherwise, run the full test suite.
4. If existing tests fail:
   - **If the failure is caused by your changes:** fix it before proceeding.
   - **If the failure is pre-existing:** verify whether the same test also
     fails on the configured `base_branch`. Do not discard or mix task changes
     while checking.
     Safe options:
     - Run the comparison only when the current worktree is clean.
     - Prefer a temporary worktree:

       ```bash
       git worktree add /tmp/gsd-cc-base-check-{pid} {base_branch}
       ```

       Run the same failing test there, then remove the temporary worktree.
     - If the worktree is not safe to switch and a temporary worktree cannot be
       created, skip the comparison and note that limitation in the summary.
     If the failure is confirmed on `base_branch`, note it in the summary under
     Issues, but proceed.

This step ensures that the implementation does not break existing functionality.

## Step 7: Verify Acceptance Criteria

Run the `<verify>` command from the task plan. If no `<verify>` command exists, verify each AC manually and note: "No verify command in plan — verified manually."

For each AC:

```
AC-1: {Given/When/Then summary}
      → Pass ✓ | Partial ⚠ | Fail ✗
      Evidence: {test output, manual verification, etc.}
```

**All ACs must pass before proceeding.** If an AC fails:
1. Try to fix the issue (within the scope of this task)
2. Re-run verification
3. If it still fails after a reasonable attempt, mark it as Partial or Fail and note why in the summary

After verification, determine the **task status**:
- **complete** — all ACs pass
- **partial** — some ACs pass, some are Partial or Fail
- **blocked** — critical ACs fail and cannot be resolved in this task's scope

## Step 8: Write Task Summary

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

## Step 9: Git Commit (Conditional)

**Only commit if task status is `complete`.**

Stage and commit the changes from this task:

```bash
git add {specific files changed by this task}
git commit -m "feat(S{nn}/T{nn}): {task name}"
```

**Commit only the files this task changed.** Do not `git add -A` — that could include unrelated changes.

In auto-mode, a missing task commit is treated as a recovery path only. The
runner may create a fallback commit only when the summary status is
`complete` and every remaining change belongs to this task's `<files>` plus
`.gsd/S{nn}-T{nn}-SUMMARY.md` and `.gsd/STATE.md`. Otherwise it stops so the
worktree can be inspected safely.

**If task status is `partial` or `blocked`:**

Do NOT commit. Instead, ask the user:

```
Task status: {partial | blocked}

Failed/partial ACs:
  AC-X: {reason}

Options:
  1. Keep changes uncommitted (you can review and fix manually)
  2. Discard all changes from this task (revert modified files AND remove newly created files)
  3. Commit anyway as work-in-progress: "wip(S{nn}/T{nn}): {task name}"

Which option?
```

Wait for the user's response and act accordingly.

**If the user chooses option 2 (discard):**
- Revert modified files: `git checkout -- {modified files}`
- Remove newly created files: `rm {new files}` (list them explicitly, never use `rm -rf`)
- The task summary file (`.gsd/S{nn}-T{nn}-SUMMARY.md`) is **kept** — it documents the failed attempt and is valuable for the next try.

## Step 10: Update STATE.md

Determine what comes next:

### If task status is `complete` and there are more tasks in this slice:
```
current_task: T{nn+1}
phase: applying
```

### If task status is `complete` and this was the LAST task in the slice:
```
current_task: T{nn}
phase: apply-complete
unify_required: true
```

Setting `phase: apply-complete` triggers the UNIFY requirement. The `/gsd-cc` router will not allow any other action until UNIFY is done.

### If task status is `partial` or `blocked`:
```
current_task: T{nn}
phase: apply-blocked
blocked_reason: {brief reason}
```

Do NOT advance to the next task. The user must resolve the issue first.

**Important:** The `apply-blocked` phase must be checked by the `/gsd-cc` router BEFORE the "Execution In Progress" rule. The router checks for SUMMARY.md file existence to determine task completion — but a blocked/partial task also has a SUMMARY (with status `blocked` or `partial`). Without an explicit `apply-blocked` check, the router would skip the blocked task and move to the next one.

Update the Progress table in STATE.md with the AC results.

## Step 11: Report and End Session

After completing a task, report results and instruct the user to start a fresh session:

### If status is `complete`:
```
✓ S{nn}/T{nn} complete.

  AC-1: Pass ✓
  AC-2: Pass ✓
  Committed: feat(S{nn}/T{nn}): {task name}

┌─────────────────────────────────────────────┐
│  Start a fresh session for the next task:   │
│                                             │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
│                                             │
│  I'll know exactly where we left off.       │
└─────────────────────────────────────────────┘
```

### If status is `partial` or `blocked`:
```
⚠ S{nn}/T{nn} {partial | blocked}.

  AC-1: Pass ✓
  AC-X: Fail ✗ — {reason}

  Changes are {uncommitted | committed as WIP | discarded} per your choice.

┌─────────────────────────────────────────────┐
│  This task needs attention before moving    │
│  on. Review the summary:                    │
│  .gsd/S{nn}-T{nn}-SUMMARY.md               │
│                                             │
│  When ready, start a fresh session:         │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
└─────────────────────────────────────────────┘
```

### If this was the LAST task in the slice (and complete):
```
✓ S{nn}/T{nn} complete — all tasks in this slice are done.

  UNIFY is required before the next slice.

┌─────────────────────────────────────────────┐
│  Start a fresh session for UNIFY:           │
│                                             │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
│                                             │
│  UNIFY will run automatically.              │
└─────────────────────────────────────────────┘
```

## Why Fresh Sessions?

**Do NOT offer to continue in the same session.** Each task must run in a fresh context window. This prevents context rot — the core problem GSD-CC solves. The state on disk (STATE.md, summaries, plans) ensures perfect continuity between sessions. A fresh session means Claude reads only what's needed for the next task, not the accumulated noise of previous tasks.

This applies equally to manual mode and auto mode. The only difference is that auto mode starts fresh sessions automatically via `claude -p`, while manual mode requires the user to do it themselves.
