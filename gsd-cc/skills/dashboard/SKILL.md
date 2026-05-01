---
name: gsd-cc-dashboard
description: >
  Launch and explain the local GSD-CC dashboard. Use when user says
  /gsd-cc-dashboard, /gsd-cc dashboard, asks for the dashboard, or wants a
  browser view of project progress, auto-mode state, costs, or artifacts.
allowed-tools: Bash
---

# /gsd-cc-dashboard - Local Dashboard

You help the user launch the GSD-CC dashboard for the current repository.
The dashboard is a local browser view over `.gsd/` project state.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All
output must use that language. If not found, default to English.

## Privacy And Scope

Explain this behavior when launching or when the user asks what the dashboard
does:

- The server binds to `127.0.0.1` by default and is intended for the local
  machine only.
- The dashboard reads the current repository's `.gsd/` files and serves static
  dashboard assets from the installed GSD-CC package.
- V1 is read-only. It shows state, progress, auto-mode events, costs, and
  selected `.gsd/` artifacts, but it does not edit files or run workflow
  actions.
- Artifact viewing is limited to safe repository-relative files inside `.gsd/`.
- Stop the server with `Ctrl+C` in the terminal that launched it.

## Launch

Run this command from the project root:

```bash
npx gsd-cc dashboard
```

If the user does not want a browser window opened automatically, use:

```bash
npx gsd-cc dashboard --no-open
```

If the default port is busy, the launcher chooses a nearby free port unless the
user passed `--port`. For an explicit host or port:

```bash
npx gsd-cc dashboard --host 127.0.0.1 --port 4766
```

After launch, report the printed URL and remind the user that the process stays
running until stopped.

## When State Is Missing

If the project has no `.gsd/` directory yet, the dashboard still opens but shows
an empty project model. Suggest `/gsd-cc` to start or resume structured project
state.
