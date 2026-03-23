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

### Add a Custom Project Type

This is the easiest way to contribute. Drop 3 files into `gsd-cc/skills/gsd/seed/types/your-type/`:

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
- **Respect the architecture.** Claude Code is the agent. GSD-CC tells it *what* to do, not *how* to write code.

## Code of Conduct

Be respectful. We're all here to build better software with AI. No tolerance for harassment or personal attacks.
