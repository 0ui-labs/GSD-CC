# Base Branch Detection Implementation Plan

## Goal

Remove hardcoded `main` assumptions from GSD-CC Git workflows.

The target outcome is:

- GSD-CC detects or records the repository base branch once
- planning creates slice branches from the configured base branch
- Apply checks pre-existing test failures against the configured base branch
- UNIFY squash-merges back to the configured base branch
- auto-mode prompts use the same base branch contract as manual skills
- repositories using `master`, `develop`, `trunk`, or another base branch work
  without instruction edits

## Why This Change Comes Seventh

GSD-CC currently assumes `main` in user-facing workflow instructions:

- `gsd-cc/skills/apply/SKILL.md` tells Apply to verify pre-existing test
  failures by checking whether the same test fails on `main`
- `gsd-cc/skills/unify/SKILL.md` tells UNIFY to squash-merge back to `main`
- `gsd-cc/skills/auto/unify-instructions.txt` repeats the same `main` merge
  commands

Many real repositories do not use `main`:

- older repositories often use `master`
- release flows may use `develop`
- monorepos or trunk-based teams may use `trunk`
- local-only repositories may have no remote default branch yet

Hardcoding `main` makes the tool brittle at exactly the point where it is
allowed to switch branches and merge work.

## Current Problem

### Apply uses `main` for pre-existing failures

The manual Apply skill says:

```text
If the failure is pre-existing (verify by checking: does the same test also
fail on `main`?): note it in the summary under Issues, but proceed.
```

That is wrong when the base branch is not `main`. It can also encourage unsafe
branch switching during a dirty task unless the workflow is more explicit.

### UNIFY merges to `main`

The manual UNIFY skill says:

```bash
git checkout main
git merge --squash gsd/M{n}/S{nn}
git commit -m "feat(M{n}/S{nn}): {slice name}"
```

The auto UNIFY prompt repeats this. In a `master`, `develop`, or `trunk`
repository, that command either fails or creates/uses the wrong target.

### Planning does not record the base

Planning creates slice branches with:

```bash
git checkout -b gsd/M{n}/S{nn}
```

That branch is created from whatever branch the user happens to be on. If the
user starts planning from a stale feature branch, the slice branch inherits the
wrong base.

## Non-Goals

- Redesign the full Git strategy.
- Support multiple simultaneous base branches inside one milestone.
- Replace the per-slice branch model.
- Add remote push or pull automation.
- Automatically resolve merge conflicts.
- Delete slice branches after merge.

This phase only makes the existing branch workflow base-branch aware.

## Behavioral Contract

### Base branch source of truth

GSD-CC should store the chosen base branch in project state, preferably:

```yaml
base_branch: main
```

in `.gsd/STATE.md`, and optionally in `.gsd/CONFIG.md` later if broader
configuration is introduced.

`STATE.md` is the right first step because every relevant skill already reads
it.

### Detection order

When `base_branch` is missing, detect it in this order:

1. existing `.gsd/STATE.md` field `base_branch`
2. existing `.gsd/CONFIG.md` field `base_branch`, if that file exists
3. environment variable `GSD_CC_BASE_BRANCH`
4. remote default branch from `origin/HEAD`
5. current branch if it is not a GSD slice branch
6. common local branch names in order: `main`, `master`, `trunk`, `develop`

If none can be detected, stop and ask the user to choose or set one. Do not
invent `main`.

### Slice branch creation

When planning a slice:

1. resolve `base_branch`
2. ensure the base branch exists locally
3. ensure worktree safety before switching
4. checkout the base branch
5. create the slice branch from that base

Recommended command shape:

```bash
git switch {base_branch}
git switch -c gsd/M{n}/S{nn}
```

If `git switch` is not available, `git checkout` fallback is acceptable.

If the slice branch already exists, check it out and verify it is based on the
configured base branch or warn before continuing.

### UNIFY merge target

UNIFY must merge into `base_branch`, not `main`:

```bash
git switch {base_branch}
git merge --squash gsd/M{n}/S{nn}
git commit -m "feat(M{n}/S{nn}): {slice name}"
```

The UNIFY report should also say:

```text
Merged: gsd/M{n}/S{nn} -> {base_branch}
```

### Apply pre-existing test check

Apply should refer to `base_branch`:

```text
If the failure is pre-existing, verify whether the same test also fails on the
configured base branch.
```

It should also warn that this check must not discard or mix task changes.
Safe options:

- run the comparison in a clean worktree
- use a temporary worktree created from `base_branch`
- skip the comparison and note that the worktree was not safe to switch

### Config override

Add or update `/gsd-cc-config` later so users can change the base branch:

```text
Base branch: main
```

For the first implementation, direct `STATE.md` editing plus detection is
enough. A config UI is useful but not required to remove hardcoded `main`.

## Proposed Implementation

### 1. Add `base_branch` to the state template

Update `gsd-cc/templates/STATE.md`:

```yaml
base_branch: main
```

If a repository's detected branch is not `main`, Seed or roadmap setup should
replace this value with the detected branch before writing the real
`.gsd/STATE.md`.

If template-time dynamic replacement is awkward, use:

```yaml
base_branch: ""
```

and require the router or planning step to fill it before branch operations.

Preferred direction:

- template includes `base_branch: ""`
- first Git-aware phase detects and writes the actual branch

This avoids pretending every repo starts on `main`.

### 2. Add base branch detection instructions to the router

Update `gsd-cc/skills/gsd-cc/SKILL.md` so early routing includes a Git base
check when a roadmap or slice planning is about to begin.

The router should:

- read `base_branch` from `STATE.md`
- if missing, detect it with safe Git commands
- write it to `STATE.md`
- include it in the current-position context when branch actions are next

Recommended detection commands:

```bash
git symbolic-ref --short refs/remotes/origin/HEAD
git branch --show-current
git show-ref --verify --quiet refs/heads/main
git show-ref --verify --quiet refs/heads/master
git show-ref --verify --quiet refs/heads/trunk
git show-ref --verify --quiet refs/heads/develop
```

When parsing `origin/HEAD`, strip the `origin/` prefix.

### 3. Update planning branch creation

Update:

- `gsd-cc/skills/plan/SKILL.md`
- `gsd-cc/skills/auto/plan-instructions.txt`

Replace:

```bash
git checkout -b gsd/M{n}/S{nn}
```

with base-aware instructions:

```bash
git switch {base_branch}
git switch -c gsd/M{n}/S{nn}
```

Add safety language:

- do not switch branches with uncommitted unrelated changes
- if switching is unsafe, stop and ask the user to resolve the worktree
- if the slice branch already exists, switch to it instead of recreating it

### 4. Update Apply pre-existing failure language

Update:

- `gsd-cc/skills/apply/SKILL.md`
- `gsd-cc/skills/auto/apply-instructions.txt` if similar regression-check
  language is added there later

Replace `main` with `base_branch`.

Add a safer comparison method:

```bash
git worktree add /tmp/gsd-cc-base-check-{pid} {base_branch}
```

Run the same test in that temporary worktree if needed, then remove the
worktree. If worktree creation fails, note the limitation in the summary
instead of switching away from the active task branch.

### 5. Update UNIFY merge instructions

Update:

- `gsd-cc/skills/unify/SKILL.md`
- `gsd-cc/skills/auto/unify-instructions.txt`

Replace `main` with `{base_branch}` everywhere:

- merge heading
- commands
- explanatory text
- final report text

Add a preflight:

1. read `base_branch` from `STATE.md`
2. verify the branch exists locally
3. verify the current slice branch exists
4. verify the worktree is clean enough to merge
5. only then switch to `base_branch`

### 6. Update auto-loop allowed tools if needed

`auto-loop.sh` already allows:

```text
Bash(git checkout *)
Bash(git merge *)
Bash(git commit *)
```

If prompts move to `git switch`, add:

```text
Bash(git switch *)
```

for plan and UNIFY dispatches.

If temporary worktrees are recommended for Apply checks, add only the narrow
Git commands needed in the relevant dispatch path, or keep that comparison as a
manual skill instruction first.

### 7. Add fallback helper documentation

Document the base branch resolution in one reusable place, likely:

```text
gsd-cc/templates/GIT.md
```

or a short section in:

```text
gsd-cc/skills/gsd-cc/SKILL.md
```

Avoid repeating the full detection algorithm in every skill. Skills that need
it should say:

```text
Use `base_branch` from `.gsd/STATE.md`. If missing, run the router's base
branch detection before continuing.
```

## Files Expected To Change

- `gsd-cc/templates/STATE.md`
- `gsd-cc/skills/gsd-cc/SKILL.md`
- `gsd-cc/skills/plan/SKILL.md`
- `gsd-cc/skills/apply/SKILL.md`
- `gsd-cc/skills/unify/SKILL.md`
- `gsd-cc/skills/auto/plan-instructions.txt`
- `gsd-cc/skills/auto/unify-instructions.txt`
- `gsd-cc/skills/auto/auto-loop.sh` if `git switch` is used in auto prompts
- `gsd-cc/test/base-branch.test.js` or equivalent

Possible additions:

- `gsd-cc/templates/GIT.md`
- `gsd-cc/test/helpers/git-fixture.js`

## Test Strategy

Use temporary Git repositories. Do not run tests against the real repository.

### Test 1: Detect remote default branch

Setup:

- temp repo
- local branch `develop`
- fake or real `origin/HEAD` pointing to `origin/develop`
- no `base_branch` in `STATE.md`

Expected:

- detection returns `develop`
- `STATE.md` is updated with `base_branch: develop`

### Test 2: Detect local `master`

Setup:

- temp repo initialized with `master`
- no remote
- no `main`

Expected:

- detection returns `master`
- no command assumes `main`

### Test 3: Existing state value wins

Setup:

- temp repo has both `main` and `develop`
- `STATE.md` says `base_branch: develop`

Expected:

- planning and UNIFY instructions use `develop`
- detection does not overwrite it with `main`

### Test 4: Plan creates slice branch from base

Setup:

- base branch `trunk`
- current branch is another feature branch
- clean worktree

Expected:

- planning switches to `trunk`
- creates `gsd/M001/S01`
- slice branch ancestry includes `trunk` HEAD

### Test 5: Dirty worktree prevents branch switch

Setup:

- base branch `main`
- current branch has uncommitted changes

Expected:

- planning does not switch branches
- no slice branch is created
- message tells the user to commit, stash, or clean the worktree

### Test 6: UNIFY merges to configured base

Setup:

- base branch `master`
- slice branch `gsd/M001/S01`
- slice branch has one commit

Expected:

- UNIFY instructions or test harness squash-merge into `master`
- no `main` branch is created
- final report says `-> master`

### Test 7: Apply text has no hardcoded `main`

Text-level test:

- search Git workflow skill files for hardcoded `` `main` `` or
  `git checkout main`
- allow only examples that explicitly discuss `main` as one possible branch
  among others

Expected:

- no operational instruction hardcodes `main`

## Implementation Phases

### Phase A: Add tests and text checks

Add failing tests for:

- `master` repo
- `develop` repo
- hardcoded `main` text
- configured `base_branch` precedence

These tests should fail before the docs and prompt updates.

### Phase B: Add state field and detection contract

Update `STATE.md` template and router instructions so `base_branch` is present
or detected before Git branch operations.

### Phase C: Update planning branch creation

Make manual and auto planning create slice branches from `base_branch`.

### Phase D: Update Apply and UNIFY

Replace hardcoded `main` references with `base_branch` and add safe preflight
steps.

### Phase E: Update auto-loop permissions

If prompts now use `git switch`, add the required allowed tool pattern in
`auto-loop.sh`.

### Phase F: Manual smoke test

In `/tmp`, create three repos:

1. default branch `master`
2. default branch `develop`
3. default branch `trunk`

For each:

- create `.gsd/STATE.md` with or without `base_branch`
- run the detection flow
- plan a slice branch
- simulate UNIFY squash merge
- confirm no unwanted `main` branch appears

## Acceptance Criteria

- No operational skill instruction hardcodes `main` as the merge target.
- `STATE.md` records a `base_branch` or the router detects one before Git
  branch operations.
- Slice branches are created from the configured base branch.
- UNIFY squash-merges into the configured base branch.
- Apply's pre-existing failure check refers to the configured base branch.
- Auto prompts and manual skills use the same branch contract.
- Tests cover `main`, `master`, `develop`, `trunk`, and explicit override
  cases.

## Suggested Atomic Commits

1. `test(git): Cover configurable base branches`
2. `feat(state): Record repository base branch`
3. `docs(git): Use base branch in workflows`
4. `fix(auto): Allow base-aware branch commands`

