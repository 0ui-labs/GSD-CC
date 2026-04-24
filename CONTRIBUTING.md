# Contributing to GSD-CC

Thanks for your interest in contributing! GSD-CC is intentionally simple — Markdown + Bash, zero dependencies — and we'd like to keep it that way.

## Ways to Contribute

### Report Bugs / Request Features

Open an [issue](https://github.com/0ui-labs/GSD-CC/issues). Include:
- What you expected vs. what happened
- Your Claude Code version (`claude --version`)
- The relevant `.gsd/STATE.md` content (if applicable)

### Fix Bugs / Improve Skills

1. Fork the repo
2. Create a branch (`git checkout -b fix/your-fix`)
3. Make your changes
4. Test the full cycle: `/gsd-cc-seed` → `/gsd-cc-plan` → `/gsd-cc-apply` → `/gsd-cc-unify`
5. Open a PR with a clear description of what changed and why

### Add a Project Type

This is the easiest way to contribute.

To add a built-in project type to the package, create it in the source tree:

- `gsd-cc/skills/seed/types/your-type/`

To test or use a custom project type without changing the package, add it to
your installed GSD-CC scope instead:

- Local install: `./.claude/skills/seed/types/your-type/`
- Global install: `~/.claude/skills/seed/types/your-type/`

Built-in type layout:

```
types/your-type/
├── guide.md      # Conversation sections (Explore/Suggest/Skip-Condition)
├── config.md     # rigor, section count, demeanor
└── loadout.md    # Recommended tools and libraries
```

Look at the existing types (`application`, `workflow`, `utility`, `client`, `campaign`) for reference.

### Improve Documentation

PRs for clearer wording, better examples, or typo fixes are always welcome.

## Guidelines

- **Keep it simple.** No new dependencies. No build steps. If it can't be expressed in Markdown or Bash, it probably doesn't belong here.
- **One PR, one concern.** Don't bundle unrelated changes.
- **Test your changes.** Run at least one full Seed → Plan → Apply → Unify cycle before submitting.
- **Protect shared Claude directories.** Changes to `gsd-cc/bin/install.js` must preserve manifest-driven ownership, conservative uninstall behavior, and conflict-safe installs in mixed `.claude/` setups.
- **Respect the architecture.** Claude Code is the agent. GSD-CC tells it *what* to do, not *how* to write code.

## Documentation Sync

If you change install behavior, runtime paths, dependency readiness, or plan
artifacts, keep these surfaces aligned in the same PR:

- `README.md`
- `gsd-cc/README.md`
- `CONTRIBUTING.md`
- `gsd-cc/skills/seed/SKILL.md`
- `gsd-cc/skills/plan/SKILL.md`
- `gsd-cc/skills/auto/SKILL.md`
- `gsd-cc/skills/update/SKILL.md`

Canonical topics that must stay synchronized:

- Install and uninstall behavior, including scope flags
- Manifest and hook locations
- Custom project type paths for source vs installed layouts
- Dependency readiness (`jq` for hooks, `jq` + `git` + `claude` for auto-mode)
- Slice-plan vs task-plan artifact naming (`S{nn}-PLAN.md` vs `S{nn}-T{nn}-PLAN.xml`)

## Code of Conduct

Be respectful. We're all here to build better software with AI. No tolerance for harassment or personal attacks.
