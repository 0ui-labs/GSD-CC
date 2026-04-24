# Install/Uninstall Safety Implementation Plan

## Goal

Make `gsd-cc` installation and uninstallation safe by ensuring the tool only
creates, updates, and removes files that are explicitly owned by GSD-CC.

## Why This Change Comes First

The current installer copies directly into shared top-level `.claude`
directories, and the uninstaller removes broad directories instead of only
GSD-CC-managed assets. That creates a real risk of deleting unrelated Claude
Code skills, hooks, templates, or checklists from the same environment.

This is the highest-risk issue in the project because it can destroy user data
outside the intended scope of the package.

## Current Risks

1. Installation writes into shared directories without tracking file ownership.
2. Uninstallation removes entire top-level directories instead of package-owned
   paths only.
3. Hook cleanup uses a broad string match and may affect non-GSD-CC hook
   entries if their command payload happens to contain similar identifiers.
4. There is no manifest to support safe upgrades, partial repair, or clean
   rollback.
5. Legacy cleanup logic is mixed into the main install path without a clear
   migration contract.

## Non-Goals

- Redesign the overall skill layout beyond what is required for safe ownership.
- Change task-plan file conventions or auto-mode behavior in this phase.
- Introduce external runtime dependencies.

## Safety Principles

1. Never delete a path unless GSD-CC can prove it created or owns it.
2. Prefer namespaced locations over shared top-level paths.
3. Record installed assets so uninstall and upgrade are deterministic.
4. Make migration explicit and reversible.
5. Fail safe: if ownership is unclear, keep the file and warn instead of
   deleting it.

## Proposed Design

### 1. Introduce a GSD-CC install manifest

Create a manifest file inside the target `.claude` base, for example:

```text
.claude/gsd-cc/install-manifest.json
```

The manifest should track:

- install mode: `global` or `local`
- installed version
- install timestamp
- all created files
- all created directories
- managed hook identifiers
- migrated legacy paths

This becomes the source of truth for upgrades and uninstall.

### 2. Move package assets under a dedicated namespace

Instead of treating shared top-level directories as package-owned, install
assets under explicit GSD-CC-owned paths such as:

```text
.claude/skills/gsd-cc/...
.claude/hooks/gsd-cc/...
.claude/checklists/gsd-cc/...
.claude/templates/gsd-cc/...
```

If full namespacing is incompatible with current runtime expectations, keep the
externally required paths but still generate the manifest and only manage the
exact files copied by GSD-CC.

Preferred order:

1. Use namespaced subdirectories wherever Claude Code supports them.
2. If a shared path is unavoidable, track each individual file and never remove
   sibling files not listed in the manifest.

### 3. Make hook registration explicitly owned

When installing hooks:

- add a stable marker for each GSD-CC hook entry
- register only the exact commands GSD-CC needs
- remove only entries carrying the GSD-CC marker during reinstall/uninstall

Possible marker shape:

```json
{
  "source": "gsd-cc",
  "matcher": "Edit|Write",
  "hooks": [...]
}
```

If custom fields are not tolerated by Claude Code, use a command-path based
ownership check against the manifest rather than a loose `JSON.stringify`
substring search.

### 4. Separate migration from steady-state install

Handle legacy cleanup in a dedicated migration step:

1. detect known legacy GSD-CC paths
2. record what was migrated
3. move or replace only known GSD-CC-owned legacy assets
4. never delete unrelated top-level directories as part of migration

Migration must be idempotent and safe to rerun.

### 5. Make uninstall manifest-driven

Uninstall flow:

1. load manifest
2. remove only files listed in manifest
3. remove only now-empty directories listed in manifest
4. remove only manifest-owned hook entries
5. keep unknown files and warn when cleanup is partial
6. remove manifest last

If the manifest is missing:

- do not perform broad deletion
- fall back to a conservative legacy cleanup of exact known GSD-CC paths only
- print a warning that manual cleanup may be required

## Implementation Phases

### Phase A: Prepare ownership model

- audit every path currently written by `install()`
- define final manifest schema
- define final on-disk layout for global and local installs
- define exact hook ownership strategy

### Phase B: Refactor install flow

- create helpers for tracked file copy and tracked directory creation
- write manifest during install
- update reinstall behavior to reconcile existing manifest entries
- preserve executable bits for managed shell scripts

### Phase C: Refactor uninstall flow

- load and validate manifest
- remove only tracked assets
- clean hook entries using explicit ownership
- keep partial cleanup warnings human-readable

### Phase D: Add legacy migration

- identify current legacy directories and file names
- migrate only exact known GSD-CC legacy assets
- record migration results in manifest

### Phase E: Harden failure behavior

- if settings JSON is invalid, do not silently clobber unrelated config
- back up modified settings before destructive rewrite, or rewrite atomically
- ensure interrupted installs cannot leave a half-written manifest

## Files Expected To Change

- `gsd-cc/bin/install.js`
- `README.md`
- `gsd-cc/README.md`
- `CONTRIBUTING.md` if uninstall behavior or contributor expectations change

Possible additions:

- a small manifest schema example in docs
- a dedicated helper module only if it keeps the installer clearer without
  adding build tooling

## Verification Plan

### Manual smoke tests

1. Global install into a clean test home.
2. Local install into a clean repo.
3. Reinstall over an existing GSD-CC installation.
4. Uninstall after global install.
5. Uninstall after local install.
6. Uninstall when unrelated files exist in neighboring `.claude` directories.
7. Install with pre-existing non-GSD-CC hooks and verify they remain untouched.
8. Reinstall after legacy-path detection and verify migration is conservative.

### Assertions

- no unrelated file is deleted
- only GSD-CC-managed hook entries are replaced or removed
- manifest reflects actual installed files
- uninstall leaves non-owned directories intact
- reinstall is idempotent

## Commit Strategy

Planned atomic commits:

1. add the manifest and ownership model scaffolding
2. refactor install path to tracked writes
3. refactor uninstall path to manifest-driven cleanup
4. add migration handling and docs
5. add smoke-test notes and final documentation sync

## Open Decisions To Resolve During Implementation

1. Whether Claude Code reliably supports namespaced subdirectories for all four
   asset classes.
2. Whether hook entries may safely contain a custom ownership field.
3. Whether settings updates should be atomic writes with backup files.
4. Whether local installs should write a manifest inside project `.claude` or a
   GSD-CC-specific metadata directory beside it.

## Exit Criteria

This phase is done when:

- install tracks everything it owns
- uninstall removes only tracked assets
- unrelated `.claude` content survives install, reinstall, and uninstall
- legacy cleanup no longer depends on removing shared directories
- docs describe the safe ownership model accurately
