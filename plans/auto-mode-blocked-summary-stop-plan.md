# Auto-Mode Partial And Blocked Stop Plan

## Goal

Make auto-mode stop cleanly when a task summary reports `partial` or
`blocked`.

The target outcome is:

- auto-mode reads the task summary status immediately after each apply dispatch
- `partial` and `blocked` are treated as intentional stop states
- auto-mode does not retry, commit, advance, or run UNIFY for incomplete tasks
- `.gsd/STATE.md` is left in `phase: apply-blocked`
- logs explain the actual task status and point to the summary file
- tests cover `complete`, `partial`, `blocked`, missing, and invalid statuses

## Why This Change Comes Sixth

The apply instructions define three task outcomes:

- `complete`
- `partial`
- `blocked`

Only `complete` means the loop can continue. A summary file with `partial` or
`blocked` is not proof that the task is done. It is proof that auto-mode found
something it cannot safely finish without human review or replanning.

This matters because auto-mode is allowed to keep running in the background.
When it sees an incomplete task, it must stop for the right reason and preserve
the evidence.

## Current Problem

The current loop has a good narrow fallback commit guard, but the task-result
decision is still not first-class enough.

After an apply dispatch, `auto-loop.sh` checks whether the expected summary
file exists:

```bash
EXPECTED_SUMMARY="$GSD_DIR/${SLICE}-${TASK}-SUMMARY.md"
if [[ ! -f "$EXPECTED_SUMMARY" ]]; then
  ...
fi
RETRY_COUNT=0
```

Then the Git fallback path reads the summary status and refuses to commit if it
is not `complete`.

That is safe from a Git perspective, but it is the wrong primary behavior for
`partial` and `blocked`:

- the loop can report a Git fallback failure instead of a task-status stop
- state may stay in `applying` if the apply agent wrote the summary but did
  not update `STATE.md` correctly
- future router logic may see a summary file and accidentally skip the blocked
  task unless `phase: apply-blocked` is set
- incomplete task statuses are not logged as the main reason auto-mode stopped

The fix is to make summary status validation happen before fallback commits,
next-task selection, or success logging.

## Behavioral Contract

### Status `complete`

If `.gsd/S{nn}-T{nn}-SUMMARY.md` has:

```markdown
## Status
complete
```

auto-mode may continue, subject to existing checks:

- fallback commit safety
- updated state validation
- retry and budget logic
- next task or UNIFY transition

### Status `partial`

If the summary status is `partial`, auto-mode must:

- update or preserve `phase: apply-blocked`
- preserve `current_slice` and `current_task`
- set or preserve `blocked_reason`
- skip fallback commit
- skip retry
- skip next task
- skip UNIFY
- stop with a message naming the summary file

### Status `blocked`

If the summary status is `blocked`, auto-mode must follow the same stop path as
`partial`, with log copy that says the task is blocked.

### Missing summary

If the summary file is missing, keep the existing retry behavior:

- retry up to `MAX_RETRIES`
- then stop as stuck

Missing summary means the agent did not finish the expected apply protocol.
`partial` and `blocked` mean it did finish the protocol with a non-continuable
result.

### Unknown or malformed status

If the summary exists but status is missing or not one of:

- `complete`
- `partial`
- `blocked`

auto-mode must stop as an invalid task summary. It should not retry, because
the artifact exists and needs inspection or repair.

## Proposed Implementation

### 1. Add a task outcome helper

Add a helper near `extract_summary_status`:

```bash
classify_task_summary() {
  local summary_path="$1"
  local status

  if [[ ! -f "$summary_path" ]]; then
    echo "missing"
    return 0
  fi

  status=$(extract_summary_status "$summary_path")
  case "$status" in
    complete|partial|blocked) echo "$status" ;;
    "") echo "invalid:missing-status" ;;
    *) echo "invalid:$status" ;;
  esac
}
```

Keep `extract_summary_status` small, but make it tolerant of:

- leading and trailing whitespace
- status written as `**complete**`
- status written as `- complete`
- status written with inline notes, for example `complete - all ACs pass`

The normalized output should still be exactly one of `complete`, `partial`, or
`blocked`.

### 2. Add an apply stop helper

Add a helper that records an incomplete task stop:

```bash
stop_for_incomplete_task() {
  local slice="$1"
  local task="$2"
  local status="$3"
  local summary_path="$4"

  update_state_field "current_slice" "$slice"
  update_state_field "current_task" "$task"
  update_state_field "phase" "apply-blocked"
  ensure_state_field "blocked_reason" "${status}: see ${summary_path}"
  update_state_field "last_updated" "$(date -Iseconds)"

  log "Task ${slice}/${task} is ${status}. Stopping auto-mode."
  log "Review ${summary_path}, then run /gsd-cc to choose retry, skip, or replan."
}
```

If `ensure_state_field` does not exist yet, add it:

```bash
ensure_state_field() {
  local field="$1" value="$2"
  if grep -q "^${field}:" "$GSD_DIR/STATE.md"; then
    update_state_field "$field" "$value"
  else
    # insert near phase/current_task in frontmatter or append before closing ---
  fi
}
```

The implementation detail can stay simple in the first pass. The important
contract is that `blocked_reason` exists after the stop.

### 3. Check summary status immediately after apply dispatch

In the existing apply stuck-detection block, after confirming the summary file
exists, classify it:

```bash
outcome=$(classify_task_summary "$EXPECTED_SUMMARY")

case "$outcome" in
  complete)
    RETRY_COUNT=0
    ;;
  partial|blocked)
    stop_for_incomplete_task "$SLICE" "$TASK" "$outcome" "$EXPECTED_SUMMARY"
    break
    ;;
  invalid:*)
    log "Invalid status in $EXPECTED_SUMMARY: ${outcome#invalid:}"
    log "Expected complete, partial, or blocked. Stopping auto-mode."
    break
    ;;
esac
```

This must happen before `run_apply_fallback_commit`.

### 4. Skip fallback commit for incomplete tasks

Once the early outcome check exists, `run_apply_fallback_commit` should only be
called after a `complete` outcome.

Keep the existing fallback status check anyway as defense in depth. That guard
protects against future refactors that accidentally call fallback too early.

### 5. Align auto apply instructions

Update `gsd-cc/skills/auto/apply-instructions.txt` to match the manual apply
skill.

It should explicitly say:

- if status is `complete` and more tasks remain:
  `current_task: T{nn+1}`, `phase: applying`
- if status is `complete` and this is the last task:
  `phase: apply-complete`, `unify_required: true`
- if status is `partial` or `blocked`:
  `current_task: T{nn}`, `phase: apply-blocked`,
  `blocked_reason: {brief reason}`

It should also say:

- do not commit `partial` or `blocked`
- do not ask the user while in auto-mode
- leave the summary as the evidence artifact

### 6. Validate state after apply dispatch

After a `complete` task, read `STATE.md` again and verify it is one of:

- `applying`
- `apply-complete`

If the summary status is `complete` but the phase remains `apply-blocked`,
stop and log the mismatch. If the summary is `partial` or `blocked` but state
does not become `apply-blocked`, the new stop helper repairs it before exit.

This closes the gap between summary truth and state truth.

### 7. Improve final logging

Only log:

```text
S01/T02 complete.
```

for summary status `complete`.

For incomplete statuses, log:

```text
S01/T02 partial. Auto-mode stopped before commit or next task.
```

or:

```text
S01/T02 blocked. Auto-mode stopped before commit or next task.
```

No incomplete task should end with a generic "complete" line.

## Files Expected To Change

- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/skills/auto/apply-instructions.txt`
- `gsd-cc/skills/apply/SKILL.md` if manual and auto summary language needs
  one more consistency pass
- `gsd-cc/test/auto-mode-blocked-summary.test.js` or the shared auto-mode test
  file from the automated testing plan

Possible support files:

- `gsd-cc/test/helpers/auto-mode-fixture.js`
- `gsd-cc/test/helpers/state-file.js`

## Test Strategy

Use a temporary Git repository and a fake `claude` executable. The fake
`claude` should write task summaries and update `STATE.md` according to each
test case.

### Test 1: Complete summary continues

Setup:

- `phase: applying`
- `current_slice: S01`
- `current_task: T01`
- fake `claude` writes summary status `complete`
- fake `claude` updates state to `current_task: T02`, `phase: applying`

Expected:

- auto-mode does not stop because of the summary status
- fallback commit path is allowed to run if needed
- log contains `S01/T01 complete`
- state advances to `T02`

### Test 2: Partial summary stops cleanly

Setup:

- fake `claude` writes summary status `partial`
- fake `claude` leaves state in `applying` to prove the loop repairs it

Expected:

- auto-mode exits after the task
- `phase: apply-blocked`
- `current_task: T01`
- `blocked_reason` exists
- no fallback commit is attempted
- no next task starts
- log contains `Task S01/T01 is partial`
- log points to `.gsd/S01-T01-SUMMARY.md`

### Test 3: Blocked summary stops cleanly

Same as Test 2, but summary status is `blocked`.

Expected:

- `phase: apply-blocked`
- no commit
- no retry
- no next task
- no UNIFY
- log contains `Task S01/T01 is blocked`

### Test 4: Missing summary still retries

Setup:

- fake `claude` writes no summary

Expected:

- existing retry behavior remains
- after `MAX_RETRIES`, auto-mode stops as stuck
- state is not rewritten to `apply-blocked` just because the summary is absent

### Test 5: Invalid summary status stops as invalid

Setup:

- fake `claude` writes:

```markdown
## Status
done-ish
```

Expected:

- auto-mode stops
- no retry
- no fallback commit
- log says the status is invalid and lists expected values

### Test 6: Summary parser normalizes common variants

Unit-level coverage for `extract_summary_status` or its Node equivalent:

- `complete`
- `Complete`
- `**complete**`
- `- complete`
- `complete - all ACs pass`
- `partial`
- `blocked`

Expected:

- all valid variants normalize to `complete`, `partial`, or `blocked`

### Test 7: Last task partial does not run UNIFY

Setup:

- current task is the last task in the slice
- fake `claude` writes status `partial`

Expected:

- no `S01-UNIFY.md` is created
- phase is `apply-blocked`
- log does not contain `Running mandatory UNIFY`

## Implementation Phases

### Phase A: Add failing tests

Add tests for:

- partial summary stops
- blocked summary stops
- invalid status stops
- missing summary still retries

These tests should fail or produce misleading log reasons before the runtime
change.

### Phase B: Add summary classification helpers

Implement:

- stronger status normalization
- `classify_task_summary`
- `ensure_state_field`
- `stop_for_incomplete_task`

Keep the existing fallback commit status guard.

### Phase C: Wire early apply outcome handling

Move the status decision into the apply post-dispatch block before fallback
commit.

Ensure `run_apply_fallback_commit` is called only after a `complete` outcome.

### Phase D: Align auto apply instructions

Update `apply-instructions.txt` so the agent writes `apply-blocked` for
`partial` and `blocked`.

Check the manual apply skill for consistent wording.

### Phase E: Manual smoke test

In `/tmp`, run auto-mode with fake `claude` for three cases:

1. summary status `complete`
2. summary status `partial`
3. summary status `blocked`

Confirm:

- complete can proceed
- partial and blocked stop without commit
- state and logs match the expected stop reason

## Acceptance Criteria

- Auto-mode reads summary status before fallback commit.
- Summary status `partial` stops auto-mode as a task outcome, not as a Git
  fallback error.
- Summary status `blocked` stops auto-mode as a task outcome, not as a Git
  fallback error.
- Incomplete tasks leave `STATE.md` at `phase: apply-blocked`.
- Incomplete tasks preserve `current_slice` and `current_task`.
- Incomplete tasks do not retry, commit, advance, or run UNIFY.
- Missing summary behavior still uses the existing retry path.
- Invalid summary status stops with a clear repair hint.
- Tests cover complete, partial, blocked, missing, invalid, and last-task
  partial behavior.

## Suggested Atomic Commits

1. `test(auto): Cover incomplete task summaries`
2. `fix(auto): Stop cleanly on partial tasks`
3. `fix(auto): Stop cleanly on blocked tasks`
4. `docs(auto): Align apply summary status rules`
