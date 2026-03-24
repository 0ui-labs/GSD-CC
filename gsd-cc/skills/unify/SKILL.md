---
name: gsd-cc-unify
description: >
  Mandatory reconciliation after all tasks in a slice are done. Compares
  plan vs. actual, documents decisions and deviations, checks boundary
  violations, squash-merges the slice branch. Use when /gsd-cc routes here
  (mandatory), when user says /gsd-cc-unify, or when phase is apply-complete.
  CANNOT be skipped.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# /gsd-cc-unify — Mandatory Reconciliation

UNIFY is not optional. It runs after every slice. The `/gsd-cc` router blocks all other actions until UNIFY is complete. This is the single most important quality mechanism in GSD-CC.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output — messages, UNIFY reports, deviation analysis — must use that language. If not found, default to English.

## Why UNIFY Exists

- Without UNIFY, the next slice builds on assumptions instead of facts.
- Without UNIFY, decisions made during execution are lost.
- Without UNIFY, deferred issues accumulate invisibly.
- Without UNIFY, boundary violations go unnoticed.

## Enforcement

If `STATE.md` has `phase: apply-complete` and no `S{nn}-UNIFY.md` exists:

**UNIFY MUST run NOW.** Do not offer alternatives. Do not let the user skip to another slice. Do not accept "I'll do it later." Execute UNIFY immediately.

## Step 1: Load Context

Read ALL of these:

| File | Purpose |
|------|---------|
| `.gsd/S{nn}-PLAN.md` | What was planned |
| `.gsd/S{nn}-T{nn}-PLAN.md` | Per-task plans (all tasks in slice) |
| `.gsd/S{nn}-T{nn}-SUMMARY.md` | What actually happened (all tasks in slice) |
| `.gsd/DECISIONS.md` | Existing decisions |
| `.gsd/VISION.md` | User's original intentions (if it exists) |

Use `Glob` to find all matching files for the current slice.

## Step 2: Compare Plan vs. Actual

For each task in the slice plan, compare:

1. **Was the task completed?** (SUMMARY.md exists)
2. **What was planned vs. what was done?** (plan description vs. summary description)
3. **Was it as-planned, expanded, partial, or skipped?**

Build the Plan vs. Actual table:

```markdown
## Plan vs. Actual

| Task | Planned | Actual | Status |
|------|---------|--------|--------|
| T01  | {from plan} | {from summary} | ✅ as planned |
| T02  | {from plan} | {from summary} | ✅ expanded |
| T03  | {from plan} | {from summary} | ⚠️ partial |
```

Status meanings:
- **✅ as planned** — done exactly as specified
- **✅ expanded** — done with additional work (not a problem, just document it)
- **⚠️ partial** — some parts not completed (document what's missing)
- **❌ skipped** — not done at all (document why)

## Step 3: Evaluate Acceptance Criteria

For each AC across all tasks:

1. Read the AC from the task plan
2. Read the verification result from the task summary
3. Determine status: Pass / Partial / Fail

```markdown
## Acceptance Criteria

| AC   | Task | Status | Evidence |
|------|------|--------|----------|
| AC-1 | T01  | ✅ Pass | {from summary} |
| AC-2 | T01  | ✅ Pass | {from summary} |
| AC-3 | T02  | ⚠️ Partial | {what's missing} |
```

## Step 4: Document Decisions

Collect all decisions from task summaries that were NOT in the original plan:

```markdown
## Decisions Made

- {Decision 1} (reason: {rationale from summary})
- {Decision 2} (reason: {rationale})
```

If no ad-hoc decisions were made: "No additional decisions made during execution."

**Also append these decisions to `.gsd/DECISIONS.md`** under the slice heading.

## Step 5: Check Boundary Violations

For each task, compare:
- The `<boundaries>` from its plan (files marked DO NOT CHANGE)
- The `Files Changed` from its summary

If a task modified a file that was in its boundaries:

```markdown
## Boundary Violations

- T02 modified `src/types.ts` which was listed as DO NOT CHANGE (owned by T01).
  Reason: {if a reason was given in the summary, include it}
```

If no violations: "None."

**This is a critical check.** Boundary violations indicate either a bad plan or undisciplined execution. Both need to be visible.

## Step 6: Collect Deferred Issues

From all task summaries, collect issues that were pushed to later:

```markdown
## Deferred

- [ ] {Issue 1} → {target slice or "later"}
- [ ] {Issue 2} → {target slice or "later"}
```

If nothing was deferred: leave the section empty with a note "Nothing deferred."

## Step 7: Roadmap Reassessment

Based on everything learned in this slice, assess the remaining roadmap:

1. Read `.gsd/M001-ROADMAP.md`
2. Consider: Did this slice reveal anything that changes the plan?
   - New requirements discovered?
   - Approach that turned out harder/easier than expected?
   - Dependencies that shifted?
   - Deferred issues that need their own slice?

```markdown
## Reassessment

Roadmap still valid.
```

OR:

```markdown
## Reassessment

Roadmap needs update:
- {What changed and why}
- {Suggested adjustment}
```

If the roadmap needs an update, describe what should change but do NOT modify the roadmap file. That happens in the next planning phase.

## Step 8: Vision Alignment Check

If `.gsd/VISION.md` exists, compare what was built in this slice against the user's original intentions:

For each vision detail that relates to this slice:

```
Vision Alignment:

| Vision Detail | What User Wanted | What Was Built | Alignment |
|--------------|-----------------|----------------|-----------|
| {detail}     | {user's words}  | {what we did}  | ✓ Aligned / ⚠ Adjusted / ✗ Deviated |

Adjustments:
- {detail}: Vision said "{user's words}". Implemented as {what we did}
  because {technical reason}. Result is {how close to the original intent}.

Deviations:
- {detail}: Vision said "{user's words}". Could not implement because
  {reason}. Alternative: {what we did instead}. Recommendation: {keep as-is / revisit later}.
```

This section is critical for auto-mode transparency. The user should be able to read this and immediately see where their vision was honored and where it wasn't — and why.

If no VISION.md exists, skip this step.

## Step 9: Quality Gate

Check against `checklists/unify-complete.md`:

Read: `./gsd-cc/checklists/unify-complete.md`
(or `~/.claude/checklists/unify-complete.md`)

Verify ALL items pass. If any fails, fix the UNIFY document before proceeding.

## Step 9: Write UNIFY.md

Write `.gsd/S{nn}-UNIFY.md` using the template from `./gsd-cc/templates/UNIFY.md` (or `~/.claude/templates/UNIFY.md`). Include all sections from Steps 2-7.

Set frontmatter:
```yaml
---
slice: S{nn}
date: {now ISO}
status: {complete|partial|failed}
---
```

Status:
- `complete` — all ACs pass, no critical issues
- `partial` — some ACs partial/failed, but slice is usable
- `failed` — critical issues, slice may need rework

## Step 10: Git Squash-Merge

Merge the slice branch back to main with a squash:

```bash
git checkout main
git merge --squash gsd/M{n}/S{nn}
git commit -m "feat(M{n}/S{nn}): {slice name}"
```

This produces one clean commit on main per slice. The per-task history is preserved on the slice branch.

**Do NOT delete the slice branch.** It contains per-task commit history.

If there are merge conflicts, tell the user and help resolve them.

## Step 11: Update STATE.md

```
phase: unified
unify_required: false
```

Update the Progress table: set the current slice to `done` with AC counts.

## Step 12: Confirm and End Session

```
✓ UNIFY complete for S{nn}.

  Plan vs. Actual: {n} tasks — {summary}
  Acceptance Criteria: {passed}/{total} passed
  Boundary Violations: {none|count}
  Decisions: {count} logged
  Deferred: {count} items
  Reassessment: {verdict}

  Merged: gsd/M{n}/S{nn} → main
  Commit: feat(M{n}/S{nn}): {slice name}

┌─────────────────────────────────────────────┐
│  Start a fresh session for the next slice:  │
│                                             │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
│                                             │
│  I'll pick up with the next slice.          │
└─────────────────────────────────────────────┘
```

**Do NOT continue in this session.** Each phase gets a fresh context window.
