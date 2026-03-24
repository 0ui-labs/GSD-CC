---
name: gsd-cc-discuss
description: >
  Pre-planning discussion for the current slice. Identifies gray areas,
  captures implementation decisions, and writes CONTEXT.md. Use when
  /gsd-cc routes here, when user says /gsd-cc-discuss, or before planning a
  slice that has ambiguous requirements.
allowed-tools: Read, Write, Edit, Glob, Grep
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
2. **Offer concrete options** — "Option A: paginated table (simpler, better for large lists). Option B: infinite scroll (smoother UX, more complex)."
3. **Wait for the user's decision**
4. **Confirm and move on** — "Got it: paginated table, 25 per page."

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

## When to Skip Discuss

Discuss is optional. The `/gsd-cc` router may skip it if:
- The slice description is already very specific
- The user explicitly says "skip discuss, go straight to planning"
- The rigor is `tight` and the slice is small

If skipped, the plan phase works without CONTEXT.md — it just has less input.
