---
slice: {{SLICE_ID}}
date: {{ISO_DATE}}
status: {{complete|partial|failed}}
---

## Plan vs. Actual

| Task | Planned | Actual | Status |
|------|---------|--------|--------|
| T01  | {{PLANNED_DESCRIPTION}} | {{ACTUAL_DESCRIPTION}} | {{STATUS_EMOJI}} as planned / expanded / partial / skipped |
| T02  | {{PLANNED_DESCRIPTION}} | {{ACTUAL_DESCRIPTION}} | {{STATUS_EMOJI}} |

## Acceptance Criteria

| AC   | Task | Status | Evidence |
|------|------|--------|----------|
| AC-1 | T01  | {{PASS/PARTIAL/FAIL}} | {{TEST_OUTPUT_OR_EVIDENCE}} |
| AC-2 | T01  | {{PASS/PARTIAL/FAIL}} | {{TEST_OUTPUT_OR_EVIDENCE}} |

## Decisions Made

<!-- Decisions made during execution that were not in the original plan -->
- {{DECISION_1}} (reason: {{WHY}})
- {{DECISION_2}} (reason: {{WHY}})

## Boundary Violations

<!-- Did any task modify files listed in another task's DO NOT CHANGE? -->
<!-- "None." if all boundaries were respected -->
{{NONE_OR_LIST}}

## Deferred

<!-- Issues discovered during execution, pushed to future slices -->
- [ ] {{ISSUE_1}} → {{TARGET_SLICE}}
- [ ] {{ISSUE_2}} → later

## Reassessment

<!-- Does the rest of the roadmap still make sense given what was learned? -->
<!-- One of: "Roadmap still valid." / "Roadmap needs update: {{REASON}}" -->
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
