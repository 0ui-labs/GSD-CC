# Automated Testing Foundation Implementation Plan

## Goal

Add a small automated test suite for the safety-critical parts of GSD-CC.

The target outcome is:

- tests run without touching the developer's real `~/.claude`
- installer and uninstaller behavior is covered with temporary homes
- hook activation and executable behavior are covered
- missing dependency behavior is covered, especially missing `jq`
- auto-mode scope and Git safety behavior are covered with stubbed tools
- contributors get one obvious command that runs the full safety suite

## Why This Change Comes Third

GSD-CC is mostly Markdown skills, shell hooks, and a large installer script.
That makes manual review valuable but not enough.

The riskiest code paths can affect real user files and Git history:

- `gsd-cc/bin/install.js` copies assets, edits Claude settings, writes
  manifests, and removes files on uninstall
- `gsd-cc/hooks/*.sh` run automatically inside Claude Code
- `gsd-cc/skills/auto/auto-loop.sh` dispatches agents, edits `.gsd/STATE.md`,
  and can create Git commits

Those paths need regression tests before more automation is added.

## Current State

There is already a useful first smoke test:

```text
gsd-cc/test/install-hooks.test.js
```

It creates temporary install roots, fakes `jq`, runs global and local install,
and verifies that installed hooks are configured and executable.

`gsd-cc/package.json` currently exposes:

```json
{
  "scripts": {
    "test:install-hooks": "node test/install-hooks.test.js"
  }
}
```

That is a good seed. Point 3 should turn it into a small suite with shared
fixtures, clearer naming, and tests for uninstall, dependency degradation, and
auto-mode boundaries.

## Non-Goals

- Add a browser or end-to-end UI framework.
- Test every Markdown skill instruction exhaustively.
- Add network-dependent tests.
- Call the real `claude` CLI during tests.
- Modify the user's real Claude settings or global install.
- Introduce a heavy test dependency unless the no-dependency path becomes too
  painful.

## Test Architecture

### Runner

Keep the first version dependency-free.

Use plain Node scripts with `assert` and a tiny local runner:

```text
gsd-cc/test/run-tests.js
gsd-cc/test/*.test.js
```

Recommended scripts:

```json
{
  "scripts": {
    "test": "node test/run-tests.js",
    "test:install-hooks": "node test/install-hooks.test.js",
    "test:installer": "node test/installer.test.js",
    "test:auto": "node test/auto-mode.test.js"
  }
}
```

Why not use `node:test` immediately:

- `gsd-cc/package.json` supports Node `>=16.0.0`
- the built-in `node:test` runner is not a stable baseline for every Node 16
  user
- plain scripts match the existing test and avoid new dependencies

If the project later raises the engine to Node 18+, migrating to `node:test`
would be reasonable.

### Shared Fixture Helpers

Extract the reusable helpers from `install-hooks.test.js` into:

```text
gsd-cc/test/helpers/fs.js
gsd-cc/test/helpers/package-fixture.js
gsd-cc/test/helpers/fake-bin.js
gsd-cc/test/helpers/assertions.js
```

The helpers should provide:

- temporary directory creation
- package fixture copy that excludes `.git` and test output
- isolated `HOME`
- fake `jq`
- fake `claude`
- fake or real `git` wrapper helpers
- JSON read/write helpers
- hook command extraction from Claude settings
- recursive path assertions for install and uninstall tests

Every test must create its own temp root and must never read or write:

```text
~/.claude
```

### Shell Script Testing

Test shell scripts by running them as subprocesses from Node.

Use fixture directories and controlled environment variables instead of trying
to source shell functions directly. This tests the runtime behavior users
actually hit.

For `auto-loop.sh`, the fixture should include:

- `.gsd/STATE.md`
- `.gsd/M001-ROADMAP.md`
- `.gsd/S01-PLAN.md`
- `.gsd/S01-T01-PLAN.xml`
- `.gsd/S01-T01-SUMMARY.md`
- a fake `.claude/skills/auto` directory with prompt files
- a fake `claude` executable earlier in `PATH`

The fake `claude` should inspect the prompt file and write deterministic
outputs so tests can prove which branch ran.

## Coverage Plan

### 1. Install in temporary HOME

Test global install using an isolated home:

- set `HOME` to a temp directory
- run `node bin/install.js --global`
- assert `HOME/.claude` exists
- assert managed skills, hooks, templates, and manifest exist
- assert settings are valid JSON
- assert no files are written outside the temp home

Also test local install:

- run from a temporary project directory
- assert `.claude/settings.local.json` is used
- assert global settings are not touched

### 2. Hooks are executable and runnable

Keep and expand the existing hook test:

- force source hooks in the fixture to mode `0644`
- install globally and locally
- assert every configured hook command points to an existing `.sh` file
- assert every configured hook has execute permission
- run at least one representative hook with fake `jq`

Add one assertion per managed hook name:

- `gsd-boundary-guard.sh`
- `gsd-context-monitor.sh`
- `gsd-prompt-guard.sh`
- `gsd-statusline.sh`
- `gsd-workflow-guard.sh`

This prevents a future settings change from silently dropping a hook.

### 3. Uninstall removes only owned files

Create a temp Claude home with:

- files installed by GSD-CC
- the GSD-CC manifest
- unrelated user files in `.claude/skills`
- unrelated hooks
- unrelated settings entries
- legacy-looking files that are not marked as GSD-CC-owned

Run:

```bash
node bin/install.js --uninstall --global
```

Expected:

- manifest-owned files are removed
- empty owned directories are removed when safe
- unrelated files remain
- unrelated settings hooks remain
- GSD-CC settings entries are removed
- the command is idempotent when run twice

Repeat the same shape for local uninstall.

### 4. Missing `jq` does not activate jq-dependent hooks

Run install with a PATH that does not contain `jq`.

Expected:

- install succeeds
- readiness output reports degraded hook and auto-mode status
- jq-dependent hooks are not registered in Claude settings, or are registered
  only if they fail open with a clear runtime guard
- manifest records what was actually installed and activated
- rerunning with fake `jq` enables hooks

The exact assertion should match the implementation decision from the
dependency preflight plan. The important behavior is that users do not get
settings that claim hooks are active while they cannot run.

### 5. Slice mode stops after UNIFY

Use the auto-mode fixture from the slice-scope plan.

Setup:

- `auto_mode_scope: slice`
- `current_slice: S01`
- `phase: apply-complete`
- roadmap contains `S01` and `S02`
- fake `claude` writes `S01-UNIFY.md` and sets `phase: unified`

Expected:

- auto-loop exits successfully
- `current_slice` remains `S01`
- no `S02` plan, apply, or marker files exist
- no reassess marker exists
- log contains `Auto (this slice) complete`
- log does not contain `Moving to next slice`

This test belongs in the same PR as the slice-scope implementation.

### 6. Dirty worktree is not committed incorrectly

Create a temporary Git repository fixture:

- initialize Git
- commit baseline files
- create a current task plan and summary
- create an unrelated modified tracked file
- create an unrelated untracked file
- run the auto-mode fallback commit path with a fake `claude`

Expected:

- auto-mode stops before fallback commit
- no commit is created for unrelated changes
- unrelated tracked and untracked files remain untouched
- log names the unrelated paths and tells the user to resolve or stash them

Add companion positive coverage:

- when only task-owned files changed and summary status is `complete`,
  fallback commit may proceed
- when summary status is `partial` or `blocked`, fallback commit does not run

## Proposed File Layout

```text
gsd-cc/test/
  run-tests.js
  install-hooks.test.js
  installer.test.js
  uninstall.test.js
  dependency-degradation.test.js
  auto-mode-scope.test.js
  auto-mode-git-safety.test.js
  helpers/
    assertions.js
    fake-bin.js
    package-fixture.js
    temp.js
```

If the suite feels too fragmented at first, start with fewer files:

```text
gsd-cc/test/
  installer.test.js
  auto-mode.test.js
  helpers.js
```

The first layout is the preferred end state because it makes failures easier
to interpret.

## Implementation Phases

### Phase A: Standardize the existing test

- keep `install-hooks.test.js` behavior intact
- move shared helper functions into `test/helpers/*`
- add `test/run-tests.js`
- add a top-level `npm test` script inside `gsd-cc/package.json`
- verify `npm test` runs the existing hook test

This creates the harness without changing production behavior.

### Phase B: Cover installer and uninstall safety

Add tests for:

- global install into temp HOME
- local install into temp project
- manifest exists and matches installed files
- uninstall removes only owned files
- uninstall is idempotent
- local uninstall does not touch global install, and vice versa

These tests should land before further installer refactors.

### Phase C: Cover dependency degradation

Add missing-`jq` tests:

- install with no `jq`
- inspect settings and readiness output
- rerun install with fake `jq`
- confirm hooks become active only when the dependency is available

This protects the dependency preflight/degradation work.

### Phase D: Cover auto-mode scope

Add auto-mode fixture helpers:

- fake `.gsd` state and roadmap
- fake skill prompt directory
- fake `claude`
- optional fake `timeout` behavior if needed

Then add tests from the slice-scope plan:

- slice mode stops after UNIFY
- already-unified slice mode does not advance
- milestone mode advances
- missing scope defaults to slice
- invalid scope stops before work

### Phase E: Cover auto-mode Git safety

Add Git fixture helpers and tests for:

- unrelated dirty worktree aborts fallback commit
- task-owned complete summary can create fallback commit
- partial or blocked summaries prevent fallback commit
- fallback staging never uses repo-wide adds

This should land with or immediately after the auto-mode Git safety fix.

### Phase F: Document the test contract

Update contributor docs with:

- how to run the full suite
- how to run one test file
- rule that tests must use temp homes and temp repos
- rule that tests must not call real `claude`
- rule that tests must not require network access

Possible docs:

- `CONTRIBUTING.md`
- `gsd-cc/README.md`

## Acceptance Criteria

- `npm test` from `gsd-cc/` runs the full automated safety suite.
- Tests use temporary homes, projects, and repositories.
- No test reads or writes the developer's real `~/.claude`.
- No test calls the real `claude` CLI.
- Installer tests cover global and local install.
- Hook tests cover configured hook names, executable bits, and runtime launch.
- Uninstall tests prove unrelated user files survive.
- Missing-`jq` tests prove hooks are not misleadingly activated.
- Auto-mode tests prove slice mode stops after UNIFY.
- Git safety tests prove dirty unrelated changes are not committed.

## Suggested Atomic Commits

1. `test(core): Add shared safety test harness`
2. `test(installer): Cover install and uninstall safety`
3. `test(installer): Cover missing jq degradation`
4. `test(auto): Cover slice-scope execution`
5. `test(auto): Cover fallback commit safety`
6. `docs(test): Document safety test workflow`

## Manual Smoke Checks

After the automated suite is in place, keep these manual checks as release
confidence checks:

1. Run `npm test` from `gsd-cc/`.
2. Pack the package with `npm pack`.
3. Install the packed tarball into a temp project.
4. Confirm hooks are executable from the packed artifact.
5. Run uninstall twice and confirm unrelated `.claude` files survive.
6. Run an auto-mode fixture in `/tmp` with fake `claude`.

Manual checks should not replace automated tests. They are only a final
package-level sanity pass.

