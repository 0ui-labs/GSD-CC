---
slice: {{SLICE_ID}}
date: {{ISO_DATE}}
status: {{complete|partial|failed}}
---

## Summary

- Status: {{complete|partial|failed}}
- Slice: {{SLICE_ID}} — {{SLICE_NAME}}
- Outcome: {{ONE_SENTENCE_RESULT}}
- Acceptance Criteria: {{PASSED}}/{{TOTAL}} passed, {{PARTIAL}} partial, {{FAILED}} failed
- Boundary Violations: {{none|count}}
- Recommendation: {{ONE_SENTENCE_NEXT_SLICE_RECOMMENDATION}}

## Plan vs. Actual

| Task | Planned | Actual | Status | Notes |
|------|---------|--------|--------|-------|
| T01  | {{PLANNED_DESCRIPTION}} | {{ACTUAL_DESCRIPTION}} | as planned / expanded / partial / skipped | {{BRIEF_EXPLANATION}} |
| T02  | {{PLANNED_DESCRIPTION}} | {{ACTUAL_DESCRIPTION}} | {{STATUS}} | {{BRIEF_EXPLANATION}} |

## Acceptance Criteria

| AC   | Task | Status | Evidence |
|------|------|--------|----------|
| AC-1 | T01  | {{PASS/PARTIAL/FAIL}} | {{TEST_OUTPUT_OR_EVIDENCE}} |
| AC-2 | T01  | {{PASS/PARTIAL/FAIL}} | {{TEST_OUTPUT_OR_EVIDENCE}} |

## Implemented Work

| Area | What shipped | Evidence |
|------|--------------|----------|
| {{AREA}} | {{IMPLEMENTED_WORK}} | {{SUMMARY_OR_TEST_EVIDENCE}} |

## Not Implemented

<!-- Use "None." when all planned work was completed. -->
{{NONE_OR_LIST_OF_MISSING_WORK}}

## Extra Work Added

<!-- Useful unplanned work. This is not a failure unless it violates boundaries
     or approval expectations. Use "None." when there was no extra work. -->
| Area | Extra work | Why | Impact |
|------|------------|-----|--------|
| {{AREA}} | {{EXTRA_WORK}} | {{REASON}} | {{IMPACT}} |

## Deviations

<!-- Any meaningful difference from the plan. Use "None." when there were no
     deviations. -->
| Deviation | Reason | Impact | Follow-up |
|-----------|--------|--------|-----------|
| {{DEVIATION}} | {{REASON}} | {{IMPACT}} | {{FOLLOW_UP_OR_NONE}} |

## Risks Introduced

<!-- Only risks created or revealed during this slice. Do not list generic
     project risks. Use "None." when no new risks were introduced. -->
| Risk | Source | Impact | Mitigation |
|------|--------|--------|------------|
| {{RISK}} | {{SOURCE}} | {{IMPACT}} | {{MITIGATION_OR_NONE}} |

## Tests and Evidence

| Check | Command or Method | Result | Covers |
|-------|-------------------|--------|--------|
| {{CHECK}} | {{COMMAND_OR_METHOD}} | {{PASS/PARTIAL/FAIL}} | {{AC_IDS_OR_AREA}} |

## Decisions Made

<!-- Decisions made during execution that were not in the original plan -->
- {{DECISION_1}} (reason: {{WHY}})
- {{DECISION_2}} (reason: {{WHY}})

## Boundary Violations

<!-- Did any task modify files listed in another task's DO NOT CHANGE? -->
<!-- "None." if all boundaries were respected -->
{{NONE_OR_LIST}}

## Deferred

<!-- Issues discovered during execution, pushed to future slices.
     Use "None." when nothing was deferred. -->
- [ ] {{ISSUE_1}} → {{TARGET_SLICE}}
- [ ] {{ISSUE_2}} → later

## Reassessment

<!-- Does the rest of the roadmap still make sense given what was learned? -->
<!-- One of: "Roadmap still valid." / "Roadmap needs update: {{REASON}}"
     Do not modify the roadmap here; REASSESS owns roadmap changes. -->
{{REASSESSMENT_VERDICT}}

## Vision Alignment

<!-- Skip this section if no VISION.md exists -->

| Vision Detail | What User Wanted | What Was Built | Alignment |
|--------------|-----------------|----------------|-----------|
| {{DETAIL}} | {{USER_WORDS}} | {{WHAT_WE_DID}} | ✓ Aligned / ⚠ Adjusted / ✗ Deviated |

Adjustments:
<!-- {{DETAIL}}: Vision said "{{USER_WORDS}}". Implemented as {{WHAT_WE_DID}} because {{REASON}}. -->

Deviations:
<!-- {{DETAIL}}: Vision said "{{USER_WORDS}}". Could not implement because {{REASON}}. Alternative: {{ALTERNATIVE}}. Recommendation: keep as-is / revisit later. -->

## Recommendation for Next Slice

<!-- Use exactly one of these shapes:
     - Continue as planned with {{NEXT_SLICE}}.
     - Continue, but address: {{SPECIFIC_CONCERN}}.
     - Pause before next slice: {{SPECIFIC_BLOCKER_OR_RISK}}.
-->
{{NEXT_SLICE_RECOMMENDATION}}
