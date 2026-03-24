# Quality Gate: Planning Ready

Check ALL items before allowing execution to start. If any item fails, fix the plan first.

## Acceptance Criteria

- [ ] Every task has at least 1 acceptance criterion
- [ ] Every AC uses Given/When/Then format
- [ ] Every AC has a unique ID (AC-1, AC-2, ...) within the slice
- [ ] ACs are testable — there is a concrete way to verify each one

## Boundaries

- [ ] Every task has a `<boundaries>` section
- [ ] Boundaries section can be "No boundary restrictions" but must exist
- [ ] Files created by earlier tasks are listed as DO NOT CHANGE in later tasks that should not modify them

## Task Quality

- [ ] No "TBD", "TODO", "later", or "tbd" in `<action>` or `<files>` fields
- [ ] Every `<files>` section lists concrete file paths, not placeholders
- [ ] Every `<action>` section has numbered, concrete steps
- [ ] Every `<verify>` references at least one AC by ID

## Scope

- [ ] Task count per slice: 1-7 (more means the slice should be split)
- [ ] Each task fits in one context window (~15 files of context + output)
- [ ] No circular dependencies between tasks
- [ ] Tasks are ordered by dependency (foundations first)

## Completeness

- [ ] Slice plan (S{nn}-PLAN.md) has overview, task table, AC table, boundaries summary
- [ ] Every task has a per-task plan file (S{nn}-T{nn}-PLAN.md)
- [ ] Git branch created for this slice (gsd/M{n}/S{nn})
