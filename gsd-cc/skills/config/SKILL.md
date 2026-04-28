---
name: gsd-cc-config
description: >
  Change GSD-CC settings like UI language and commit language. Updates
  CLAUDE.md so changes take effect immediately. Use when user says
  /gsd-cc-config, wants to change language, or asks about GSD-CC settings.
allowed-tools: Read, Write, Edit, Glob, AskUserQuestion
---

# /gsd-cc-config — Settings

You manage GSD-CC configuration stored in CLAUDE.md.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically).
All output must use that UI language. If not found, default to English.
Commit messages are controlled separately by "GSD-CC commit language: {lang}"
and default to English.

## Step 1: Show Current Settings

Read the CLAUDE.md file (project-level first, then global `~/.claude/CLAUDE.md`). Look for the `# GSD-CC Config` section.

Show:
```
GSD-CC Settings

  Language:         {current UI language or "English (default)"}
  Commit language:  {current commit language or "English (default)"}
  Config:           {which CLAUDE.md file — project or global}

What would you like to change?
  1) Language
  2) Commit language
```

## Step 2: Change Language

If the user wants to change the language:

1. Ask: "Which language? (e.g. English, Deutsch, Français, Español, ...)"
2. Update CLAUDE.md:
   - If a `# GSD-CC Config` section exists, replace the `GSD-CC language:` line
     and preserve any existing `GSD-CC commit language:` line
   - If not, append the section at the end:
     ```
     <!-- gsd-cc:config:start -->
     # GSD-CC Config
     GSD-CC language: {language}
     GSD-CC commit language: English
     <!-- gsd-cc:config:end -->
     ```
3. Confirm: "Language changed to {language}. Takes effect immediately."

## Step 3: Change Commit Language

If the user wants to change the commit language:

1. Ask: "Which commit language? (default: English)"
2. Update CLAUDE.md:
   - If a `# GSD-CC Config` section exists, replace or add
     `GSD-CC commit language: {language}` and preserve `GSD-CC language:`
   - If not, append the managed section shown above with
     `GSD-CC language: English` and the requested commit language
3. Confirm: "Commit language changed to {language}. UI language unchanged."

## Where to Write

- If a project-level `CLAUDE.md` exists (in current working directory), update that one
- Otherwise update `~/.claude/CLAUDE.md` (global)
- If the user wants to change scope (project vs global), ask which one

## Safety

- **Never delete existing CLAUDE.md content.** Only add or modify the GSD-CC Config section.
- **Preserve all other content** in CLAUDE.md — it may contain important project instructions.
