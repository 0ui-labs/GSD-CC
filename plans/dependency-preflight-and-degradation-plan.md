# Dependency Preflight And Graceful Degradation Plan

## Goal

Make GSD-CC explicit and reliable about runtime dependencies, especially `jq`,
so users get either:

- a successful install with working hooks and auto-mode, or
- a clear, actionable warning about what is unavailable and why

The target outcome is:

- dependency requirements are checked before behavior depends on them
- hooks do not silently break when `jq` is missing
- install-time messaging matches runtime reality
- documentation reflects the true dependency model

## Why This Change Comes Fourth

After install/uninstall safety, task-plan consistency, and auto-mode Git
safety, the next biggest trust issue is hidden dependency failure.

Right now the documentation frames `jq` mostly as an auto-mode prerequisite, but
multiple installed hooks also depend on it. That means users can install GSD-CC
successfully, assume everything is ready, and then get broken or non-functional
hook behavior without clear guidance.

This is not as dangerous as destructive uninstall or unsafe commits, but it is
high-friction and undermines the product promise of a lightweight, dependable
workflow.

## Current Problems

1. README and package docs primarily describe `jq` as required for auto-mode.
2. Multiple installed hooks invoke `jq` on every relevant hook event.
3. If `jq` is missing, hook behavior can fail or degrade unclearly after
   installation.
4. The installer currently configures hooks without first establishing whether
   their runtime dependency set is available.
5. There is no unified dependency status model across install, local runtime,
   and auto-mode.
6. The user experience differs depending on where `jq` is first encountered:
   install time, hook execution time, or auto-mode startup.

## Non-Goals

- Introduce new mandatory runtime dependencies beyond what GSD-CC already uses.
- Rebuild shell hooks in another language.
- Redesign auto-mode or hook semantics outside dependency handling.

## Design Principles

1. Detect early, fail clearly.
2. Prefer explicit degraded modes over silent partial failure.
3. Keep the zero-build philosophy intact.
4. Separate "installation succeeded" from "all optional capabilities are
   available".
5. Give users the minimum next step needed to recover.

## Dependency Reality To Model

### Hard dependency for current auto-mode

- `jq`

### Effective dependency for current hooks

- `jq`

### Soft or environment-specific dependencies already implied elsewhere

- `claude` CLI for auto-mode
- `git` for workflow execution
- `perl` only as an optional branch inside `gsd-prompt-guard.sh`

The key point is that `jq` is currently both:

- an auto-mode dependency
- a hook runtime dependency

That dual role needs to be reflected consistently.

## Proposed Behavioral Model

### 1. Distinguish capability tiers

At minimum, GSD-CC should communicate these capability states:

1. install-ready:
   package files can be copied
2. hooks-ready:
   installed hooks can run as configured
3. auto-ready:
   auto-mode can run end-to-end

Example:

- if `jq` is present, all three tiers may be ready
- if `jq` is missing, installation may still succeed, but hooks-ready and
  auto-ready are false unless we choose to skip installing jq-dependent hooks

### 2. Make install-time dependency checks explicit

Before finalizing install, probe for:

- `jq`
- `git` if the installer intends to message about workflow readiness
- `claude` only if the installer wants to report auto-mode readiness

The installer should then print a concise readiness summary, for example:

```text
Installation complete.
Hooks: disabled (jq not found)
Auto-mode: unavailable (jq not found)
Next step: brew install jq
```

### 3. Choose a clear degradation strategy for missing `jq`

Two viable models:

1. strict model:
   refuse to install hooks when `jq` is missing and warn that only static assets
   were installed
2. degraded model:
   install hooks, but each hook self-disables cleanly when `jq` is missing and
   surfaces a clear reason

Preferred approach:

- installer should avoid enabling jq-dependent hooks when `jq` is missing
- runtime hooks should still contain safe self-checks as a secondary defense

This gives the cleanest user experience and protects against environment drift
after install.

### 4. Add runtime self-checks to each jq-dependent hook

Each jq-dependent hook should begin with a lightweight guard:

```bash
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi
```

For hooks where silent exit would hide important safety features, consider
returning a non-blocking `additionalContext` warning instead of failing hard.

Recommended interpretation by hook type:

- boundary guard:
  safe silent exit is acceptable only if install-time configuration already
  tried not to enable it without `jq`
- prompt guard:
  same as boundary guard
- context monitor:
  safe silent exit is acceptable
- workflow guard:
  safe silent exit is acceptable
- statusline:
  safe silent exit is acceptable

## Proposed Implementation

### Phase A: Dependency inventory and readiness model

- audit which scripts require `jq` at runtime
- define readiness states and user-facing messages
- decide which dependencies are hard vs capability-specific

### Phase B: Installer preflight

Add a dependency probe step to the installer:

- detect `jq`
- compute readiness flags
- decide whether to configure hooks based on readiness
- print a summary after install finishes

Installer behavior should be deterministic:

- no hidden "best effort" hook registration without telling the user
- no success message that implies hooks are active when they are not

### Phase C: Hook hardening

Add self-check guards to all jq-dependent hook scripts so they degrade safely if
the environment changes after installation.

This covers cases like:

- `jq` removed after install
- PATH differences between shell sessions
- local vs global environment drift

### Phase D: Auto-mode preflight alignment

Make the auto-mode readiness message match the installer model.

If `jq` is missing, the user should get the same diagnosis everywhere:

- installer output
- `/gsd-cc-auto` skill messaging
- README or package docs

### Phase E: Documentation sync

Update docs so they distinguish:

- base installation
- hooks readiness
- auto-mode readiness

The docs should stop implying that `jq` matters only for auto-mode if hooks
also depend on it.

## Decision Points During Implementation

### Decision 1: Should install fail when `jq` is missing?

Options:

1. hard fail the entire install
2. complete install but skip jq-dependent hook activation
3. complete install and activate hooks that self-disable at runtime

Preferred option:

2. complete install but skip jq-dependent hook activation

Why:

- preserves low-friction installation
- avoids a broken post-install state
- gives users a clear next step without pretending everything works

### Decision 2: Should hook readiness be persisted?

Possible persistence points:

- install manifest
- a small config block in `CLAUDE.md`
- no persistence, recompute each time

Preferred option:

- store readiness in the install manifest if one exists
- recompute as needed when reinstalling or uninstalling

### Decision 3: Should hooks emit warnings when disabled?

Preferred option:

- installer should be the primary place for actionable warnings
- hook scripts should generally fail open and stay quiet unless a lightweight
  user-facing warning can be emitted safely and without noise

## Files Expected To Change

- `gsd-cc/bin/install.js`
- `gsd-cc/hooks/gsd-boundary-guard.sh`
- `gsd-cc/hooks/gsd-prompt-guard.sh`
- `gsd-cc/hooks/gsd-context-monitor.sh`
- `gsd-cc/hooks/gsd-statusline.sh`
- `gsd-cc/hooks/gsd-workflow-guard.sh`
- `gsd-cc/skills/auto/SKILL.md`
- `README.md`
- `gsd-cc/README.md`

Possible additional changes:

- a shared shell helper for dependency checks if it keeps the hooks simpler
- install manifest schema updates if readiness state is persisted there

## Verification Plan

### Static verification

- confirm every jq-dependent hook has a runtime presence check
- confirm installer has a single dependency probe path
- confirm docs mention hook dependency implications consistently

### Manual smoke tests

1. Install with `jq` present and confirm hooks are configured and auto-mode is
   reported as ready.
2. Install without `jq` and confirm install succeeds with a clear degraded-mode
   summary.
3. Install without `jq` and confirm jq-dependent hooks are either not
   configured or self-disable safely.
4. Add `jq` later and reinstall; confirm hooks and auto-mode become ready.
5. Install with `jq`, then remove it; confirm hooks fail open instead of
   crashing noisily.
6. Run `/gsd-cc-auto` without `jq` and confirm the message matches installer
   guidance.

### Success criteria

- no user can end up with silently broken jq-dependent hooks after install
- installer messaging tells the truth about active capabilities
- hook scripts degrade safely if runtime dependencies disappear
- auto-mode and docs use the same dependency language as the installer

## Commit Strategy

Planned atomic commits:

1. add installer dependency probing and readiness messaging
2. harden jq-dependent hooks with runtime guards
3. align auto-mode and documentation language with the new readiness model

## Open Questions

1. Whether hook configuration should be skipped entirely or partially when `jq`
   is missing.
2. Whether the installer should probe for `claude` and `git` at the same time
   or keep the first iteration focused on `jq`.
3. Whether readiness summaries should be machine-readable in the install
   manifest for future troubleshooting.
4. Whether disabled-hook status should appear in `/gsd-cc-status` later.

## Exit Criteria

This phase is done when:

- dependency-sensitive features are checked before use
- missing `jq` no longer produces a misleading "installed and ready" state
- hooks degrade safely when their runtime dependency is unavailable
- installer, runtime, and docs describe the same dependency model
