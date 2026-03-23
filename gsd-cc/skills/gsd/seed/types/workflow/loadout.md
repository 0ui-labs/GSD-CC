# Workflow — Recommended Tools

## Claude Code Features
- **Skills** (SKILL.md) — for persistent, auto-triggered behaviors
- **Commands** (commands/) — for slash-command invocations
- **Hooks** (settings.json) — for event-driven automation
- **MCP Servers** — for tool integration

## Markdown Authoring
- **YAML frontmatter** — skill metadata (name, description, allowed-tools)
- **Structured sections** — clear step-by-step instructions

## Shell
- **Bash** — for auto-loop scripts and system integration
- **jq** — JSON parsing in shell scripts
- **curl** — API calls from scripts

## Testing
- **Manual test fixtures** — sample files + expected output
- **Bash assertions** — `[[ -f expected.md ]]` style checks
- **Dry-run flags** — non-destructive test modes
