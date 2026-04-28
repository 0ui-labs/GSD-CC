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

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output — messages, UNIFY reports, deviation analysis — must use that UI language. If not found, default to English.

## Commit Language

Determine the commit language from these sources, in order of priority:

1. `commit_language` field in `.gsd/STATE.md`
2. `commit_language` field in `.gsd/CONFIG.md`
3. "GSD-CC commit language: {lang}" in CLAUDE.md

If none of these are found, default commit messages to English. Do not infer
commit language from the UI language.

## State Contract

Before updating `.gsd/STATE.md`, follow the phase contract in
`./.claude/templates/STATE_MACHINE.json`, `~/.claude/templates/STATE_MACHINE.json`,
or `./gsd-cc/templates/STATE_MACHINE.json` as the source repo fallback.
Do not invent phase names or required-field rules locally.

## Why UNIFY Exists

- Without UNIFY, the next slice builds on assumptions instead of facts.
- Without UNIFY, decisions made during execution are lost.
- Without UNIFY, deferred issues accumulate invisibly.
- Without UNIFY, boundary violations go unnoticed.

## Enforcement

If `STATE.md` has `phase: apply-complete`, `unify-failed`, or `unify-blocked` and no `S{nn}-UNIFY.md` exists (or UNIFY status is `failed`):

**UNIFY MUST run NOW.** Do not offer alternatives. Do not let the user skip to another slice. Do not accept "I'll do it later." Execute UNIFY immediately.

## Step 1: Load Context

Read ALL of these:

| File | Purpose |
|------|---------|
| `.gsd/S{nn}-PLAN.md` | What was planned |
| `.gsd/S{nn}-T{nn}-PLAN.xml` | Per-task plans (all tasks in slice) |
| `.gsd/S{nn}-T{nn}-SUMMARY.md` | What actually happened (all tasks in slice) |
| `.gsd/DECISIONS.md` | Existing decisions |
| `.gsd/VISION.md` | User's original intentions (if it exists) |

Use `Glob` to find all matching files for the current slice.
If any `.gsd/S{nn}-T{nn}-PLAN.md` task-plan files exist, stop and tell the
user to rerun `/gsd-cc-plan` so the slice is regenerated with XML task plans.

Also read `base_branch` from `.gsd/STATE.md`. If it is missing, run the
router's base branch detection before continuing and write the resolved value
to `.gsd/STATE.md`.

## Step 2: Build Summary

Start the UNIFY report with a compact summary that a returning user can scan
quickly:

```markdown
## Summary

- Status: {complete|partial|failed}
- Slice: S{nn} — {slice name}
- Outcome: {one-sentence result}
- Acceptance Criteria: {passed}/{total} passed, {partial} partial, {failed} failed
- Boundary Violations: {none|count}
- Recommendation: {one-sentence next-slice recommendation}
```

The summary must reflect the detailed sections below. Do not invent success
if later sections contain failed ACs, boundary violations, or blockers.

## Step 3: Compare Plan vs. Actual

For each task in the slice plan, compare:

1. **Was the task completed?** (SUMMARY.md exists)
2. **What was planned vs. what was done?** (plan description vs. summary description)
3. **Was it as-planned, expanded, partial, or skipped?**

Build the Plan vs. Actual table:

```markdown
## Plan vs. Actual

| Task | Planned | Actual | Status | Notes |
|------|---------|--------|--------|-------|
| T01  | {from plan} | {from summary} | as planned | {brief explanation} |
| T02  | {from plan} | {from summary} | expanded | {what expanded} |
| T03  | {from plan} | {from summary} | partial | {what is missing} |
```

Status meanings:
- **as planned** — done exactly as specified
- **expanded** — done with additional work
- **partial** — some planned work was not completed
- **skipped** — not done at all

Expanded work is not a failure by itself. Treat it as a problem only when it
creates risk, violates boundaries, or conflicts with approval expectations.

## Step 4: Evaluate Acceptance Criteria

For each AC across all tasks:

1. Read the AC from the task plan
2. Read the verification result from the task summary
3. Determine status: Pass / Partial / Fail

```markdown
## Acceptance Criteria

| AC   | Task | Status | Evidence |
|------|------|--------|----------|
| AC-1 | T01  | Pass | {from summary} |
| AC-2 | T01  | Pass | {from summary} |
| AC-3 | T02  | Partial | {what's missing} |
```

## Step 5: Classify Work, Risks, and Evidence

Write the following stronger trust-report sections. Each section is required.
Use `None.` when the section has no entries.

### Implemented Work

Summarize what actually shipped, grouped by product or technical area:

```markdown
## Implemented Work

| Area | What shipped | Evidence |
|------|--------------|----------|
| {area} | {implemented work} | {summary or test evidence} |
```

### Not Implemented

List planned work that did not ship. If all planned work shipped, write:

```markdown
## Not Implemented

None.
```

### Extra Work Added

List useful unplanned work. Do not treat extra work as failure unless it
violates boundaries or approval expectations:

```markdown
## Extra Work Added

| Area | Extra work | Why | Impact |
|------|------------|-----|--------|
| {area} | {extra work} | {reason} | {impact} |
```

If there was no extra work, write `None.` instead of the table.

### Deviations

List meaningful differences from the plan, including scope, implementation,
verification, or sequencing differences:

```markdown
## Deviations

| Deviation | Reason | Impact | Follow-up |
|-----------|--------|--------|-----------|
| {deviation} | {reason} | {impact} | {follow-up or None} |
```

If there were no deviations, write `None.`.

### Risks Introduced

List only risks created or revealed during this slice. Do not list generic
project risks:

```markdown
## Risks Introduced

| Risk | Source | Impact | Mitigation |
|------|--------|--------|------------|
| {risk} | {source} | {impact} | {mitigation or None} |
```

If no new risks were introduced or revealed, write `None.`.

### Tests and Evidence

Summarize verification separately from the AC table:

```markdown
## Tests and Evidence

| Check | Command or Method | Result | Covers |
|-------|-------------------|--------|--------|
| {check} | {command or manual method} | Pass/Partial/Fail | {AC IDs or area} |
```

## Step 6: Document Decisions

Collect all decisions from task summaries that were NOT in the original plan:

```markdown
## Decisions Made

- {Decision 1} (reason: {rationale from summary})
- {Decision 2} (reason: {rationale})
```

If no ad-hoc decisions were made: "No additional decisions made during execution."

**Also append these decisions to `.gsd/DECISIONS.md`** under the slice heading (if the file doesn't exist, create it with a `# Decisions` header first).

## Step 7: Check Boundary Violations

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

## Step 8: Collect Deferred Issues

From all task summaries, collect issues that were pushed to later:

```markdown
## Deferred

- [ ] {Issue 1} → {target slice or "later"}
- [ ] {Issue 2} → {target slice or "later"}
```

If nothing was deferred, write `None.` in the final UNIFY report.

## Step 9: Roadmap Reassessment

Based on everything learned in this slice, assess the remaining roadmap:

1. Read the current milestone roadmap (`.gsd/M{nnn}-ROADMAP.md`)
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
In full-auto flows, REASSESS is the only step that may modify roadmap files.

## Step 10: Vision Alignment Check

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

## Step 11: Recommend the Next Slice

End the report with one concrete recommendation. Use exactly one of these
shapes:

```markdown
## Recommendation for Next Slice

Continue as planned with {slice}.
```

```markdown
## Recommendation for Next Slice

Continue, but address: {specific concern}.
```

```markdown
## Recommendation for Next Slice

Pause before next slice: {specific blocker/risk}.
```

This recommendation is advisory. Do not modify roadmap files during UNIFY.

## Step 12: Write UNIFY.md

Write `.gsd/S{nn}-UNIFY.md` using the first template path that exists:

- `./.claude/templates/UNIFY.md`
- `~/.claude/templates/UNIFY.md`
- `./gsd-cc/templates/UNIFY.md` (source repo fallback)

Include all sections from Steps 2-11 in this order:

1. Summary
2. Plan vs. Actual
3. Acceptance Criteria
4. Implemented Work
5. Not Implemented
6. Extra Work Added
7. Deviations
8. Risks Introduced
9. Tests and Evidence
10. Decisions Made
11. Boundary Violations
12. Deferred
13. Reassessment
14. Vision Alignment
15. Recommendation for Next Slice

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

## Step 13: Quality Gate

Check against `checklists/unify-complete.md`:

Read the first checklist path that exists:

- `./.claude/checklists/unify-complete.md`
- `~/.claude/checklists/unify-complete.md`
- `./gsd-cc/checklists/unify-complete.md` (source repo fallback)

Verify ALL items pass. If any fails, fix the UNIFY document before proceeding.

## Step 14: Gate on Status

Before merging, check the UNIFY status:

- `complete` or `partial` → proceed to squash-merge.
- `failed` → **Do NOT merge.** Set `phase: unify-failed` in STATE.md. Present the failed ACs and boundary violations to the user and ask: rework the slice or skip it? Do not continue until the user decides.

## Step 15: Git Squash-Merge

Preflight before merging:

1. Verify `base_branch` is present in `.gsd/STATE.md`
2. Verify `{base_branch}` exists locally
3. Verify the current slice branch `gsd/M{n}/S{nn}` exists locally
4. Verify the worktree is clean enough to merge
5. Only then switch to `{base_branch}`

Merge the slice branch back to the configured base branch with a squash:

```bash
git switch {base_branch}
git merge --squash gsd/M{n}/S{nn}
git commit -m "feat(M{n}/S{nn}): {slice name}"
```

Write the squash commit subject and body in the resolved commit language. The
example above is English because English is the default commit language.

This produces one clean commit on `{base_branch}` per slice. The per-task
history is preserved on the slice branch.

**Do NOT delete the slice branch.** It contains per-task commit history.

If there are merge conflicts:

1. Show the conflicts to the user and help resolve them.
2. After resolution, stage and commit as above.
3. If the user decides NOT to merge, set `phase: unify-blocked` in STATE.md and note the reason. The next `/gsd-cc` invocation will retry the merge.

## Step 16: Update STATE.md

```
phase: unified
unify_required: false
```

Update the Progress table: set the current slice to `done` with AC counts.

## Step 17: Confirm and End Session

```
✓ UNIFY complete for S{nn}.

  Plan vs. Actual: {n} tasks — {summary}
  Acceptance Criteria: {passed}/{total} passed
  Boundary Violations: {none|count}
  Decisions: {count} logged
  Deferred: {count} items
  Reassessment: {verdict}
  Recommendation: {next-slice recommendation}

  Merged: gsd/M{n}/S{nn} → {base_branch}
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
