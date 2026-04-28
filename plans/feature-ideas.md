# Feature Ideas for GSD-CC

This document collects product ideas that would make GSD-CC easier to trust,
easier to understand, and safer to use for larger AI-assisted development
projects.

## Guiding Principle

GSD-CC should not grow by adding random commands. The best improvements are the
ones that reduce uncertainty for the user:

- What is the current project state?
- What will Claude do next?
- Which changes are risky?
- When should a human approve something?
- What happened if auto-mode stopped?

The strongest direction is: more visibility, more safety, and less mental load.

## 1. Visual Project Dashboard

Add a simple generated dashboard, either as HTML or a richer CLI/status view.

It should show:

- current milestone
- current slice
- current task
- completed tasks
- blocked tasks
- latest UNIFY result
- latest decisions
- auto-mode status
- test and verification status

Why this helps:

Users should not need to inspect `.gsd/STATE.md`, task summaries, and UNIFY
reports manually just to understand where the project stands. A dashboard would
make GSD-CC feel more like a real product and less like a collection of files.

Possible first version:

- generate `.gsd/dashboard.html`
- update it from `/gsd-cc-status`
- keep it static and dependency-free

## 2. Explain My Project State

Add a status explanation mode that summarizes the current state in plain
language.

Example output:

```text
We are in M001 / S02 / T03.

The slice plan is complete, but T03 is blocked because the auth API contract is
unclear. The next useful step is to resolve that decision before applying more
code changes.
```

Why this helps:

GSD-CC stores good state, but not every user wants to read structured files. A
plain-language explanation would make the workflow easier for non-experts and
for users returning after a break.

Possible command shape:

```text
/gsd-cc-status explain
```

or a router behavior when state is blocked or confusing.

## 3. Machine-Readable Plan Validator

Before execution starts, validate slice and task plans with code instead of
only relying on prompt instructions.

The validator should check:

- every task has at least one acceptance criterion
- every acceptance criterion uses Given/When/Then format
- every `<files>` entry is concrete and repo-relative
- no `TODO`, `TBD`, or `later` appears in critical fields
- every `<verify>` references AC IDs
- every task has boundaries
- no task is too broad
- no two tasks claim conflicting ownership without explicit sequencing
- legacy Markdown task plans are rejected before auto-mode starts

Why this helps:

Bad plans create bad execution. Since auto-mode derives fallback Git scope from
the `<files>` section, plan quality is not just cosmetic. It is part of safety.

Possible first version:

```bash
node scripts/validate-plan.js .gsd/S01-PLAN.md
```

The implementation can stay dependency-free by using conservative parsing and
clear failure messages.

## 4. Risk Score per Task

Assign each task a simple risk level before execution.

Suggested levels:

- low: isolated file change, narrow behavior, easy verification
- medium: multiple files, shared interfaces, non-trivial tests
- high: auth, payments, database migrations, deployment, destructive scripts,
  security-sensitive behavior, or broad refactors

Why this helps:

Not every task deserves the same amount of human attention. A risk score helps
the user decide when auto-mode is reasonable and when manual review is worth
the time.

Possible fields:

```xml
<risk level="medium">
  Touches shared API types and request validation.
</risk>
```

## 5. Human Approval Rules for Critical Areas

Add configurable approval rules for files, directories, or categories of work.

Example:

```text
requires_approval:
- package.json
- database migrations
- auth
- billing
- deployment
- .github/workflows
```

Why this helps:

Some changes are too important for autonomous execution by default. Claude
should be able to plan them, but not silently apply them without explicit user
approval.

This would complement boundaries:

- boundaries mean "do not touch this"
- approval rules mean "stop and ask before touching this"

## 6. Better Auto-Mode Failure Recovery

When auto-mode stops, write a clear recovery report.

It should answer:

- what was running?
- what changed?
- what was committed?
- what remains uncommitted?
- why did auto-mode stop?
- what is the safest next action?

Possible artifact:

```text
.gsd/AUTO-RECOVERY.md
```

Why this helps:

Autonomous systems will stop sometimes. That is acceptable if the stop is
understandable. A recovery report would make interruptions feel controlled
instead of mysterious.

## 7. Learning Mode for Beginners

Add an optional mode where GSD-CC explains the workflow as it goes.

Example:

```text
I am splitting this milestone into slices because large AI tasks are harder to
control. Each slice should produce something verifiable before we continue.
```

Why this helps:

GSD-CC can teach users how to work well with AI coding agents. This makes it
valuable not only as automation, but also as a coaching system.

Possible setting:

```text
learning_mode: true
```

## 8. Stronger Plan vs Actual Diff Report

Expand UNIFY into a more structured reconciliation report.

Suggested sections:

- planned work
- implemented work
- not implemented
- extra work added
- deviations
- risks introduced
- tests and evidence
- recommendation for the next slice

Why this helps:

UNIFY is one of GSD-CC's strongest ideas. Making the report more scannable and
more consistent would increase trust after each slice.

Possible format:

```markdown
## Plan vs Actual

| Area | Planned | Actual | Status |
|------|---------|--------|--------|
| Auth validation | Add schema checks | Added schema and tests | matched |
| Error copy | Not specified | Added default messages | extra |
```

## 9. Project Profiles and Presets

Add built-in workflow presets for common project types.

Examples:

- Solo MVP
- Client Website
- SaaS App
- Internal Tool
- Library or CLI
- Refactor Existing App

Each preset could influence:

- rigor level
- default task size
- required tests
- approval rules
- auto-mode aggressiveness
- documentation expectations

Why this helps:

Different projects need different strictness. A client landing page and a SaaS
app with billing should not use the same defaults.

## 10. Safe Auto Pilot Mode

Add an execution mode between manual and full auto.

Safe Auto Pilot would:

1. run one task
2. run verification
3. write summary
4. commit only task-scoped changes
5. stop if risk increased
6. ask before continuing

Why this helps:

Many users want autonomy, but not unlimited autonomy. This mode would make
GSD-CC feel safer for real projects because control returns after every
meaningful unit.

Possible UX:

```text
Auto Pilot completed S01/T02.

Tests passed. One task-scoped commit was created.
Risk for the next task is high because it touches auth.

Continue?
```

## Suggested Priority

The highest-impact sequence would be:

1. Machine-readable plan validator
2. Visual project dashboard
3. Human approval rules
4. Better auto-mode failure recovery
5. Stronger UNIFY diff report

Reasoning:

The validator improves safety before work starts. The dashboard improves
visibility while work is happening. Approval rules and recovery reports improve
trust when work becomes risky or stops unexpectedly. The stronger UNIFY report
then closes the loop after every slice.

## Product Direction

The project should stay focused on being an orchestration and safety layer for
Claude Code, not a replacement agent.

Good future features should:

- make state easier to understand
- make autonomous execution safer
- make planning quality measurable
- make failures recoverable
- keep the system dependency-light

Features to avoid:

- broad UI work before the core state model is stable
- heavyweight services or databases
- hidden magic that changes files without clear traceability
- features that duplicate Claude Code instead of guiding it
