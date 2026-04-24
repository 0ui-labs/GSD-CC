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
npx gsd-cc --global --yes          # Install/update without prompts
npx gsd-cc --local --language Deutsch
npx gsd-cc --uninstall            # Remove detected installs safely
npx gsd-cc --uninstall --global   # Remove only the global install
npx gsd-cc --uninstall --local    # Remove only the local install
```

GSD-CC tracks installed assets in `~/.claude/gsd-cc/install-manifest.json`
(global) or `./.claude/gsd-cc/install-manifest.json` (local), removes only
files it owns during uninstall, and aborts if an existing target file cannot
be proven safe to overwrite.

Installed layout:
- Hooks: `~/.claude/hooks/gsd-cc/` or `./.claude/hooks/gsd-cc/`
- Custom types: `~/.claude/skills/seed/types/<your-type>/` or `./.claude/skills/seed/types/<your-type>/`
- Scope-specific uninstall: `--global` or `--local`
- Prompt-free installs: `--yes`
- Explicit language: `--language <name>`

Reinstall and update runs preserve the existing `GSD-CC language` setting by
default. In non-interactive mode, missing language defaults to English and
missing scope defaults to a global install.

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
- **jq** installed (`brew install jq`) — required for hooks-ready and
  auto-ready installs

Install still succeeds without `jq`, but jq-dependent hooks stay disabled and
auto-mode remains unavailable until `jq` is installed. Rerun the installer
after adding `jq` to activate hooks.

## Testing

From this package directory:

```bash
npm test
```

The suite uses temporary homes, projects, fake `claude`/`jq` binaries, and
temporary Git repositories. It must not touch the developer's real
`~/.claude`, call the real `claude` CLI, or require network access.

## Documentation

Full documentation, architecture details, and custom type guide: [GitHub](https://github.com/0ui-labs/GSD-CC)

## License

[MIT](https://github.com/0ui-labs/GSD-CC/blob/main/LICENSE)
