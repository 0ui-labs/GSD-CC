---
name: gsd-cc-ingest
description: >
  Import an existing concept document, spec, or brief into GSD-CC.
  Analyzes the document, identifies gaps, asks targeted follow-ups,
  and generates standardized project artifacts. Use when user says
  /gsd-cc-ingest, pastes a concept, or uploads a document.
allowed-tools: Read, Write, Edit, Glob, Bash
---

# /gsd-cc-ingest — Import External Concept

You take an existing document — any format, any quality — and turn it into clean GSD-CC project artifacts. The user may have a polished spec, a rambling Google Doc, a Notion page dump, a PDF, a chat history, or just a wall of text pasted into the chat.

Your job: understand it, verify your understanding, fill the gaps, and produce standardized output.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output must use that language. If not found, default to English.

## Step 1: Receive the Input

The input can come in many forms:

- **Pasted text** — the user copies their concept into the chat
- **File path** — "here's my concept: /path/to/concept.md"
- **Multiple files** — "look at these files: /docs/spec.md, /docs/wireframes.md"
- **URL content** — the user might paste content from a web page

Read whatever they provide. If it's a file path, use `Read`. If it's multiple files, read all of them.

Say:
```
Got it. Let me read through this carefully.
```

## Step 2: Playback — "Here's What I Understood"

Read the entire document. Then explain IN YOUR OWN WORDS what you understood — as a coherent narrative, not a bullet list. This is like telling a friend what the project is about after reading the spec.

```
OK, I've read through everything. Let me tell you what I understood —
correct me wherever I'm wrong.
```

Then explain in your own words, structured into clear sections:

```
THE PROBLEM
{What pain point or need does this address? Why does this project
exist? What's the current situation that's not good enough?}

THE SOLUTION
{What are we building? One paragraph, plain language, no jargon.}

WHO IT'S FOR
{Who uses this? What's their situation? What do they care about?}

HOW IT WORKS
{The core workflow or experience — what happens step by step when
someone uses it? Walk through the main journey.}

HOW IT LOOKS & FEELS
{Design direction, vibe, personality — if the document mentions this.
Skip if the document is purely technical.}

WHAT MAKES IT DIFFERENT
{Why not use an existing solution? What's the unique angle?
Skip if not apparent from the document.}

Did I get that right, or did I misunderstand something?
```

**This is the most important step.** Write it like you're explaining the project to someone new. Use simple language. Don't parrot the document back — rephrase it to show you actually understood the intent. Not every section needs to be long — if the document doesn't cover "how it looks", write one sentence or skip it. But the structure helps the user quickly spot where you got it wrong.

**Wait for the user's response.** They might say:
- "Yes, exactly!" → proceed to Step 3
- "Almost, but X is wrong..." → correct your understanding, rephrase the relevant part, confirm again
- "No, that's not what I meant at all..." → ask what they actually mean, update your understanding, try the playback again

Do NOT proceed until the user confirms you understood correctly. Iterate as many times as needed.

## Step 3: Analysis — Clear, Vague, Contradictions

Once the user confirms your understanding, show the structured analysis:

```
Great. Here's what's clearly defined, what's still vague, and where
I found contradictions:

CLEAR:
  ✓ {Area 1} — {brief summary}
  ✓ {Area 2} — {brief summary}
  ...

VAGUE OR MISSING:
  ? {Area 1} — {what's unclear}
  ? {Area 2} — {what's missing}
  ...

CONTRADICTIONS (if any):
  ⚠ {Description — "Section 2 says X but section 5 says Y"}
  ...

I'd like to go through the unclear points with you one by one.
Ready?
```

Wait for confirmation.

## Step 4: Guided Gap-Filling

Go through each vague/missing point ONE AT A TIME. Never ask multiple questions at once.

```
Let's start with the first open point.

{Topic}: {What's unclear, in plain language}
{Why it matters — one sentence explaining why this affects the project}

{ONE question}
```

Wait for the answer. Then move to the next point:

```
Got it. Next one:

{Topic}: ...
```

Adapt your questions to the user's level (same as /gsd-cc-profile — read the room from how the document is written).

**For a technical spec:**
- "Your spec covers the API endpoints but doesn't mention authentication. What's the plan?"

**For a non-technical brief:**
- "You described what the dashboard shows, but what happens when someone clicks a number?"

**For a vague concept:**
- "You mention 'user management' — what does that mean to you? Just login/signup, or more?"

If the user says "I don't know" or "you decide" — note it as an open question for later phases. Don't push.

After resolving contradictions and filling gaps, summarize what changed:

```
OK, here's what we clarified:
  • {Point 1}: {decision}
  • {Point 2}: {decision}
  • {Point 3}: left open for later

{Remaining open points} will be addressed during planning.
```

## Step 4: Assess Coverage

After filling gaps, check which GSD-CC artifacts you have enough information for:

| Artifact | Can generate? | Why / why not |
|----------|--------------|---------------|
| PLANNING.md | Yes/Partial/No | {explanation} |
| VISION.md | Yes/Partial/No | {explanation} |
| PROJECT.md | Yes/No | {explanation} |
| type.json | Yes/No | {explanation} |

Tell the user:
```
Based on your document and our conversation, I can generate:
  ✓ PLANNING.md — full project brief
  ✓ PROJECT.md — elevator pitch
  ✓ type.json — {type} / {rigor}
  ◐ VISION.md — partial (you described the core experience in detail
                but not the look & feel — want to add that now or later?)

Generate these now?
```

## Step 5: Generate Artifacts

On confirmation, create the `.gsd/` directory and write:

### `.gsd/PLANNING.md`
Same format as Seed output. Map the document's content to the standard sections:
- Vision (from the document's intro/summary)
- Users (from any user descriptions, personas, or target audience sections)
- Requirements v1, v2, Out of Scope (from feature lists, must-haves, nice-to-haves)
- Tech Stack (from any technical decisions in the document, or leave for Seed to fill)
- Architecture Decisions (from any technical choices mentioned)
- Open Questions (from remaining gaps)

**Source everything.** For each section, note where in the original document the information came from. This lets the user verify the mapping.

### `.gsd/VISION.md` (if enough detail)
Only generate this if the document contains detailed descriptions of how things should look, feel, or work from the user's perspective. If it's a dry technical spec, skip VISION.md — the user can create it later with `/gsd-cc-vision`.

### `.gsd/PROJECT.md`
3-5 sentence elevator pitch, distilled from the document.

### `.gsd/type.json`
Detect project type and rigor from the document content, same logic as Seed.

### `.gsd/STATE.md`
Initialize with phase: seed-complete (since we're replacing the Seed step).

### `.gsd/DECISIONS.md`
Log any decisions that were already made in the original document:
```markdown
# Decisions

## From Original Concept
- {Decision from document} (source: original concept, section X)
- {Decision from document} (source: original concept, section Y)

## From Ingest Conversation
- {Decision from gap-filling conversation} (reason: {rationale})
```

### `.gsd/INGEST-SOURCE.md`
Keep a reference to what was ingested:
```markdown
# Ingest Source

Ingested on: {date}
Source: {file path(s) or "pasted text"}
Original length: ~{word count} words
Gaps identified: {count}
Gaps resolved: {count}
Gaps remaining: {count — these are in PLANNING.md Open Questions}
```

## Step 6: What's Still Missing?

After generating artifacts, honestly assess what wasn't in the document and wasn't covered in the conversation:

```
✓ Artifacts generated.

Still open — you might want to address these later:
  • {Open question 1} — consider /gsd-cc-discuss during planning
  • {Open question 2} — could be covered in /gsd-cc-vision
  ...

These are also listed in PLANNING.md under "Open Questions".
```

## Step 7: Hand Off

```
✓ Ingest complete.

  .gsd/PLANNING.md       — project brief (from your document)
  .gsd/PROJECT.md        — elevator pitch
  .gsd/type.json         — {type} / {rigor}
  .gsd/STATE.md          — initialized
  .gsd/DECISIONS.md      — {n} decisions from your document
  .gsd/INGEST-SOURCE.md  — reference to source
  {.gsd/VISION.md        — if generated}

┌─────────────────────────────────────────────┐
│  Start a fresh session to continue:         │
│                                             │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
│                                             │
│  Next: roadmap creation.                    │
│  Optional: /gsd-cc-vision for more detail   │
└─────────────────────────────────────────────┘
```

**Do NOT continue in this session.** The ingested document may have consumed significant context.

## Rules

- **Don't assume.** If the document says "user management" without detail, ask. Don't invent features.
- **Respect the document.** The user spent time writing it. Don't dismiss parts of it. If something seems wrong, ask — don't silently fix it.
- **Preserve specificity.** If the document says "response time under 200ms", put exactly that in the requirements. Don't generalize to "should be fast."
- **Flag contradictions, don't resolve them.** "Your document says X in section 2 but Y in section 5. Which one is correct?" Don't pick one silently.
- **Don't over-generate.** If the document is a rough idea on half a page, don't generate a 10-page PLANNING.md full of assumptions. Generate what you have, mark the rest as Open Questions.
