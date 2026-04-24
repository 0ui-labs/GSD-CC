# Quality Gate: UNIFY Complete

Check ALL items before allowing the next slice to start. If any item fails, complete the UNIFY first.

## Plan vs. Actual

- [ ] Plan vs. Actual table is present
- [ ] Every task from the plan is listed (none missing)
- [ ] Each task has a status: as planned / expanded / partial / skipped
- [ ] If a task was expanded or skipped, there is a brief explanation

## Acceptance Criteria

- [ ] AC status table is present
- [ ] Every AC from the plan is listed with Pass / Partial / Fail
- [ ] Each AC has an evidence column (test output, manual check, etc.)
- [ ] No AC is left without a status

## Decisions

- [ ] Decisions section is present (can be "No additional decisions made.")
- [ ] Each decision made during execution is listed with rationale
- [ ] Decisions are appended to .gsd/DECISIONS.md

## Boundary Violations

- [ ] Boundary violations section is present
- [ ] "None." if all boundaries were respected
- [ ] If violations occurred: which file, which task, why

## Deferred Issues

- [ ] Deferred section is present (can be empty)
- [ ] Each deferred issue names a target slice or "later"
- [ ] Deferred items are actionable, not vague

## Commit Status

- [ ] All changes are committed to git

## Reassessment

- [ ] Reassessment verdict is present
- [ ] One of: "Roadmap still valid." or "Roadmap needs update: {reason}"
- [ ] If roadmap needs update, specific changes are described

## Vision Alignment

- [ ] Vision Alignment section is present (or "Skipped — no VISION.md" if none exists)
- [ ] If present: alignment table with each relevant vision detail
- [ ] Adjustments and deviations are documented with reasons
