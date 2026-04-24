# Task Plan Format Consistency Implementation Plan

## Goal

Unify task plan file conventions across GSD-CC so planning, execution, and
auto-mode all read and write the same task plan format and file names.

The target outcome is:

- one canonical per-task plan format
- one canonical per-task plan filename pattern
- no ambiguity between manual mode and auto-mode
- fail-fast validation when plan artifacts are missing or inconsistent

## Why This Change Comes Second

The installer safety issue is the highest-risk problem because it can delete
unrelated user assets. The next most dangerous issue is task plan format drift:
planning writes one thing, execution expects another, and auto-mode currently
looks for different file names in different branches of the workflow.

That creates silent failure risk. Auto-mode can run without the intended task
plan context, which weakens boundary enforcement, reduces determinism, and makes
incorrect execution much harder to diagnose.

## Current Problems

1. Planning documentation defines per-task plans as
   `.gsd/S{nn}-T{nn}-PLAN.xml`.
2. Manual execution also expects `.gsd/S{nn}-T{nn}-PLAN.xml`.
3. Auto-mode planning instructions generate `.xml` task plans.
4. Auto-mode runtime currently tries to read `.md` task plans in some paths.
5. UNIFY prompt assembly also collects `-PLAN.md` task plan files instead of
   the canonical planning artifacts.
6. There is no startup validation that checks whether all required plan files
   exist before auto-mode starts.

## Non-Goals

- Redesign the XML structure itself unless a minimal adjustment is needed for
  consistency.
- Change the installer or uninstaller in this phase.
- Redesign the slice plan format or roadmap structure.

## Design Principles

1. One source of truth beats compatibility magic.
2. Fail fast with explicit messages instead of continuing in a degraded state.
3. Keep migration conservative and easy to reason about.
4. Align docs, templates, and runtime behavior in the same change set.
5. Avoid dual-format support unless it is strictly needed for transition.

## Proposed Canonical Format

### Canonical per-task plan file

Use:

```text
.gsd/S{nn}-T{nn}-PLAN.xml
```

### Canonical slice plan file

Keep:

```text
.gsd/S{nn}-PLAN.md
```

### Rationale

- planning already defines task plans as XML
- manual apply already consumes XML
- templates already document XML
- changing auto-mode to match the existing contract is lower risk than changing
  the whole project to Markdown task plans

## Affected Surfaces

The following areas must be aligned together:

- `gsd-cc/skills/plan/SKILL.md`
- `gsd-cc/skills/apply/SKILL.md`
- `gsd-cc/skills/unify/SKILL.md`
- `gsd-cc/skills/gsd-cc/SKILL.md` where routing assumptions depend on outputs
- `gsd-cc/skills/auto/SKILL.md`
- `gsd-cc/skills/auto/plan-instructions.txt`
- `gsd-cc/skills/auto/apply-instructions.txt`
- `gsd-cc/skills/auto/unify-instructions.txt`
- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/templates/PLAN.xml`
- user-facing docs that mention per-task plan files

## Implementation Strategy

### Phase A: Inventory and contract freeze

- audit every reference to `PLAN.xml`, `PLAN.md`, and task-plan glob patterns
- decide and document the canonical filename contract
- identify whether any transition compatibility is required for existing users

### Phase B: Runtime alignment

Update `auto-loop.sh` so all runtime branches use the canonical XML task plan
paths:

- execution phase reads `.gsd/${SLICE}-${TASK}-PLAN.xml`
- UNIFY collects `.gsd/${SLICE}-T*-PLAN.xml`
- any existence checks for expected task plans use `.xml`

Also ensure slice plans continue to use `.gsd/${SLICE}-PLAN.md`.

### Phase C: Fail-fast validation

Add explicit validation helpers before dispatch:

1. Validate `STATE.md` contains `current_slice`, `current_task`, `phase`, and
   other required fields.
2. If phase is execution-related, validate the current slice plan exists.
3. Validate the current task plan XML exists before calling `claude -p`.
4. If phase is UNIFY-related, validate all expected task plan XML files for the
   slice are discoverable.
5. Print actionable errors that tell the user what file is missing and which
   command or phase should regenerate it.

Example error style:

```text
Missing task plan: .gsd/S03-T02-PLAN.xml
Run /gsd-cc-plan to regenerate the slice plan artifacts before restarting
auto-mode.
```

### Phase D: Skill and prompt alignment

Update all skill docs and auto-mode instruction files so they refer to the same
artifact names:

- plan writes XML task plans
- apply reads XML task plans
- unify reads XML task plans
- help and tutorial examples mention XML task plans consistently

This phase is important because prompt drift can reintroduce the bug even after
runtime fixes.

### Phase E: Compatibility decision

Choose one of these approaches during implementation:

1. Strict cutover:
   auto-mode accepts only `.xml` task plans and fails if older `.md` plans are
   present.
2. Temporary migration shim:
   detect old `.md` task plan files, stop with a migration message, and ask the
   user to regenerate the slice plan.

Preferred approach: strict cutover with a clear regeneration message, because
dual-format support adds complexity and increases the chance of subtle drift.

## Validation Rules To Add

### Auto-mode startup checks

Before the main loop begins:

- confirm at least one slice roadmap exists
- if `phase` is `plan-complete` or `applying`, require:
  - `.gsd/${SLICE}-PLAN.md`
  - `.gsd/${SLICE}-${TASK}-PLAN.xml`
- if `phase` is `apply-complete`, require:
  - `.gsd/${SLICE}-PLAN.md`
  - one or more `.gsd/${SLICE}-T*-PLAN.xml`
  - one or more `.gsd/${SLICE}-T*-SUMMARY.md`

### Per-iteration checks

Before each dispatch:

- revalidate the current task plan path for execution
- revalidate the expected task-plan glob for UNIFY
- stop immediately if the required artifacts are missing

## Migration Considerations

If historical repos already contain `.gsd/Sxx-Txx-PLAN.md` task plans, do not
try to transform them automatically in this phase unless the conversion is
trivial and safe.

Safer behavior:

- detect legacy task-plan Markdown files
- tell the user the slice must be replanned
- keep the legacy files untouched for inspection

## Files Expected To Change

- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/skills/plan/SKILL.md`
- `gsd-cc/skills/apply/SKILL.md`
- `gsd-cc/skills/unify/SKILL.md`
- `gsd-cc/skills/auto/plan-instructions.txt`
- `gsd-cc/skills/auto/apply-instructions.txt`
- `gsd-cc/skills/auto/unify-instructions.txt`
- `gsd-cc/skills/help/SKILL.md`
- `gsd-cc/skills/tutorial/SKILL.md`
- `README.md` or `gsd-cc/README.md` where task plan artifacts are described

## Verification Plan

### Static verification

- search the repo for `-PLAN.md` references and confirm they only refer to
  slice plans
- search the repo for `-PLAN.xml` references and confirm they cover all task
  plan surfaces

### Manual smoke tests

1. Create a sample `.gsd` slice with:
   - `S01-PLAN.md`
   - `S01-T01-PLAN.xml`
   - `S01-T02-PLAN.xml`
2. Start manual apply and confirm it resolves the XML task plan path.
3. Start auto-mode in `plan-complete` and confirm it loads XML task plans.
4. Move or remove the current task plan XML and confirm auto-mode exits with a
   clear error before dispatch.
5. Run UNIFY preparation and confirm it collects XML task plans, not Markdown
   task-plan files.
6. Create a legacy `S01-T01-PLAN.md` file without XML and confirm the tool
   stops with a regeneration message instead of proceeding.

### Success criteria

- no runtime path still expects task-plan Markdown files
- auto-mode fails before dispatch when task-plan artifacts are missing
- docs, templates, and scripts all describe the same format
- users can diagnose missing-plan problems from the first error message

## Commit Strategy

Planned atomic commits:

1. align runtime file paths and validation in `auto-loop.sh`
2. align skill docs and auto-mode instruction files
3. align help/tutorial/README references and add migration notes if needed

## Open Questions

1. Whether any real user projects already depend on Markdown task-plan files.
2. Whether `STATE.md` should record the task-plan format explicitly for future
   migrations.
3. Whether UNIFY should validate the expected number of task plans against the
   slice task table before proceeding.

## Exit Criteria

This phase is done when:

- the project has one canonical per-task plan format
- manual and automated execution consume the same task-plan artifact type
- auto-mode validates required plan files before dispatching Claude
- missing or legacy task-plan artifacts produce immediate actionable errors
- documentation no longer contradicts runtime behavior
