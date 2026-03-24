---
name: gsd-cc-tutorial
description: >
  Interactive walkthrough that builds a small sample project step by step.
  Use when user says /gsd-cc-tutorial, /gsd-cc tutorial, or asks for a
  guided introduction to GSD-CC.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# /gsd-cc-tutorial — Guided Walkthrough

You guide the user through building a small project with GSD-CC, explaining each phase as it happens. This is a teaching mode — go slow, explain what's happening and why.

## Language

Ask the user which language to use before starting, just like `/gsd-cc-seed` does. Default to English.

## Step 1: Welcome

```
Welcome to the GSD-CC Tutorial!

I'll walk you through building a small project from start to finish.
You'll see every phase in action: Seed → Plan → Execute → UNIFY.

The whole tutorial takes about 10-15 minutes.

We'll build a simple CLI tool together — small enough to finish quickly,
big enough to see every GSD-CC feature.

Ready? (yes to start)
```

Wait for confirmation.

## Step 2: Explain the Philosophy

Briefly explain (3-4 sentences max):
- Claude Code is the agent, GSD-CC tells it what to do and when
- Projects are broken into Milestones → Slices → Tasks
- Each task fits one context window (fresh session, no context rot)
- UNIFY checks that what was built matches what was planned

Then say: "Let's start. I'll run `/gsd-cc-seed` now — this is the ideation phase."

## Step 3: Run Seed (with commentary)

Delegate to `/gsd-cc-seed` but with a twist: use this project idea:

```
A Node.js CLI tool called "mdcount" that counts words, sentences,
and reading time in Markdown files. Takes a file path as argument,
outputs a summary.
```

Let the user confirm or pick their own idea. If they pick their own, use that instead.

Before each seed question, add a brief explanation:
- "Now I'll ask about [topic]. This helps me understand [why]."

After seed completes, explain what was created:
- "Seed created 5 files in .gsd/. Let me show you the key one..."
- Show a brief excerpt of PLANNING.md

## Step 4: Run Roadmap (with commentary)

Say: "Next, /gsd-cc would create a roadmap. For this small project, we'll have 1 milestone with 2-3 slices."

Create the roadmap. After creation, explain:
- What a milestone is (a major deliverable)
- What a slice is (a coherent work unit, 2-7 tasks)
- Why ordering matters (foundations first)

## Step 5: Run Plan (with commentary)

Say: "Now I'll plan the first slice in detail. Each task gets acceptance criteria (Given/When/Then) and boundaries (what NOT to touch)."

Delegate to `/gsd-cc-plan`. After planning, show:
- One task plan as an example
- Highlight the acceptance criteria format
- Highlight the boundaries section
- "These boundaries prevent Claude from going on tangents — a common problem in AI coding."

## Step 6: Execute One Task (manual)

Say: "Let's execute the first task manually so you can see what happens."

Delegate to `/gsd-cc-apply` for T01 only. After execution:
- Show the SUMMARY.md that was created
- Explain how it compares to the plan
- "In auto-mode, this happens for every task without you doing anything."

## Step 7: Explain Auto-Mode

Don't actually run auto-mode (that would take too long for a tutorial). Instead explain:
- "For the remaining tasks, you'd type `/gsd-cc` and choose 'auto'"
- "Auto-mode runs each task in a fresh `claude -p` session"
- "It uses your Max Plan — no API costs"
- "When all tasks in a slice are done, UNIFY runs automatically"

## Step 8: Explain UNIFY

Explain what UNIFY does:
- Compares what was planned vs. what was built
- Documents deviations and decisions
- Cannot be skipped — the router blocks until it's done
- "This is what prevents 'it sort of works but doesn't match the design'"

## Step 9: Wrap Up

```
That's GSD-CC!

What you learned:
  ✓ Seed     — turns your idea into a structured plan
  ✓ Roadmap  — breaks it into milestones and slices
  ✓ Plan     — creates tasks with acceptance criteria + boundaries
  ✓ Apply    — executes tasks (manual or auto)
  ✓ UNIFY    — mandatory quality check after each slice

Next steps:
  1. Delete this tutorial project: rm -rf .gsd/
  2. Start your real project: /gsd-cc
  3. Or explore: /gsd-cc-help for all commands

Happy building!
```

## Rules

- **Go slow.** This is teaching, not production. Pause between phases.
- **Explain the WHY**, not just the what. Users should understand the design decisions.
- **Keep the project small.** 1 milestone, 2-3 slices, 2-3 tasks per slice max.
- **Only execute 1 task.** The tutorial should take 10-15 minutes, not an hour.
- **Be encouraging.** The user is learning something new.
