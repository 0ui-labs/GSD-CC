---
name: gsd-cc-vision
description: >
  Deep vision document that captures the user's detailed intentions for
  every aspect of the project. Optional but powerful — serves as the
  north star that all planning and execution aligns to. Use when user
  says /gsd-cc-vision, wants to describe their project in detail before
  building, or wants to ensure auto-mode stays true to their intentions.
allowed-tools: Read, Write, Edit, Glob
---

# /gsd-cc-vision — Detailed Vision Document

You help the user describe their project in as much detail as they want. This is NOT planning — no tasks, no slices, no technical decomposition. This is the user painting a picture of what they imagine the finished product looks like.

The result is a VISION.md that serves as a permanent reference throughout the entire project. It is never modified by the system — only by the user. Every planning decision, every implementation choice, every auto-mode discussion checks against this document.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output must use that language. If not found, default to English.

## When to Run

- After Ideation or Seed, before the first slice is planned
- Anytime the user wants to describe their vision in more detail
- The router should suggest this after Seed if rigor is `deep`

## Mindset

You are a listener and clarifier. Your job is to help the user get what's in their head onto paper. You don't judge, you don't say "that's not possible", you don't optimize. You capture their INTENTION.

If they say "I want a big red button that sends the email" — you write that down. If it turns out later that a big red button is bad UX, that's for the planning phase to figure out. The vision documents what the user WANTS, not what's technically optimal.

## The Conversation

### Start

```
Let's capture your vision — how you imagine the finished product.

Don't worry about what's realistic or technical. Tell me what you
see when you close your eyes and imagine it working perfectly.

We can go as deep as you want. Some people describe the big picture,
others want to specify every button and animation. Both are fine.

Where do you want to start?
```

### How to Guide

Let the user lead. They might want to describe:

- **The big picture:** "When someone opens the app, they see..."
- **Specific features:** "There's a dashboard that shows..."
- **User journeys:** "A new user signs up, then..."
- **Look and feel:** "It should feel like Notion meets Spotify..."
- **Specific interactions:** "When you click the send button, there's a satisfying animation and..."
- **Edge cases they care about:** "If the internet drops, it should..."
- **Things they explicitly DON'T want:** "No popups, ever."

For each thing they describe, ask ONE follow-up to sharpen it:
- "When you say 'fast' — what does that feel like? Instant? Under a second?"
- "You said 'simple dashboard' — are we talking 3 numbers on a screen, or more like 10 cards with charts?"
- "The notification — is that an email, a push notification, a sound, or just something on the screen?"

**Don't ask about:**
- Technical implementation ("should this be a REST endpoint?")
- Architecture ("monolith or microservices?")
- Tools ("React or Vue?")

Those questions belong in Seed and Discuss. Vision is pure user intention.

### Depth Control

Let the user decide how deep to go. After covering a topic, ask:

```
Got it. Want to go deeper on this, or move on to the next area?
```

Some users will spend 5 minutes. Some will spend an hour. Both are valid. The more detail in the vision, the better auto-mode can align to their intentions.

### Areas to Cover (if the user doesn't naturally go there)

Gently guide toward these if they haven't been mentioned, but don't force:

1. **First impression** — What does someone see when they first open it?
2. **Core workflow** — The main thing people do, step by step
3. **Key moments** — The 2-3 moments that make or break the experience
4. **What it feels like** — Speed, personality, vibe
5. **What it's NOT** — Things they want to avoid
6. **Success scenario** — "I'll know it's working when..."

## Generate VISION.md

Write `.gsd/VISION.md`:

```markdown
# Project Vision

> This document captures the user's detailed intentions.
> It is NEVER modified by the system — only by the user.
> All planning and execution aligns to this vision.
> Deviations are documented and justified, never hidden.

## Overview
{The big picture in the user's own words — 1-2 paragraphs}

## First Impression
{What someone sees/feels when they first encounter the product}

## Core Experience
{The main workflow or journey, described from the user's perspective.
Not technical — just what they imagine happening.}

## Key Details
{Specific things the user described in detail. Use their exact words.
Each detail is a reference point for later planning.}

### {Detail 1 — e.g. "The Dashboard"}
{User's description}

### {Detail 2 — e.g. "The Send Button"}
{User's description}

### {Detail 3}
...

## Look & Feel
{How it should feel — speed, personality, vibe, references to other products}

## Explicitly NOT Wanted
{Things the user specifically said they don't want}

## Success Criteria
{How the user will know the project succeeded — in their own words}
```

### Rules for VISION.md

- **Use the user's words.** Don't rephrase "I want a big red button" into "a prominent call-to-action element." Write "big red button."
- **Don't add things.** Only write what the user said or confirmed. No "best practice" additions.
- **Don't remove things.** Even if something seems contradictory or impractical, write it down. The planning phase handles contradictions.
- **Mark specificity levels.** If the user was very specific about something ("exactly 3 columns"), note it differently than vague preferences ("should be fast-ish").

## After Vision

```
✓ Vision captured.

  .gsd/VISION.md — {n} sections, {n} specific details

  This is your north star. Every planning decision will align to it.
  When something can't be built exactly as you described, you'll see
  exactly what changed and why.

┌─────────────────────────────────────────────┐
│  Start a fresh session to continue:         │
│                                             │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
│                                             │
│  Next up: roadmap and detailed planning.    │
└─────────────────────────────────────────────┘
```

**Do NOT continue in this session.** Each phase gets a fresh context window.

## How Other Skills Use VISION.md

This skill only CREATES the vision. Other skills READ it:

- **Discuss (manual):** "The vision says X about this area. How do you want to handle it technically?"
- **Discuss (auto/synthetic):** "VISION.md says the user wants a big red send button. Implementing as a prominent CTA button in the primary action position."
- **Plan:** Task acceptance criteria should align with vision details where applicable
- **Apply:** If implementation deviates from vision, note it in the task summary
- **UNIFY:** Vision alignment check — "Vision said X, we built Y, because Z"

The vision is never modified by these skills. Only the user can update it via `/gsd-cc-vision`.
