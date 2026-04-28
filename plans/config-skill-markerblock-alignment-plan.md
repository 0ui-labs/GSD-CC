# Config Skill Marker Block Alignment Implementation Plan

## Goal

Align `/gsd-cc-config` with the installer-owned CLAUDE.md config block so all
configuration writers use the same managed format.

The target outcome is:

- the config skill reads the installer marker block first
- language updates preserve unrelated CLAUDE.md content
- legacy unmarked `# GSD-CC Config` blocks are migrated, not duplicated
- uninstall can still remove the managed block cleanly
- tests prevent future drift between installer behavior and skill guidance

## Why This Change Matters

The installer already treats language configuration as a managed block:

```markdown
<!-- gsd-cc:config:start -->
# GSD-CC Config
GSD-CC language: English
<!-- gsd-cc:config:end -->
```

The config skill still instructs Claude to look for and update only the
unmarked legacy section:

```markdown
# GSD-CC Config
GSD-CC language: English
```

That mismatch creates a subtle maintenance problem. A user can install GSD-CC,
then run `/gsd-cc-config`, and the skill may write a second config section or
modify the wrong one. It also weakens uninstall safety because the installer can
only prove ownership of the marked block.

## Current Behavior

### Installer

The installer:

- writes a marker-delimited block to `CLAUDE.md`
- reads both marked and legacy language config
- replaces legacy config with the marked block during install/update
- records the managed config block in the install manifest
- removes the managed block during uninstall

### Config Skill

The config skill currently:

- tells Claude to look for `# GSD-CC Config`
- describes appending an unmarked block when no section exists
- does not mention the start/end markers
- does not define what to do when both marked and legacy blocks exist

## Non-Goals

- Redesign all GSD-CC configuration storage.
- Add a new runtime config parser outside the existing installer helpers.
- Change install or uninstall behavior unless a bug is found while testing.
- Add external dependencies.
- Expand `/gsd-cc-config` into a broad settings UI in this change.

## Canonical Config Contract

### Managed block

The canonical CLAUDE.md config format is:

```markdown
<!-- gsd-cc:config:start -->
# GSD-CC Config
GSD-CC language: {language}
<!-- gsd-cc:config:end -->
```

### Ownership rule

Only content between the marker comments is owned by GSD-CC. Everything outside
the markers is user or project content and must be preserved exactly unless the
user explicitly asks for a broader edit.

### Read precedence

When reading language configuration, use this order:

1. marked GSD-CC config block
2. legacy unmarked `# GSD-CC Config` section
3. default language

If both marked and legacy blocks exist, the marked block wins.

### Write behavior

When writing language configuration:

1. If a marked block exists, replace only that block.
2. Else if a legacy unmarked block exists, replace it with the marked block.
3. Else append the marked block at the end of the file.

The resulting file should contain exactly one GSD-CC config block unless the
user has intentionally written unrelated prose that merely mentions the same
heading.

## Affected Files

Primary implementation surface:

- `gsd-cc/skills/config/SKILL.md`

Validation and guardrail surface:

- `gsd-cc/test/installer-update.test.js`
- `gsd-cc/test/uninstall.test.js`
- a new or existing static docs/skill consistency test

Documentation surface if wording changes:

- `README.md`
- `gsd-cc/README.md`
- `CONTRIBUTING.md`

Installer helpers to reference, not necessarily change:

- `gsd-cc/bin/install/constants.js`
- `gsd-cc/bin/install/language-config.js`
- `gsd-cc/bin/install/manifest.js`

## Proposed Implementation

### Phase A: Inventory exact config surfaces

Search for all references to:

- `gsd-cc:config:start`
- `gsd-cc:config:end`
- `# GSD-CC Config`
- `GSD-CC language:`

Confirm which files are runtime behavior, which are tests, and which are
prompt/documentation instructions.

### Phase B: Rewrite config skill contract

Update `gsd-cc/skills/config/SKILL.md` so it explicitly teaches Claude the
managed block format.

The skill should say:

- read project-level `CLAUDE.md` first, then global `~/.claude/CLAUDE.md`
- prefer the marked block over legacy config
- preserve all content outside the markers
- use the marked block for all new writes
- convert the legacy unmarked block to the marked block when updating it
- avoid appending a second GSD-CC config block

The safety section should be updated from "Only add or modify the GSD-CC Config
section" to "Only add or modify the marker-delimited GSD-CC block, or migrate
the legacy block into that marker-delimited block."

### Phase C: Define conflict behavior

Add explicit instructions for unusual states:

- marked block exists and legacy block exists:
  - update the marked block
  - leave the legacy block untouched unless it is clearly the old generated
    block and can be safely removed
- marked block exists but has no language line:
  - replace the whole marked block with a valid block
- multiple marked blocks exist:
  - stop and ask the user which one to keep
- malformed marker pair:
  - stop and tell the user manual cleanup is needed

This keeps the skill conservative around ambiguous ownership.

### Phase D: Add static consistency tests

Add a lightweight Node test that checks the config skill mentions the canonical
markers and does not document the legacy-only append pattern as the preferred
write path.

The test should verify:

- `gsd-cc/skills/config/SKILL.md` contains `gsd-cc:config:start`
- `gsd-cc/skills/config/SKILL.md` contains `gsd-cc:config:end`
- the skill mentions legacy migration
- the skill tells Claude to preserve content outside the managed block

This is intentionally static because the skill itself is prompt text, not
executable code.

### Phase E: Check installer tests still cover runtime behavior

Run existing installer/update/uninstall tests to confirm:

- install writes the marked block
- reinstall preserves language
- update migrates legacy language config
- uninstall removes the managed block
- unrelated CLAUDE.md content survives

If those behaviors are already covered, do not add duplicate tests. If a case is
missing, add the smallest targeted assertion to the existing test file.

### Phase F: Documentation sync pass

Review user and contributor docs for config wording.

Only update docs if they describe the internal CLAUDE.md block shape. General
phrases like "GSD-CC language setting" can remain as-is.

If docs are changed, keep the wording high-level:

- users should not need to understand marker comments for normal usage
- contributors should know the marker block is the canonical owned region

## Validation Plan

Run:

```bash
cd gsd-cc
npm test
```

If focused checks are useful during implementation, run:

```bash
cd gsd-cc
npm run test:installer
npm run test:uninstall
node test/installer-update.test.js
```

Also manually inspect the final config skill text for these properties:

- no instruction appends an unmarked block as the canonical path
- legacy behavior is described as migration compatibility only
- ambiguous multiple-block cases stop instead of guessing

## Commit Strategy

Use small docs/test commits:

1. `docs(config): Align skill with managed block`
   - update only `gsd-cc/skills/config/SKILL.md`

2. `test(config): Guard config skill markers`
   - add or update the static consistency test

3. Optional `docs(config): Clarify config ownership`
   - only if README or CONTRIBUTING wording needs sync

## Risks

### Prompt over-specification

The config skill could become too procedural and harder for Claude to follow.
Keep the rules precise but short, with one canonical example.

### Accidental deletion of user content

Legacy migration must only replace the old generated config section. Ambiguous
or malformed blocks should stop for user review.

### Drift after installer modularization

If installer constants move, tests should assert marker strings in behavior and
skill text, not depend on a specific module path unless that module is already
the stable source of truth.

## Open Questions

1. Should `/gsd-cc-config` remove an old legacy block when a valid marked block
   already exists?
2. Should the config skill support additional fields now, such as commit
   language, or should this change stay language-only?
3. Should contributor docs name the exact marker comments, or is that too much
   internal detail for normal contributors?
