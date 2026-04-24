# Hook Executability Implementation Plan

## Goal

Ensure every installed GSD-CC hook can actually be executed by Claude Code.

The target outcome is:

- installed hook files are runnable on fresh global and local installs
- Claude settings never point at non-executable shell scripts
- package metadata preserves the intended executable behavior
- regressions are caught by a small install smoke test

## Why This Change Comes First

GSD-CC relies on hooks for its most important safety promises:

- boundary enforcement
- prompt-injection checks for `.gsd/` artifacts
- workflow drift warnings
- context/status maintenance

The installer currently registers hook scripts as direct command paths in
Claude settings. In a smoke test, those installed files had mode `0644`, so
executing the configured command failed with `Permission denied`.

That means the UI can report "Hooks configured" while the actual safety hooks
do not run. This is a trust issue and should be fixed before adding more
workflow features.

## Current Problem

The package installs hooks from:

```text
gsd-cc/hooks/*.sh
```

The installer preserves source file modes during copy. The hook files are
tracked as non-executable files, while the settings entry points directly to
the script path:

```json
{
  "type": "command",
  "command": "/path/to/.claude/hooks/gsd-cc/gsd-boundary-guard.sh"
}
```

On a clean install, the resulting file can be present but not runnable.

## Non-Goals

- Redesign hook behavior.
- Change which hook events are registered.
- Change the manifest schema unless needed to record the fixed behavior.
- Add new runtime dependencies.
- Rewrite shell hooks in another language.

## Design Options

### Option A: Make hook source files executable

Change the repository file mode for all hook scripts to `100755`.

Pros:

- simple
- package tarball naturally includes executable modes
- installer can keep preserving source modes

Cons:

- relies on future contributors preserving executable bits
- does not protect users if a published package ever ships bad modes again

### Option B: Force executable mode during install

After copying hook files, the installer explicitly sets hook scripts to
`0755`, independent of source file mode.

Pros:

- robust even if source modes drift
- clear installer contract
- works for both global and local installs

Cons:

- installer needs to know which copied assets are command hooks

### Option C: Register hooks through `bash <script>`

Keep scripts non-executable but register commands as:

```text
bash /path/to/hook.sh
```

Pros:

- no executable bit required
- avoids chmod concerns

Cons:

- settings become shell-dependent
- path quoting becomes more important
- does not match the current direct-command model

## Recommended Approach

Use a defensive combination of Option A and Option B:

1. Mark all hook source files executable in Git.
2. Add installer logic that ensures installed hook scripts are executable.
3. Add a smoke test so this cannot silently regress.

This keeps the package correct and makes install behavior resilient if source
metadata drifts later.

## Files Expected To Change

- `gsd-cc/hooks/gsd-boundary-guard.sh`
- `gsd-cc/hooks/gsd-context-monitor.sh`
- `gsd-cc/hooks/gsd-prompt-guard.sh`
- `gsd-cc/hooks/gsd-statusline.sh`
- `gsd-cc/hooks/gsd-workflow-guard.sh`
- `gsd-cc/bin/install.js`
- `gsd-cc/package.json` if a test script is added

Possible additions:

- `gsd-cc/test/install-smoke.test.js`
- or `gsd-cc/scripts/smoke-install-hooks.sh`

## Implementation Phases

### Phase A: Reproduce and document the failure

Use a temporary home directory so no real Claude installation is touched:

```bash
HOME=/tmp/gsd-cc-hook-smoke node gsd-cc/bin/install.js --global
```

Then verify:

```bash
test -x /tmp/gsd-cc-hook-smoke/.claude/hooks/gsd-cc/gsd-boundary-guard.sh
```

Expected current result:

```text
not executable
```

This confirms the bug in an isolated environment.

### Phase B: Fix source file modes

Set executable bits for every hook script:

```bash
chmod 755 gsd-cc/hooks/*.sh
```

Stage the mode-only changes explicitly:

```bash
git add gsd-cc/hooks/gsd-boundary-guard.sh
git add gsd-cc/hooks/gsd-context-monitor.sh
git add gsd-cc/hooks/gsd-prompt-guard.sh
git add gsd-cc/hooks/gsd-statusline.sh
git add gsd-cc/hooks/gsd-workflow-guard.sh
```

Check with:

```bash
git ls-files -s gsd-cc/hooks
```

Success means each hook shows mode `100755`.

### Phase C: Harden installer copy behavior

Update `copyAsset()` in `gsd-cc/bin/install.js` so hook scripts installed under
`hooks/gsd-cc/` are forced to executable mode after copy.

Suggested behavior:

```js
function getInstallMode(asset) {
  if (
    asset.targetRelativePath.startsWith(`${CURRENT_HOOK_DIR}${path.sep}`) &&
    asset.targetRelativePath.endsWith('.sh')
  ) {
    return 0o755;
  }

  return fs.statSync(asset.sourcePath).mode & 0o777;
}
```

Then use that mode in `copyAsset()`.

Why this matters:

- source file modes are the first line of defense
- installer-enforced modes are the second line of defense
- installed behavior no longer depends on package metadata being perfect

### Phase D: Add an install smoke test

Add a lightweight test that:

1. creates a temporary HOME
2. runs the installer in global mode
3. accepts the default language non-interactively
4. reads `.claude/settings.json`
5. verifies every configured hook command exists
6. verifies every configured hook command is executable
7. invokes one hook with minimal valid JSON and expects exit code 0

Example assertions:

```text
settings.json contains PreToolUse and PostToolUse entries
all hook command paths exist
all hook command paths are executable
direct hook execution does not fail with Permission denied
```

The test should not depend on the user's real home directory, real Claude
settings, or network access.

### Phase E: Wire the smoke test into package scripts

Add a narrow package script such as:

```json
{
  "scripts": {
    "test:install-hooks": "node test/install-hooks.test.js"
  }
}
```

Keep this focused. It should validate the installer-hook contract, not the
entire GSD-CC workflow.

### Phase F: Verify package metadata

Run:

```bash
npm_config_cache=/tmp/gsd-cc-npm-cache npm pack --dry-run --json
```

Confirm hook files in the generated package list have mode `493` (`0755`) or
that installer hardening still makes them executable after install.

## Verification Plan

### Static checks

```bash
node --check gsd-cc/bin/install.js
bash -n gsd-cc/hooks/gsd-boundary-guard.sh
bash -n gsd-cc/hooks/gsd-context-monitor.sh
bash -n gsd-cc/hooks/gsd-prompt-guard.sh
bash -n gsd-cc/hooks/gsd-statusline.sh
bash -n gsd-cc/hooks/gsd-workflow-guard.sh
git ls-files -s gsd-cc/hooks
```

### Install smoke checks

Global install:

```bash
printf '\n' | HOME=/tmp/gsd-cc-hook-global node gsd-cc/bin/install.js --global
```

Local install:

```bash
tmpdir=$(mktemp -d)
cp -R gsd-cc "$tmpdir/"
cd "$tmpdir"
printf '\n' | node gsd-cc/bin/install.js --local
```

For both installs:

```bash
test -x .claude/hooks/gsd-cc/gsd-boundary-guard.sh
test -x .claude/hooks/gsd-cc/gsd-prompt-guard.sh
test -x .claude/hooks/gsd-cc/gsd-workflow-guard.sh
```

For global installs, adjust the path to:

```text
$HOME/.claude/hooks/gsd-cc/
```

### Runtime smoke check

Call one installed hook directly:

```bash
printf '{"tool_name":"Read","cwd":"/tmp","tool_input":{}}\n' \
  | /tmp/gsd-cc-hook-global/.claude/hooks/gsd-cc/gsd-boundary-guard.sh
```

Expected result:

- exit code 0
- no `Permission denied`
- no shell syntax error

## Commit Strategy

Use two small commits if implemented separately:

1. `fix(hooks): make installed hooks executable`
2. `test(installer): cover hook executable contract`

If the test is tiny and lands with the fix, one commit is also acceptable:

```text
fix(hooks): make installed hooks executable

Hook commands are registered as direct script paths, so installed hook
files must be executable. The installer now enforces that contract and
the smoke test covers fresh install behavior.
```

## Risks And Mitigations

### Risk: File modes drift again

Mitigation:

- installer explicitly applies executable mode
- smoke test checks installed behavior, not only Git metadata

### Risk: Windows behavior is unclear

Mitigation:

- current hooks are Bash scripts, so the immediate support target is Unix-like
  environments used by Claude Code
- document or separately handle Windows if GSD-CC intends to support it

### Risk: Tests touch a real Claude installation

Mitigation:

- tests must always set a temporary HOME
- tests must never read or write `~/.claude` from the developer machine

## Exit Criteria

This implementation is done when:

- all hook source files are executable in Git
- installed hook files are executable after global and local installs
- Claude settings point only at runnable commands
- a smoke test fails if hooks are installed without execute permission
- `npm pack --dry-run --json` confirms package behavior is compatible with the
  executable-hook contract
