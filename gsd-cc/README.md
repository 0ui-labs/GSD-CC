# GSD-CC — Get Shit Done on Claude Code

A project management system for AI-powered software development. Structure your ideas, break them into executable units, and let Claude Code do the work — guided or fully autonomous.

## Why GSD-CC?

Claude Code is the best coding agent available. But without structure, large projects degrade into chaos: context rot, lost decisions, no quality control.

GSD-CC orchestrates Claude Code with native Skills (Markdown) — no API costs,
no build step, no custom agent.

| Feature | GSD-CC |
|---------|--------|
| Runtime | Claude Code (native) |
| Cost model | Max Plan (flat rate) |
| Dependencies | No build step (Markdown + Bash + CLI tools) |
| Quality control | Mandatory UNIFY after every slice |
| Boundary enforcement | Explicit DO NOT CHANGE rules per task |
| Custom project types | Drop 3 files, done |

## Install

```bash
npx gsd-cc            # Install globally (default)
npx gsd-cc --local    # Install to current project only
npx gsd-cc --uninstall
npx gsd-cc --uninstall --local
```

GSD-CC tracks installed assets in `.claude/gsd-cc/install-manifest.json`,
removes only files it owns during uninstall, and aborts if an existing target
file cannot be proven safe to overwrite.

## Usage

```bash
claude          # Open Claude Code
> /gsd-cc       # That's it. The router handles the rest.
```

GSD-CC reads your project state and suggests the next action. The full cycle:

**SEED** (ideation) → **PLAN** (tasks with acceptance criteria) → **APPLY** (execute) → **UNIFY** (mandatory plan vs. actual)

Auto-mode runs tasks autonomously via `claude -p` on your Max Plan.

Artifact convention:
- Slice overview: `.gsd/S{nn}-PLAN.md`
- Per-task plans: `.gsd/S{nn}-T{nn}-PLAN.xml`

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- Claude Code **Max Plan** (recommended for auto-mode)
- **Git** initialized in your project
- **jq** installed (`brew install jq`) — required for hook activation and auto-mode

Install still succeeds without `jq`, but jq-dependent hooks stay disabled and
auto-mode remains unavailable until `jq` is installed. Rerun the installer
after adding `jq` to activate hooks.

## Documentation

Full documentation, architecture details, and custom type guide: [GitHub](https://github.com/0ui-labs/GSD-CC)

## License

[MIT](https://github.com/0ui-labs/GSD-CC/blob/main/LICENSE)
