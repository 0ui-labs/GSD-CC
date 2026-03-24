---
name: gsd-cc-discuss
description: >
  Pre-planning discussion for the current slice. Identifies gray areas,
  captures implementation decisions, and writes CONTEXT.md. Use when
  /gsd-cc routes here, when user says /gsd-cc-discuss, or before planning a
  slice that has ambiguous requirements.
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# /gsd-cc-discuss — Implementation Decisions

You help the user resolve ambiguities BEFORE planning begins. Your job is to identify gray areas in the current slice and turn them into concrete decisions.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output — messages, questions, decision records — must use that language. If not found, default to English.

## Step 1: Load Context

1. Read `.gsd/STATE.md` — get `current_slice` and `milestone`
2. Read `.gsd/M001-ROADMAP.md` (or current milestone's roadmap) — find the description of the current slice
3. Read `.gsd/PLANNING.md` — for overall project context
4. Read `.gsd/DECISIONS.md` — for decisions already made
5. Read `.gsd/type.json` — for project type and rigor
6. Read `.gsd/VISION.md` — if it exists, this is the user's detailed intention for every aspect of the project. Use it to inform your questions and to check if a gray area is already answered by the vision. If the vision says "big red send button", don't ask "how should the send button look?" — it's already decided.

## Step 2: Identify Gray Areas

Analyze the slice description and identify areas where implementation details are unclear. Look for these categories:

### Visual / UI Decisions
- Layout: grid vs. list, density, spacing
- Interactions: modals vs. inline, drag-and-drop, animations
- Responsive behavior: breakpoints, mobile-first or desktop-first
- Empty states, loading states, error states

### API / Data Decisions
- Response format: shape of JSON, pagination strategy
- Error handling: error codes, error messages, retry behavior
- Verbosity: minimal vs. detailed responses
- Versioning: URL path vs. header

### Data Model Decisions
- Schema details: field types, constraints, defaults
- Validation rules: required fields, formats, ranges
- Migration strategy: how to evolve the schema
- Relationships: cascade behavior, soft deletes

### Architecture Decisions
- Where does this logic live: frontend, backend, shared?
- Third-party vs. custom: build or integrate?
- Performance: caching strategy, lazy loading, pagination
- State management: where does state live, how does it flow?

Not every category applies to every slice. Focus on what's relevant.

## Step 3: Ask About Each Gray Area

For each gray area you identify:

1. **State the ambiguity clearly** — "The slice says 'user list' but doesn't specify: paginated table or infinite scroll? How many users are expected?"
2. **Use AskUserQuestion to present concrete options** — Build the options dynamically based on the gray area. Example:
   ```
   Question: "User list: how should it handle large datasets?"
   Header: "UI"
   Options:
     - label: "Paginated table (Recommended)"
       description: "Simpler, better for large lists. Classic table with page controls."
     - label: "Infinite scroll"
       description: "Smoother UX, more complex to implement. Loads more items as user scrolls."
   ```
   Always put your recommendation first with "(Recommended)" in the label.
3. **Confirm and move on** — "Got it: paginated table, 25 per page."

**Rules:**
- One gray area at a time. Don't dump all questions at once.
- Always offer options. Don't ask open-ended "what do you want?" questions.
- If the user says "you decide" or "whatever's simpler" — make the call, state it clearly, and move on.
- If rigor is `tight`: be brief, 2-3 gray areas max, don't linger.
- If rigor is `deep`: be thorough, cover all relevant categories.
- If rigor is `standard` or `creative`: balanced, 3-5 gray areas.

## Step 4: Write CONTEXT.md

After all gray areas are resolved, write:

### `.gsd/{SLICE_ID}-CONTEXT.md`

Example filename: `.gsd/S01-CONTEXT.md`

```markdown
# S01 — Context & Decisions

## Slice
{Slice name and description from roadmap}

## Decisions

### {Gray Area 1 Title}
**Question:** {What was ambiguous}
**Decision:** {What was decided}
**Rationale:** {Why — user's reasoning or default choice}

### {Gray Area 2 Title}
**Question:** {What was ambiguous}
**Decision:** {What was decided}
**Rationale:** {Why}

...

## Constraints
{Any constraints that emerged — performance targets, compatibility requirements, etc.}

## Notes
{Anything else relevant for planning — edge cases mentioned, preferences stated, etc.}
```

## Step 5: Update DECISIONS.md

Append each decision to `.gsd/DECISIONS.md` under a new section for this slice:

```markdown
## S{nn} — {Slice Name}

- {Decision 1} (reason: {rationale})
- {Decision 2} (reason: {rationale})
...
```

Use `Edit` to append — never overwrite existing content in DECISIONS.md.

## Step 6: Update STATE.md

Update the `phase` field in `.gsd/STATE.md`:

```
phase: discuss-complete
```

## Step 7: Confirm and End Session

```
✓ Discussion complete for S{nn}. {n} decisions captured.

  .gsd/S{nn}-CONTEXT.md   — {n} decisions documented
  .gsd/DECISIONS.md        — updated

┌─────────────────────────────────────────────┐
│  Start a fresh session for planning:        │
│                                             │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
│                                             │
│  I'll plan this slice using your decisions. │
└─────────────────────────────────────────────┘
```

**Do NOT continue in this session.** Each phase gets a fresh context window.

## Auto-Discuss Mode (Synthetic Stakeholder)

When running in full-auto mode (`auto_mode_scope: milestone`), Discuss is NOT skipped. Instead, it runs as an internal dialogue using the user's decision profile.

### How it works

1. Read `.gsd/PROFILE.md` — this is the user's decision-making profile (if it exists)
2. For each gray area, simulate a real discussion between two roles:
   - **Planner:** Analyzes the technical options. Brings expertise about what works best for THIS project. Considers tradeoffs, risks, maintainability, project requirements.
   - **Stakeholder:** Represents the user's perspective. Influenced by PROFILE.md but not controlled by it. The profile is a **nudge, not a mandate** — it shapes preferences but doesn't override what's technically best for this project.
3. The discussion should feel like a real debate, not a rubber stamp:
   - Planner proposes with reasoning
   - Stakeholder reacts based on profile + common sense
   - If they disagree, they work it out with arguments
   - The final decision considers BOTH technical merit AND user preferences
4. Write the results to `.gsd/S{nn}-DISCUSS-AUTO.md` with full transparency:

```markdown
# S{nn} Auto-Discuss

> These decisions were made by auto-mode.
> The user's profile influenced but did not dictate decisions.
> Review after UNIFY. Update your profile with /gsd-cc-profile if needed.

## Decision 1: {topic}
**Question:** {what was ambiguous}
**Planner says:** {technical analysis — options, tradeoffs, recommendation}
**Stakeholder says:** {reaction based on profile + common sense}
**Profile influence:** {how the profile shaped this — or "N/A" if profile didn't cover this}
**Final decision:** {what was decided and why}
**Confidence:** {high|medium|low}

## Decision 2: {topic}
...
```

### Confidence levels

- **High:** Clear technical winner that also aligns with the profile
- **Medium:** Multiple valid options — profile tipped the balance, or technical choice overrode a mild preference with good reason
- **Low:** Unclear technically AND the profile doesn't help — the decision is a best guess. Mark for user review.

### How the Profile Influences (NOT Controls)

The profile is one input among several. The weight depends on the type of decision:

- **Taste decisions** (UI style, naming conventions, code style) → profile weighs heavily. There's no "right answer", so the user's preference matters most.
- **Technical decisions** (database choice, API design, auth strategy) → profile is a tiebreaker. If two options are technically equal, pick the one the user would prefer. But don't pick a bad option just because the profile likes it.
- **Red lines** → always respected. If the profile says "NEVER use X", don't use X. Period. But explain the cost if it matters.

### Rules for Auto-Discuss

- **The Planner thinks independently.** Don't just ask "what would the user want?" — first figure out what's technically best, THEN check if the profile agrees.
- **Disagreements are good.** If the planner thinks X is better but the profile nudges toward Y, document the tension. Don't hide it.
- **Use the user's language** when representing their perspective. If they said "I hate ORMs", the stakeholder says "no ORM" — not "consider avoiding object-relational mapping."
- **Be honest about uncertainty.** If neither technical analysis nor the profile gives a clear answer, say so.

### If no PROFILE.md exists

If auto-mode runs without a profile, warn in the auto-discuss output:

```
⚠ No decision profile found. Decisions are based on general best practices.
  Run /gsd-cc-profile to create your profile for better auto-mode decisions.
```

## When to Skip Discuss

In MANUAL mode, Discuss is optional. The `/gsd-cc` router may skip it if:
- The slice description is already very specific
- The user explicitly says "skip discuss, go straight to planning"
- The rigor is `tight` and the slice is small

In FULL AUTO mode, Discuss is NEVER skipped — it runs as Auto-Discuss.
