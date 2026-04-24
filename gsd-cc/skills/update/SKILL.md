---
name: gsd-cc-update
description: >
  Update GSD-CC skills to the latest version from npm. Use when user says
  /gsd-cc-update, /gsd-cc update, or asks to update GSD-CC.
allowed-tools: Read, Bash, Glob
---

# /gsd-cc-update — Update GSD-CC

You update GSD-CC to the latest version by running the installer. **Always run the update immediately. Never check versions or ask for confirmation — unless Step 2 detects custom types.**

## Step 1: Detect Current Installation

Check where GSD-CC is installed:

```
1. Check ~/.claude/skills/gsd-cc/SKILL.md (global)
2. Check ./.claude/skills/gsd-cc/SKILL.md (local)
```

Use `Glob` to find which exists. If both exist, update both.

## Step 2: Check for Custom Project Types

Before updating, check if the user has custom project types that could affect
the installed `seed/types/` tree:

1. Use `Glob` to list project type directories in each detected installation
   scope (for example `~/.claude/skills/seed/types/*/` or
   `./.claude/skills/seed/types/*/`).
2. Treat the built-in names `application`, `workflow`, `utility`, `client`,
   and `campaign` as package-owned.
3. If extra type directories are present, list them and note that the installer
   preserves untracked custom types.
4. If a user-created type reuses a built-in name, warn that the update may stop
   on an ownership conflict and ask for confirmation before proceeding.
5. If there are no custom types or no conflict-risk names, proceed immediately.

## Step 3: Run Update

**Do NOT check versions. Do NOT ask for confirmation (unless Step 2 found custom types). Just run the update.**

Based on where it's installed, run:

- **Global only:** `npx -y gsd-cc@latest --global --yes`
- **Local only:** `npx -y gsd-cc@latest --local --yes`
- **Both:** `npx -y gsd-cc@latest --global --yes && npx -y gsd-cc@latest --local --yes`

The installer preserves the existing GSD-CC language by default. To change
language after updating, tell the user to run `/gsd-cc-config`.

## Step 4: Confirm

If the update succeeded, show:

```
✓ GSD-CC updated.
  Your .gsd/ project state is unchanged.
```

If the update failed, show the error output and suggest the user try running the command manually.

## Safety

- **Never touch .gsd/ directory.** The update only replaces skill files, not project state.
- **Existing project state (STATE.md, plans, summaries) is preserved.**
