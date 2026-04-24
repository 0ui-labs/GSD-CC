# Auto-Mode Git Safety Implementation Plan

## Goal

Make auto-mode Git behavior safe and deterministic so fallback commits can
never stage or commit unrelated repository changes.

The target outcome is:

- no repo-wide fallback staging
- task-scoped commits only
- explicit dirty-worktree guards
- fallback behavior that prefers stopping safely over guessing

## Why This Change Comes Third

After installer safety and task-plan consistency, the next biggest risk is that
auto-mode can currently pick up unrelated changes from a dirty worktree and
commit them under a generic task commit.

That breaks trust in the tool. Even if the task implementation itself is
correct, a broad fallback commit can silently mix in user edits, prior failed
attempts, or unrelated generated files.

## Current Problems

1. `auto-loop.sh` currently stages repo-wide tracked diffs via
   `git diff --name-only HEAD | xargs git add`.
2. It also stages broad `.gsd/*.md` and `.gsd/*.jsonl` files regardless of
   whether they belong to the current task.
3. The fallback commit does not verify that the current task finished with
   status `complete`.
4. The fallback commit message is generic and does not explain why fallback was
   needed.
5. There is no explicit guard for dirty worktrees containing unrelated tracked
   or untracked files.
6. The runtime behavior contradicts the task instructions, which explicitly say
   to stage only files changed by the task and never use broad adds.

## Non-Goals

- Redesign all Git usage in GSD-CC outside auto-mode fallback handling.
- Force a universal commit-message convention on every user project.
- Solve installer-owned file tracking in this phase.

## Safety Principles

1. If ownership of a changed file is unclear, do not commit it.
2. Task scope must come from explicit task artifacts, not from current repo
   diff heuristics alone.
3. Auto-mode may stop and ask the user to resolve Git state later rather than
   guessing.
4. A successful fallback commit must be traceable to one task and one task
   only.
5. Metadata files should be committed only when they belong to the current task
   transition.

## Proposed Behavioral Contract

### Primary rule

The normal path is that the task execution step commits its own changes.

The fallback path exists only as a narrow recovery mechanism for cases where:

- the task completed successfully
- expected task artifacts exist
- the diff can be proven to belong only to the current task

If those conditions are not true, auto-mode must stop without committing.

### Allowed fallback inputs

Fallback commit scope should be derived from:

1. the current task plan file
2. the current task summary file
3. the known per-task state files written during execution

### Forbidden fallback behavior

- no `git diff --name-only HEAD` staging across the whole repo
- no broad `git add "$GSD_DIR"/*.md`
- no commit when unrelated untracked files exist outside the allowed scope
- no commit when the task summary status is `partial` or `blocked`

## Proposed Implementation

### 1. Remove repo-wide fallback staging

Delete the current broad fallback block in `auto-loop.sh` and replace it with a
task-scoped fallback helper.

The helper should stage only an explicit allowlist of paths.

### 2. Define a task-scoped allowlist

Build the fallback allowlist from the current task context:

- files declared in the current task plan `<files>` section
- `.gsd/${SLICE}-${TASK}-SUMMARY.md`
- `.gsd/STATE.md`

Optional additional metadata files may be allowed only if they are proven to be
written by the current task flow, for example a task-local log or a required
per-slice planning artifact.

Files that should not be included by default:

- `.gsd/COSTS.jsonl`
- `.gsd/auto.log`
- unrelated `.gsd/*.md` files
- any repo file not explicitly mentioned by the task plan

### 3. Parse the task plan for owned files

Add a small helper in `auto-loop.sh` to extract the `<files>` section from the
current task plan and normalize it into relative repo paths.

Normalization rules should include:

- trim whitespace
- ignore empty lines
- ignore comments or descriptive labels
- reject paths outside the repo root

If parsing fails or yields no reliable file list, fallback commit must not run.

### 4. Gate fallback on task status

Before any fallback staging:

1. read `.gsd/${SLICE}-${TASK}-SUMMARY.md`
2. extract the task status
3. only continue if the status is `complete`

If the summary is missing or status is not `complete`, log the reason and stop
auto-mode without attempting a fallback commit.

### 5. Add dirty-worktree classification

Introduce a pre-commit classification step that separates changed files into:

- allowed tracked changes
- allowed untracked files
- disallowed tracked changes
- disallowed untracked files

If any disallowed file exists, fallback commit must abort and log a clear error.

Example message:

```text
Fallback commit aborted: unrelated changes detected.
Current task: S02/T03
Unrelated files:
- src/experimental.js
- docs/notes.md
Resolve or stash unrelated worktree changes before restarting auto-mode.
```

### 6. Add startup or loop-time Git guards

Choose one of these approaches during implementation:

1. strict startup guard:
   refuse to start auto-mode if the worktree is dirty before the current task
   begins
2. narrower loop-time guard:
   allow startup, but refuse fallback commit if unrelated changes are present

Preferred approach:

- loop-time guard as the minimum safe change
- optional startup warning if the worktree is already dirty when auto-mode
  begins

This avoids breaking every existing workflow immediately while still removing
the unsafe commit behavior.

### 7. Improve fallback commit metadata

If fallback commit is allowed, generate a commit that is still task-specific.

Minimum subject:

```text
feat(S{nn}/T{nn}): {task name}
```

Recommended body:

- explain that auto-mode completed the task but applied fallback Git handling
- state that only task-scoped files were staged

If commit-message generation cannot be done reliably from the task plan, stop
instead of inventing a vague message.

### 8. Decide whether fallback commit should exist at all

During implementation, evaluate these two end states:

1. keep a narrow fallback commit path
2. remove fallback commit entirely and treat missing task commit as a hard stop

Preferred initial direction:

- keep a narrow fallback for complete tasks only
- stop if task ownership cannot be proven

This gives us a safer incremental change while preserving some resilience.

## Runtime Checks To Add

### Before fallback commit

- current task plan exists
- current task summary exists
- summary status is `complete`
- task file allowlist parses successfully
- all changed files are a subset of the allowlist plus approved task metadata

### If any check fails

- do not run `git add`
- do not run `git commit`
- log the exact reason
- stop auto-mode so the user can inspect the worktree

## Files Expected To Change

- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/skills/auto/apply-instructions.txt`
- possibly `gsd-cc/skills/apply/SKILL.md` if the fallback contract is
  documented there too
- help or tutorial docs only if they describe fallback behavior explicitly

## Verification Plan

### Static verification

- confirm `auto-loop.sh` no longer stages repo-wide diffs
- confirm no broad `.gsd/*.md` staging remains in fallback logic
- confirm fallback reads task summary status before committing

### Manual smoke tests

1. Run auto-mode on a clean worktree and confirm a normal task-owned commit
   still succeeds.
2. Simulate a missing in-task commit for a `complete` task and confirm fallback
   stages only files from the task plan plus approved task metadata.
3. Add an unrelated modified tracked file and confirm fallback aborts without
   staging anything.
4. Add an unrelated untracked file and confirm fallback aborts without
   committing.
5. Mark a task summary as `partial` and confirm fallback refuses to commit.
6. Confirm `.gsd/COSTS.jsonl` and `auto.log` are not accidentally pulled into a
   task commit.

### Success criteria

- unrelated dirty-worktree changes are never committed by fallback
- fallback commits only complete tasks
- fallback scope is derived from task ownership, not repo-wide diffs
- failure mode is an explicit stop, not a silent best effort

## Commit Strategy

Planned atomic commits:

1. remove repo-wide fallback staging and add task-scoped file classification
2. gate fallback on summary status and owned-file parsing
3. align instruction docs with the new fallback contract

## Open Questions

1. Whether `.gsd/STATE.md` should always be included in the fallback commit or
   only when it changed in the current task.
2. Whether task plans need a dedicated machine-readable field for commit-owned
   files instead of reusing `<files>`.
3. Whether auto-mode should refuse to start entirely when the repo is already
   dirty.
4. Whether fallback should create a different commit body marker so users can
   distinguish direct task commits from recovery commits in history.

## Exit Criteria

This phase is done when:

- auto-mode can no longer stage arbitrary repo diffs in fallback mode
- fallback commits are limited to explicit task-owned files
- dirty-worktree conflicts cause a safe stop instead of an unsafe commit
- documentation no longer contradicts runtime Git behavior
