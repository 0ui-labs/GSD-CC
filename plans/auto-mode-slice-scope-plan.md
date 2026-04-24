# Auto-Mode Slice Scope Implementation Plan

## Goal

Make `Auto (this slice)` execute exactly one slice and then stop.

The target outcome is:

- `auto_mode_scope: slice` runs the current slice through mandatory UNIFY
- slice mode never advances `current_slice` to the next roadmap slice
- slice mode never starts planning or applying work for the next slice
- `auto_mode_scope: milestone` keeps the existing full-milestone behavior
- missing or invalid scope values fail safe instead of silently running ahead

## Why This Change Comes Next

The router presents two different auto choices:

- `Auto (this slice)` for task execution plus UNIFY only
- `Auto (full milestone)` for planning, execution, UNIFY, and next-slice
  progression until the milestone is done

Today those choices are not meaningfully separated at runtime. The router
writes `auto_mode_scope`, but `auto-loop.sh` does not read it. Once a slice is
unified, the loop calls `find_next_slice`, updates `current_slice`, and keeps
going.

That violates user intent. If the user chooses "this slice", the tool must not
quietly continue into the next slice.

## Current Problem

The relevant behavior is split across three places:

1. `gsd-cc/skills/gsd-cc/SKILL.md` offers the user slice or milestone mode and
   says `auto_mode_scope` should be set in `.gsd/STATE.md`.
2. `gsd-cc/skills/auto/SKILL.md` starts `auto-loop.sh` but does not pass or
   display the selected scope.
3. `gsd-cc/skills/auto/auto-loop.sh` reads `phase`, `current_slice`, and
   `current_task`, but not `auto_mode_scope`.

The main loop has one unconditional next-slice branch:

```bash
if [[ "$PHASE" == "unified" ]]; then
  NEXT_SLICE=$(find_next_slice)
  ...
  update_state_field "current_slice" "$SLICE"
  update_state_field "phase" "$PHASE"
  update_state_field "current_task" "$TASK"
fi
```

That branch is correct for full-milestone mode and wrong for slice mode.

## Behavioral Contract

### `auto_mode_scope: slice`

Slice mode starts from the `current_slice` present when auto-mode launches.
Call it `START_SLICE`.

It may:

- continue remaining tasks in `START_SLICE`
- finish a slice that is already in `apply-complete`
- run mandatory UNIFY for `START_SLICE`
- leave `.gsd/STATE.md` at `phase: unified` with `current_slice: START_SLICE`
- log a clear completion message

It must not:

- call `find_next_slice` after `START_SLICE` is unified
- update `current_slice` to another slice
- dispatch planning or apply prompts for another slice
- run the separate auto reassessment step that mutates the roadmap and state

The UNIFY document may still contain its normal reassessment section. The
separate `reassess-instructions.txt` dispatch should be milestone-only because
it can update the roadmap and set the next slice.

### `auto_mode_scope: milestone`

Milestone mode keeps the current multi-slice behavior:

- after UNIFY, run REASSESS
- find the next pending slice
- plan or execute it
- stop only when the milestone is complete, budget is reached, or an error
  occurs

### Missing Scope

Treat missing `auto_mode_scope` as `slice` and log a warning:

```text
auto_mode_scope is missing; defaulting to slice mode.
Choose Auto (full milestone) through /gsd-cc to run beyond one slice.
```

This is the safer default. Full-milestone execution should require an explicit
`auto_mode_scope: milestone`.

### Invalid Scope

If `auto_mode_scope` is present but not `slice` or `milestone`, stop before
doing work and print a repair hint.

## Proposed Implementation

### 1. Normalize auto scope in `auto-loop.sh`

Add a helper near the state helpers:

```bash
read_auto_scope() {
  local raw
  raw=$(read_state_field "auto_mode_scope" 2>/dev/null || true)

  case "$raw" in
    ""|"slice") echo "slice" ;;
    "milestone") echo "milestone" ;;
    *)
      fail_validation "Unsupported auto_mode_scope: $raw" \
        "Use 'slice' or 'milestone' in .gsd/STATE.md."
      ;;
  esac
}
```

Read it once on startup:

```bash
AUTO_SCOPE=$(read_auto_scope)
START_SLICE="$SLICE"
```

Log it with the startup summary:

```text
Scope: slice
Starting slice: S03
```

Reading the scope once avoids surprising behavior if a sub-agent edits
`STATE.md` during execution.

### 2. Add a hard slice-scope guard

At the top of each loop iteration, after reading state, protect against any
unexpected slice drift:

```bash
if [[ "$AUTO_SCOPE" == "slice" && "$SLICE" != "$START_SLICE" ]]; then
  log "Auto (this slice) complete for $START_SLICE."
  log "   Refusing to continue with $SLICE in slice scope."
  break
fi
```

This is defensive. The normal path should stop before `current_slice` ever
changes, but the guard prevents future regressions from silently continuing.

### 3. Stop before next-slice selection in slice mode

Before the existing `if [[ "$PHASE" == "unified" ]]` next-slice branch, add:

```bash
if [[ "$AUTO_SCOPE" == "slice" && "$PHASE" == "unified" ]]; then
  log "Auto (this slice) complete for $START_SLICE."
  log "   Run /gsd-cc to review and choose the next step."
  break
fi
```

This preserves the router's next action:

- `current_slice` remains the completed slice
- `/gsd-cc` sees `S{nn}-UNIFY.md`
- the user gets asked whether to continue with the next slice

### 4. Make REASSESS milestone-only

After mandatory UNIFY succeeds, branch on scope:

```bash
if [[ "$AUTO_SCOPE" == "slice" ]]; then
  log "UNIFY complete for $START_SLICE."
  log "Auto (this slice) complete."
  break
fi
```

Only run the current `REASSESS after UNIFY` block for:

```bash
[[ "$AUTO_SCOPE" == "milestone" ]]
```

This prevents slice mode from mutating the roadmap or writing the next slice
into state before the user reviews the result.

### 5. Persist scope consistently from the router

Update `gsd-cc/skills/gsd-cc/SKILL.md` so each auto choice writes the scope
before delegating:

- `Auto (this slice)` writes `auto_mode_scope: slice`
- `Auto (full milestone)` writes `auto_mode_scope: milestone`

If `auto_mode_scope` is absent in `STATE.md`, the router should insert it near
the existing auto fields instead of relying on replacement-only edits.

### 6. Add `auto_mode_scope` to the state template

Update `gsd-cc/templates/STATE.md`:

```yaml
auto_mode: false
auto_mode_scope: slice
```

The default documents the safe behavior for new projects and prevents direct
`/gsd-cc-auto` runs from being ambiguous.

### 7. Show scope in `/gsd-cc-auto`

Update `gsd-cc/skills/auto/SKILL.md` so the preflight summary includes:

```text
Scope: this slice
```

or:

```text
Scope: full milestone
```

Also add the stop condition:

```text
- Slice complete - current slice unified in slice mode
```

This makes the runtime promise visible before any autonomous work starts.

## Files Expected To Change

- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/skills/auto/SKILL.md`
- `gsd-cc/skills/gsd-cc/SKILL.md`
- `gsd-cc/templates/STATE.md`

Possible additions:

- `gsd-cc/test/auto-scope.test.sh`
- or `gsd-cc/test/auto-scope.test.js`
- `gsd-cc/package.json` if a test script is added

## Test Strategy

Use temporary repositories and a stub `claude` binary so the tests do not call
the real Claude CLI.

The fixture should create:

- `.gsd/STATE.md`
- `.gsd/M001-ROADMAP.md`
- `.gsd/S01-PLAN.md`
- `.gsd/S01-T01-PLAN.xml`
- `.gsd/S01-T01-SUMMARY.md`
- optional `.gsd/S01-UNIFY.md`
- a fake installed skill directory containing `auto-loop.sh` and prompts

The fake `claude` command can inspect the prompt and write deterministic
outputs:

- for UNIFY prompts, write `.gsd/S01-UNIFY.md` and set `phase: unified`
- for REASSESS prompts, write a marker file such as
  `.gsd/M001-REASSESS-S01.md`
- for plan/apply prompts, write marker files so tests can prove whether the
  loop continued

### Test 1: Slice mode stops after UNIFY

Setup:

- `auto_mode_scope: slice`
- `current_slice: S01`
- `phase: apply-complete`
- roadmap contains `S01` and `S02`

Expected:

- `S01-UNIFY.md` exists
- `current_slice` remains `S01`
- no `M001-REASSESS-S01.md` exists
- no marker for `S02` planning or apply exists
- log contains `Auto (this slice) complete`
- log does not contain `Moving to next slice`

### Test 2: Slice mode stops when already unified

Setup:

- `auto_mode_scope: slice`
- `current_slice: S01`
- `phase: unified`
- `S01-UNIFY.md` already exists
- roadmap contains pending `S02`

Expected:

- loop exits without dispatching `claude`
- `current_slice` remains `S01`
- no `S02` artifacts are created

### Test 3: Milestone mode still advances

Setup:

- `auto_mode_scope: milestone`
- `current_slice: S01`
- `phase: unified`
- `S01-UNIFY.md` exists
- roadmap contains pending `S02`

Expected:

- loop selects `S02`
- `current_slice` becomes `S02`
- `current_task` becomes `T01`
- phase becomes `plan` or `plan-complete` according to existing artifacts
- log contains `Moving to next slice: S02`

### Test 4: Missing scope defaults to slice

Setup:

- no `auto_mode_scope` field
- same as Test 1

Expected:

- same behavior as slice mode
- log contains the missing-scope warning

### Test 5: Invalid scope stops before work

Setup:

- `auto_mode_scope: banana`
- valid slice artifacts

Expected:

- loop exits non-zero
- no `claude` dispatch occurs
- log or stderr names the invalid value and expected values

### Test 6: REASSESS is milestone-only

Run the apply-complete UNIFY path twice:

- once with `auto_mode_scope: slice`
- once with `auto_mode_scope: milestone`

Expected:

- slice mode writes UNIFY but no reassess marker
- milestone mode writes both UNIFY and reassess marker

## Implementation Phases

### Phase A: Add tests around current behavior

Create the temporary-fixture test harness and first failing tests:

- slice mode stops after UNIFY
- milestone mode advances
- invalid scope fails

These tests should fail against the current loop because `auto_mode_scope` is
ignored.

### Phase B: Implement scope parsing and guards

Change `auto-loop.sh` to:

- read and normalize `auto_mode_scope`
- store `START_SLICE`
- stop on `phase: unified` in slice mode
- skip REASSESS in slice mode
- keep milestone mode behavior unchanged

### Phase C: Align router and state docs

Update:

- router instructions for writing `auto_mode_scope`
- state template default
- auto-mode preflight copy and stop-condition list

### Phase D: Expand regression coverage

Add the remaining tests:

- missing scope defaults to slice
- already-unified slice does not advance
- REASSESS only runs in milestone mode

### Phase E: Manual smoke test

Run a minimal local smoke test in `/tmp`:

1. create two roadmap slices
2. set `auto_mode_scope: slice`
3. start from `apply-complete`
4. verify the loop stops after `S01-UNIFY.md`
5. switch to `auto_mode_scope: milestone`
6. verify the loop advances to `S02`

## Acceptance Criteria

- Choosing `Auto (this slice)` cannot execute, plan, or reassess the next
  slice.
- Choosing `Auto (full milestone)` preserves the existing multi-slice loop.
- Direct or legacy auto runs without `auto_mode_scope` default to one slice.
- Invalid scope values stop before autonomous work begins.
- Runtime logs make the chosen scope and stop reason obvious.
- Automated tests cover slice, milestone, missing-scope, invalid-scope, and
  REASSESS branching.

## Suggested Atomic Commits

1. `test(auto): cover auto-mode scope boundaries`
2. `fix(auto): stop slice scope after UNIFY`
3. `docs(auto): document auto-mode scope state`
