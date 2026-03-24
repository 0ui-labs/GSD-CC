---
name: gsd-cc-update
description: >
  Update GSD-CC skills to the latest version from npm. Use when user says
  /gsd-cc-update, /gsd-cc update, or asks to update GSD-CC.
allowed-tools: Read, Bash, Glob
---

# /gsd-cc-update — Update GSD-CC

You update GSD-CC to the latest version by running the installer.

## Step 1: Detect Current Installation

Check where GSD-CC is installed:

```
1. Check ~/.claude/skills/gsd/SKILL.md (global)
2. Check ./.claude/skills/gsd/SKILL.md (local)
```

Use `Glob` to find which exists. If both exist, update both.

## Step 2: Get Current Version

Run:
```bash
npm view gsd-cc version
```

This shows the latest available version on npm.

Also check if a `package.json` exists in the installed skills directory's parent to find the current version. If not available, report "unknown".

## Step 3: Confirm with User

Show:
```
GSD-CC Update

  Installed: {current_version or "unknown"}
  Latest:    {latest_version}
  Location:  {global and/or local path}

Update now? (y/n)
```

If the versions match, tell the user they're already on the latest version and stop.

## Step 4: Run Update

Based on where it's installed, run:

- **Global only:** `npx gsd-cc@latest --global`
- **Local only:** `npx gsd-cc@latest --local`
- **Both:** `npx gsd-cc@latest --global && npx gsd-cc@latest --local`

## Step 5: Confirm

```
✓ GSD-CC updated to {version}.
  Your .gsd/ project state is unchanged.
```

## Safety

- **Never touch .gsd/ directory.** The update only replaces skill files, not project state.
- **Existing project state (STATE.md, plans, summaries) is preserved.**
- **Custom project types** in `seed/types/` will be overwritten if they share a name with built-in types. Warn the user if custom types are detected.
