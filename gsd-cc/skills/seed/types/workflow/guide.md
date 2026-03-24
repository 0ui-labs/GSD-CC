# Workflow — Conversation Guide

## 1/8 — Trigger & Purpose

**Explore:** What kicks this off? A slash command, a hook, a schedule, a user action? What's the end result — what does "done" look like?

**Suggest:** Slash commands for user-initiated, hooks for automatic triggers (pre-commit, post-file-edit), MCP for tool integration. Pick one primary trigger.

**Skip-Condition:** Never skip.

## 2/8 — Steps & Flow

**Explore:** Walk me through it step by step. What happens first, then what? Are there decision points where the flow branches? Is it linear or does it loop?

**Suggest:** Draw it as: "Step 1 → Step 2 → if X then Step 3a, else Step 3b → Done." Keep it under 10 steps. If more, consider splitting into multiple workflows.

**Skip-Condition:** Never skip.

## 3/8 — Tools & Permissions

**Explore:** What Claude Code tools does this need? Read, Write, Edit, Bash, Glob, Grep? Any MCP servers? What permissions are required — and what should be explicitly excluded?

**Suggest:** Start with the minimum set. Read + Glob for analysis workflows. Read + Write + Edit for modification workflows. Bash only when shell access is truly needed.

**Skip-Condition:** Never skip.

## 4/8 — Error Handling

**Explore:** What can go wrong? File not found, permission denied, unexpected format, API timeout? What should happen in each case — retry, abort, ask the user?

**Suggest:** For each error: decide between fail-fast (abort + clear message) and graceful degradation (skip + warn). Most workflows should fail-fast on critical errors and degrade on optional steps.

**Skip-Condition:** Never skip.

## 5/8 — State Management

**Explore:** Does this workflow need to remember anything between runs? Intermediate results, configuration, progress tracking? Where does state live — files, environment variables?

**Suggest:** If stateless works, prefer it. If state is needed: a single JSON or markdown file in `.gsd/` or a project-specific directory. Avoid complex state machines unless truly needed.

**Skip-Condition:** Skip if the workflow is purely stateless (single run, no memory).

## 6/8 — Testing Strategy

**Explore:** How do you verify this works? Can you test it in isolation? What's a minimal test case? What would a regression look like?

**Suggest:** Create a test fixture (sample files/state), run the workflow, check the output. For hooks: test with a dry-run flag. For commands: test with known input.

**Skip-Condition:** Never skip.

## 7/8 — Distribution

**Explore:** Is this just for you, or should others be able to install it? If shared: how? npm package, GitHub repo, copy-paste into `.claude/`?

**Suggest:** Personal: drop in `~/.claude/commands/` or `~/.claude/skills/`. Shared: npm package with an installer (like GSD-CC itself). For teams: document in project README.

**Skip-Condition:** Skip if explicitly personal-only.

## 8/8 — Integration with Other Skills

**Explore:** Does this work with other Claude Code skills or commands? Does it read or write files that other workflows depend on? Any coordination needed?

**Suggest:** If it reads/writes shared state (like `.gsd/STATE.md`), document the contract. If it triggers other commands, define the interface clearly.

**Skip-Condition:** Skip if fully standalone.
