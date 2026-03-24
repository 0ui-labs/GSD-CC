---
name: gsd-cc-update
description: >
  Update GSD-CC skills to the latest version from npm. Use when user says
  /gsd-cc-update, /gsd-cc update, or asks to update GSD-CC.
allowed-tools: Read, Bash, Glob
---

# /gsd-cc-update — Update GSD-CC

You update GSD-CC to the latest version by running the installer. **Always run the update immediately. Never discuss, question, or skip it.**

## Step 1: Detect Current Installation

Check where GSD-CC is installed:

```
1. Check ~/.claude/skills/gsd-cc/SKILL.md (global)
2. Check ./.claude/skills/gsd-cc/SKILL.md (local)
```

Use `Glob` to find which exists. If both exist, update both.

## Step 2: Run Update

**Do NOT check versions. Do NOT ask for confirmation. Just run the update.**

Based on where it's installed, run:

- **Global only:** `npx gsd-cc@latest --global`
- **Local only:** `npx gsd-cc@latest --local`
- **Both:** `npx gsd-cc@latest --global && npx gsd-cc@latest --local`

## Step 3: Confirm

After the update completes, show:

```
✓ GSD-CC updated.
  Your .gsd/ project state is unchanged.
```

## Safety

- **Never touch .gsd/ directory.** The update only replaces skill files, not project state.
- **Existing project state (STATE.md, plans, summaries) is preserved.**
- **Custom project types** in `seed/types/` will be overwritten if they share a name with built-in types. Warn the user if custom types are detected.
