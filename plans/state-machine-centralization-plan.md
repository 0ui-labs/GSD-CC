# State Machine Centralization Implementation Plan

## Goal

Centralize GSD-CC phase and state rules so every skill and script agrees on
which fields are required, which artifacts must exist, and which transition is
allowed next.

The target outcome is:

- one source of truth for valid phases
- phase-specific required fields instead of one global field list
- clear allowed transitions between phases
- `auto-loop.sh` validates state using the same contract as the router
- Markdown skills reference the central contract instead of restating rules
- tests catch missing fields, illegal transitions, and artifact drift

## Why This Change Comes Fifth

GSD-CC already has a real workflow state machine, but it is implicit. Phase
names and transition rules are spread across:

- `gsd-cc/skills/gsd-cc/SKILL.md`
- `gsd-cc/skills/*/SKILL.md`
- `gsd-cc/skills/auto/*.txt`
- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/templates/STATE.md`
- hook scripts that read `STATE.md`

That makes small mistakes dangerous. For example, Seed intentionally initializes
state with:

```yaml
current_slice: -
current_task: -
phase: seed-complete
```

but `auto-loop.sh` currently validates `milestone`, `current_slice`,
`current_task`, `phase`, and `rigor` as globally required before it considers
the actual phase. That kind of mismatch can make a valid early project state
look broken.

The fix is not a bigger router. It is a small, explicit phase contract that all
runtime code and skill instructions can point to.

## Current Problem

### Phase rules are duplicated

Examples:

- Seed says `seed-complete` has no active slice or task yet.
- Stack says it updates only `phase: stack-complete`.
- Plan says planning completion sets `current_slice`, `current_task: T01`,
  and `phase: plan-complete`.
- Apply says `partial` and `blocked` become `phase: apply-blocked`.
- UNIFY says success becomes `phase: unified`.
- Auto-mode groups several planning phases together in shell `case` branches.

These are all valid pieces, but there is no central place to ask:

```text
For phase X, what fields must exist?
For phase X, which fields may be empty?
For phase X, which artifacts must exist?
From phase X, what phase can come next?
```

### Runtime validation is too coarse

The current auto-mode startup validation checks the same required fields for
every phase:

```bash
for field in milestone current_slice current_task phase rigor; do
  ...
done
```

That is too strict for pre-roadmap states and too weak for later states. It can
reject valid early phases while missing phase-specific artifact requirements.

### Router order encodes state rules implicitly

The router decision tree works by checking files and phase values in order.
That is useful UX logic, but it should not be the only place where state
validity is defined.

## Non-Goals

- Replace the Markdown skill system with a large framework.
- Add a database or state server.
- Rewrite every skill in one pass.
- Make hooks enforce every phase transition.
- Prevent manual recovery edits to `.gsd/STATE.md`.

The first implementation should be small and boring: a spec, a validator, and
targeted tests.

## Proposed State Contract

Add a machine-readable phase spec:

```text
gsd-cc/templates/STATE_MACHINE.json
```

The installer already copies `templates/`, so this file will be available in
local and global installs without adding a new top-level install layout.

Example shape:

```json
{
  "version": 1,
  "emptyValues": ["", "-", "\\u2014"],
  "phases": {
    "seed": {
      "description": "Initial template state before Seed completes.",
      "requiredFields": ["phase", "rigor", "project_type", "language"],
      "optionalFields": ["milestone", "current_slice", "current_task"],
      "requiredArtifacts": [],
      "next": ["seed-complete"]
    },
    "seed-complete": {
      "description": "Project brief exists; tech stack is next.",
      "requiredFields": ["phase", "rigor", "project_type", "language"],
      "optionalFields": ["milestone", "current_slice", "current_task"],
      "requiredArtifacts": [".gsd/PLANNING.md", ".gsd/PROJECT.md"],
      "next": ["stack-complete"]
    },
    "stack-complete": {
      "description": "Tech stack exists; roadmap is next.",
      "requiredFields": ["phase", "rigor", "project_type", "language"],
      "optionalFields": ["milestone", "current_slice", "current_task"],
      "requiredArtifacts": [
        ".gsd/PLANNING.md",
        ".gsd/PROJECT.md",
        ".gsd/STACK.md"
      ],
      "next": ["roadmap-complete"]
    },
    "roadmap-complete": {
      "description": "Roadmap exists; current slice needs planning.",
      "requiredFields": ["phase", "milestone", "current_slice", "rigor"],
      "requiredArtifacts": [".gsd/M*-ROADMAP.md"],
      "next": ["discuss-complete", "plan-complete"]
    },
    "discuss-complete": {
      "description": "Ambiguities resolved for the current slice.",
      "requiredFields": ["phase", "milestone", "current_slice", "rigor"],
      "requiredArtifacts": [".gsd/M*-ROADMAP.md"],
      "next": ["plan-complete"]
    },
    "plan-complete": {
      "description": "Current slice has XML task plans.",
      "requiredFields": [
        "phase",
        "milestone",
        "current_slice",
        "current_task",
        "rigor"
      ],
      "requiredArtifacts": [
        ".gsd/{current_slice}-PLAN.md",
        ".gsd/{current_slice}-T*-PLAN.xml"
      ],
      "next": ["applying", "apply-complete", "apply-blocked"]
    },
    "applying": {
      "description": "A task in the current slice is ready or in progress.",
      "requiredFields": [
        "phase",
        "milestone",
        "current_slice",
        "current_task",
        "rigor"
      ],
      "requiredArtifacts": [
        ".gsd/{current_slice}-PLAN.md",
        ".gsd/{current_slice}-{current_task}-PLAN.xml"
      ],
      "next": ["applying", "apply-complete", "apply-blocked"]
    },
    "apply-blocked": {
      "description": "Current task is partial or blocked.",
      "requiredFields": [
        "phase",
        "milestone",
        "current_slice",
        "current_task",
        "blocked_reason",
        "rigor"
      ],
      "requiredArtifacts": [
        ".gsd/{current_slice}-{current_task}-PLAN.xml",
        ".gsd/{current_slice}-{current_task}-SUMMARY.md"
      ],
      "next": ["applying", "plan-complete"]
    },
    "apply-complete": {
      "description": "All tasks in the current slice have summaries.",
      "requiredFields": [
        "phase",
        "milestone",
        "current_slice",
        "current_task",
        "rigor"
      ],
      "requiredArtifacts": [
        ".gsd/{current_slice}-PLAN.md",
        ".gsd/{current_slice}-T*-PLAN.xml",
        ".gsd/{current_slice}-T*-SUMMARY.md"
      ],
      "next": ["unified", "unify-failed", "unify-blocked"]
    },
    "unify-failed": {
      "description": "UNIFY found critical problems.",
      "requiredFields": ["phase", "milestone", "current_slice", "rigor"],
      "requiredArtifacts": [".gsd/{current_slice}-UNIFY.md"],
      "next": ["applying", "apply-complete", "unify-blocked"]
    },
    "unify-blocked": {
      "description": "UNIFY cannot merge or complete without user action.",
      "requiredFields": ["phase", "milestone", "current_slice", "rigor"],
      "requiredArtifacts": [".gsd/{current_slice}-UNIFY.md"],
      "next": ["unified", "unify-failed"]
    },
    "unified": {
      "description": "Current slice is reconciled and complete.",
      "requiredFields": ["phase", "milestone", "current_slice", "rigor"],
      "requiredArtifacts": [".gsd/{current_slice}-UNIFY.md"],
      "next": ["roadmap-complete", "plan-complete", "milestone-complete"]
    },
    "milestone-complete": {
      "description": "All slices in the milestone are unified.",
      "requiredFields": ["phase", "milestone", "rigor"],
      "requiredArtifacts": [".gsd/M*-ROADMAP.md"],
      "next": []
    }
  }
}
```

The exact list can be adjusted during implementation, but the important rule is
that each phase declares its own field and artifact contract.

## Proposed Implementation

### 1. Add `STATE_MACHINE.json`

Create the spec under `gsd-cc/templates/` so installed skills and scripts can
read it from:

```text
.claude/templates/STATE_MACHINE.json
```

or, in the source repo fallback:

```text
gsd-cc/templates/STATE_MACHINE.json
```

Keep the file deliberately simple:

- JSON only
- no comments
- no generated step required
- no dependency beyond `jq` for shell consumers

### 2. Add state version metadata

Update `gsd-cc/templates/STATE.md` frontmatter:

```yaml
state_schema_version: 1
phase: seed
```

This gives future migrations a handle without changing the current Markdown
state format.

### 3. Add a shared validator for Node tests

Add a small test/runtime helper:

```text
gsd-cc/test/helpers/state-machine.js
```

It should:

- load `STATE_MACHINE.json`
- parse `STATE.md` frontmatter
- treat `""`, `-`, and the Unicode em dash as empty values
- validate required fields by phase
- expand artifact templates like `{current_slice}`
- support glob artifact checks
- validate allowed transitions when given a previous phase

This helper is test-only at first. It lets the suite lock down the contract
before shell scripts consume it.

### 4. Replace `auto-loop.sh` global field validation

Remove the startup loop that requires `current_slice` and `current_task` for
all phases.

Replace it with phase-aware validation:

- unknown phase: stop with a repair hint
- required field missing for that phase: stop with a phase-specific message
- artifact missing for that phase: stop with a phase-specific message
- optional empty field in early phases: allowed

Because `auto-loop.sh` already requires `jq`, it can read the JSON spec
directly.

Add helper functions:

```bash
state_machine_path()
load_phase_spec()
state_field_is_empty()
validate_phase_fields()
validate_phase_artifacts()
validate_phase_transition()
```

The existing `validate_phase_artifacts` shell function can be refactored into
the new spec-driven implementation instead of growing another case statement.

### 5. Make transition writes explicit

Add one small shell helper for auto-mode:

```bash
transition_phase() {
  local from="$1" to="$2"
  validate_phase_transition "$from" "$to"
  update_state_field "phase" "$to"
  update_state_field "last_updated" "$(date -Iseconds)"
}
```

Use it when auto-mode itself changes phase, for example:

- `unified` to `plan`
- `unified` to `plan-complete`
- next-slice setup

Sub-agent prompts can still update `STATE.md`, but auto-mode should validate
the resulting phase after each dispatch.

### 6. Update Markdown skills to point at the contract

Update the main router and phase skills so they reference
`STATE_MACHINE.json` as the authority for state rules.

Do not paste the whole JSON into every skill. Instead add short language like:

```text
Before updating `.gsd/STATE.md`, follow the phase contract in
`.claude/templates/STATE_MACHINE.json` (or source fallback
`gsd-cc/templates/STATE_MACHINE.json`).
```

Specific files to align:

- `gsd-cc/skills/gsd-cc/SKILL.md`
- `gsd-cc/skills/seed/SKILL.md`
- `gsd-cc/skills/ingest/SKILL.md`
- `gsd-cc/skills/stack/SKILL.md`
- `gsd-cc/skills/discuss/SKILL.md`
- `gsd-cc/skills/plan/SKILL.md`
- `gsd-cc/skills/apply/SKILL.md`
- `gsd-cc/skills/unify/SKILL.md`
- `gsd-cc/skills/auto/*.txt`

### 7. Keep router UX separate from state validity

The router can keep its top-to-bottom UX decision tree, but it should start by
checking whether the current phase is valid.

If invalid:

- report the exact phase and missing field/artifact
- suggest the one safest repair action
- do not continue routing as if state were valid

This prevents file-existence heuristics from skipping over a blocked or invalid
state.

### 8. Avoid hook overreach

Hooks should not become full state-machine enforcers in this phase.

Minimal hook alignment:

- statusline may display unknown phase plainly
- workflow guard may use a small list of planning phases derived from the
  central spec later

Full hook validation can wait until the core router and auto-loop are stable.

## Files Expected To Change

- `gsd-cc/templates/STATE_MACHINE.json`
- `gsd-cc/templates/STATE.md`
- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/skills/gsd-cc/SKILL.md`
- phase skills that update `.gsd/STATE.md`
- `gsd-cc/package.json` if new tests are wired into scripts

Possible additions:

- `gsd-cc/test/state-machine.test.js`
- `gsd-cc/test/helpers/state-machine.js`
- `gsd-cc/test/auto-state-validation.test.js`

## Test Strategy

### Test 1: Spec contains every phase used by skills

Search skill and shell files for phase literals and assert each one exists in
`STATE_MACHINE.json`.

Expected covered phases:

- `seed`
- `seed-complete`
- `stack-complete`
- `roadmap-complete`
- `discuss-complete`
- `plan`
- `plan-complete`
- `applying`
- `apply-blocked`
- `apply-complete`
- `unify-failed`
- `unify-blocked`
- `unified`
- `milestone-complete`

If implementation decides not to keep `plan` or `milestone-complete` as real
state phases, remove them from skills or tests explicitly.

### Test 2: Early phases allow empty slice and task

Create `STATE.md` fixtures for:

- `seed-complete`
- `stack-complete`

with:

```yaml
current_slice: -
current_task: -
```

Expected:

- state validation passes when required artifacts exist
- no validator requires `current_task` before a slice is active

### Test 3: Execution phases require active slice and task

Create invalid fixtures:

- `phase: plan-complete` with `current_task: -`
- `phase: applying` with missing task plan
- `phase: apply-blocked` without `blocked_reason`

Expected:

- validation fails with a message naming the missing field or artifact

### Test 4: Allowed transitions are enforced

Validate examples:

- `seed` to `seed-complete`: allowed
- `seed-complete` to `stack-complete`: allowed
- `stack-complete` to `roadmap-complete`: allowed
- `plan-complete` to `applying`: allowed
- `applying` to `apply-complete`: allowed
- `apply-complete` to `unified`: allowed
- `seed-complete` to `apply-complete`: rejected
- `apply-blocked` to `unified`: rejected

### Test 5: Auto-loop accepts valid early state gracefully

Run `auto-loop.sh` with a temporary `.gsd/STATE.md` in `seed-complete`.

Expected:

- it does not fail because `current_task` is empty
- it stops with a clear message that auto-mode cannot run before a roadmap or
  slice is ready

This is better than pretending auto-mode can continue from a pre-roadmap state.

### Test 6: Auto-loop validates post-dispatch state

Use a fake `claude` that writes an illegal phase transition after a dispatch.

Expected:

- auto-loop stops
- log names the illegal transition
- no next task or next slice starts

### Test 7: Router docs and spec stay aligned

Add a text-level test that extracts phase literals from
`gsd-cc/skills/gsd-cc/SKILL.md` and confirms they exist in the spec.

This catches docs drifting away from the machine-readable contract.

## Implementation Phases

### Phase A: Add the spec and tests

- create `STATE_MACHINE.json`
- add state-machine test helper
- add tests for phase coverage, required fields, artifacts, and transitions
- do not change runtime behavior yet

This gives a failing or partially failing safety net before refactoring shell
logic.

### Phase B: Refactor auto-loop validation

- remove global field validation
- load the central spec
- validate fields and artifacts by phase
- add clearer messages for phases that are valid but not auto-runnable
- validate state after each `claude -p` dispatch

### Phase C: Align state-writing skills

- update each skill that writes `phase`
- remove contradictory field requirements
- ensure early phases set inactive slice/task consistently
- ensure blocked phases always record the reason field required by the spec

### Phase D: Align router behavior

- add an initial state-validity check
- route invalid states to one repair action
- keep the existing UX decision tree for valid states

### Phase E: Manual smoke test

In `/tmp`, create minimal `.gsd` fixtures for:

1. seed-complete with no active slice/task
2. roadmap-complete with active slice but no task
3. plan-complete with task plans
4. apply-blocked with blocked reason
5. apply-complete with summaries
6. unified with UNIFY file

Run the validator and auto-mode fixture over each state.

## Acceptance Criteria

- There is one central spec listing valid phases and required fields.
- `current_task` is not required for phases that do not have an active task.
- Unknown phase values fail with a clear repair hint.
- Auto-mode uses phase-specific validation instead of a global field list.
- Illegal phase transitions are caught before continuing autonomous work.
- Skills that write `STATE.md` reference the central phase contract.
- Tests cover early, planning, execution, blocked, UNIFY, and unified states.

## Suggested Atomic Commits

1. `test(state): Cover phase contract`
2. `feat(state): Add central phase spec`
3. `fix(auto): Validate state by phase`
4. `docs(state): Align skills with phase contract`
