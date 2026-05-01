# Quality Gate: UNIFY Complete

Check ALL items before allowing the next slice to start. If any item fails, complete the UNIFY first.

## Summary

- [ ] Summary section is present
- [ ] Summary includes status, slice, outcome, AC counts, boundary status, and recommendation
- [ ] Summary matches the detailed sections below

## Plan vs. Actual

- [ ] Plan vs. Actual table is present
- [ ] Every task from the plan is listed (none missing)
- [ ] Each planned task has a status: as planned / expanded / partial / skipped
- [ ] If a task was expanded or skipped, there is a brief explanation
- [ ] If a task is partial, the missing work is named

## Acceptance Criteria

- [ ] AC status table is present
- [ ] Every AC from the plan is listed with Pass / Partial / Fail
- [ ] Each AC has an evidence column (test output, manual check, etc.)
- [ ] No AC is left without a status

## Work Classification

- [ ] Implemented Work section is present
- [ ] Not Implemented section is present
- [ ] Extra Work Added section is present
- [ ] Deviations section is present
- [ ] Risks Introduced section is present
- [ ] Not Implemented says "None." or lists specific missing planned work
- [ ] Extra Work Added says "None." or lists actionable unplanned work
- [ ] Deviations says "None." or lists meaningful plan differences
- [ ] Risks Introduced says "None." or lists only risks created or revealed during this slice

## Tests and Evidence

- [ ] Tests and Evidence section is present
- [ ] Verification is summarized separately from the AC table
- [ ] Each check names a command or method, result, and covered ACs or area

## Decisions

- [ ] Decisions section is present (can be "No additional decisions made.")
- [ ] Each decision made during execution is listed with rationale
- [ ] Decisions are appended to .gsd/DECISIONS.md

## Boundary Violations

- [ ] Boundary violations section is present
- [ ] "None." if all boundaries were respected
- [ ] If violations occurred: which file, which task, why

## Deferred Issues

- [ ] Deferred section is present
- [ ] Deferred says "None." or lists actionable deferred issues
- [ ] Each deferred issue names a target slice or "later"
- [ ] Deferred items are specific, not vague

## Commit Status

- [ ] All changes are committed to git

## Reassessment

- [ ] Reassessment verdict is present
- [ ] One of: "Roadmap still valid." or "Roadmap needs update: {reason}"
- [ ] If roadmap needs update, specific changes are described
- [ ] UNIFY does not modify roadmap files; REASSESS owns roadmap changes

## Vision Alignment

- [ ] Vision Alignment section is present (or "Skipped — no VISION.md" if none exists)
- [ ] If present: alignment table with each relevant vision detail
- [ ] Adjustments and deviations are documented with reasons

## Recommendation for Next Slice

- [ ] Recommendation for Next Slice section is present
- [ ] Recommendation uses one allowed shape:
  - Continue as planned with {slice}.
  - Continue, but address: {specific concern}.
  - Pause before next slice: {specific blocker/risk}.
- [ ] Recommendation is advisory and does not directly mutate the roadmap
