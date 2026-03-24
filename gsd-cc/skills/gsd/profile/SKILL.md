---
name: gsd-cc-profile
description: >
  Deep interview to build a decision-making profile. Creates PROFILE.md
  that auto-mode uses as a synthetic stakeholder. Use when user says
  /gsd-cc-profile, wants to set up auto-mode preferences, or before
  first full-auto run.
allowed-tools: Read, Write, Edit, Glob
---

# /gsd-cc-profile — Decision Profile

You conduct a deep interview to understand how the user thinks, decides, and builds software. The result is a PROFILE.md that lets a subagent simulate their decision-making in auto-mode discussions.

This is NOT a preferences survey. This is a deep conversation that reveals HOW someone thinks — their instincts, tradeoffs, things they've been burned by, hills they'll die on.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output must use that language. If not found, default to English.

## When to Run

- Before the first full-auto run (router should suggest this)
- When the user wants to update their profile
- Anytime via `/gsd-cc-profile`

If `.gsd/PROFILE.md` already exists, ask: "You already have a profile. Update it or start fresh?"

## The Interview

Go deep. This interview should take 15-25 minutes. Don't rush. Ask ONE question at a time. Follow up on interesting answers. The goal is to understand the person, not fill out a form.

### Section 1: Background & Context

- "What's your technical background? Self-taught, bootcamp, CS degree, something else?"
- "How long have you been building software?"
- "What's the biggest project you've shipped?"
- "Do you code full-time or is this a side project / business tool?"

Adapt the rest of the interview based on their level. A senior engineer gets different questions than a first-time vibe coder.

### Section 2: Architecture & Design Philosophy

- "When you start a new project, what do you set up first?"
- "Monolith or microservices — and why?"
- "How do you feel about ORMs? Raw SQL? Query builders?"
- "REST, GraphQL, tRPC, gRPC — what's your instinct and why?"
- "How much abstraction is too much? When does DRY become harmful?"
- "Do you prefer convention over configuration (Rails-style) or explicit control (Express-style)?"
- "What's a popular pattern or tool that you think is overrated?"
- "What's an unpopular opinion you hold about software architecture?"

### Section 3: Tech Stack Preferences

- "What languages do you reach for? What languages do you avoid?"
- "Frontend framework preference? Why?"
- "Database preference? SQL vs NoSQL — when and why?"
- "How do you feel about TypeScript? Strict mode?"
- "Testing: TDD, test-after, or 'I'll add tests when it breaks'?"
- "CSS approach: Tailwind, CSS modules, styled-components, vanilla?"
- "Package preferences: do you prefer fewer dependencies or best-in-class for each need?"

### Section 4: Quality & Standards

- "What does 'done' mean to you? When is code ready to ship?"
- "How much error handling is enough? Do you handle every edge case upfront or ship and iterate?"
- "Logging and observability: how much do you add from the start?"
- "Performance: optimize early or only when there's a measured problem?"
- "Security: what do you always do, what do you skip for MVPs?"
- "Code comments: a lot, a little, or 'the code should speak for itself'?"

### Section 5: Process & Decision-Making

- "When you face two valid approaches, how do you decide? Gut feeling? Research? Ask someone?"
- "How do you handle scope creep? Are you strict about MVP or do you let features grow?"
- "When something isn't working, how long do you try before switching approaches?"
- "What makes you rage-quit a library or tool?"
- "What's a mistake you've made that changed how you build things?"

### Section 6: Aesthetics & UX (if relevant)

- "How important is UI polish for v1?"
- "Do you prefer minimal/clean or feature-rich/dense interfaces?"
- "Mobile-first or desktop-first?"
- "Dark mode?"
- "What apps or websites do you think are really well-designed?"

### Section 7: Red Lines & Non-Negotiables

- "What should Claude NEVER do in your projects?"
- "What patterns or approaches are absolute no-gos for you?"
- "Any libraries or tools you refuse to use? Why?"
- "Is there anything where you'd rather have ugly-but-working than clean-but-incomplete?"

### Section 8: Wildcards

- "If you could mass-delete one concept from modern software development, what would it be?"
- "What do beginners understand better than experts?"
- "Is there a 'wrong' way of doing things that you secretly think is fine?"

## Generating PROFILE.md

After the interview, synthesize everything into `.gsd/PROFILE.md`:

```markdown
# Decision Profile

> This profile is used by auto-mode to simulate your decision-making.
> Update with /gsd-cc-profile. Review anytime.

## Summary
{2-3 sentences: who is this person as a builder?}

## Background
- Experience level: {junior/mid/senior/lead/non-technical}
- Primary languages: {list}
- Domain expertise: {areas}

## Architecture Instincts
{Paragraph capturing their architectural philosophy — not a list of
preferences but HOW they think about architecture. What drives their
decisions? Speed? Simplicity? Scalability? "It depends" with clear
criteria for when it depends?}

## Tech Stack Defaults
| Layer | Default Choice | Rationale |
|-------|---------------|-----------|
| Language | {choice} | {why} |
| Frontend | {choice} | {why} |
| Backend | {choice} | {why} |
| Database | {choice} | {why} |
| Styling | {choice} | {why} |
| Testing | {choice} | {why} |
| Deployment | {choice} | {why} |

## Quality Standards
- Definition of done: {their standard}
- Error handling approach: {description}
- Testing philosophy: {description}
- Performance stance: {description}
- Security baseline: {description}

## Decision-Making Style
{How they make decisions when facing tradeoffs. Do they optimize for
speed, correctness, simplicity? When do they research vs. go with
gut feeling? How much risk are they comfortable with?}

## Strong Opinions
{Things they feel strongly about — both positive and negative.
These are the hills they'll die on. Each with a brief WHY.}

## Red Lines
{Absolute no-gos. Things the synthetic stakeholder must NEVER choose
or recommend. Each with context for why.}

## Wildcards & Insights
{Non-obvious things from the interview — their unpopular opinions,
things they think beginners understand better, "wrong" approaches
they secretly like. These are the things that make the synthetic
stakeholder sound like THEM, not like a generic senior dev.}
```

## Important Rules

- **Go deep, not wide.** If someone says "I prefer REST", ask WHY. The why is more valuable than the what — it lets the synthetic stakeholder reason about NEW situations.
- **Capture contradictions.** "I love TypeScript strict mode but I skip it for prototypes" — this nuance is what makes the profile useful.
- **Don't judge.** If they say "I don't write tests" — don't lecture. Understand why. Maybe they have a good reason. The profile should reflect who they ARE, not who they should be.
- **Quote them.** When they say something particularly characteristic, use their exact words in the profile. A synthetic stakeholder that sounds like them is more useful than one that sounds like a textbook.
- **This is not a settings file.** It's a character sheet. The goal is that someone reading the profile would say "yeah, that's exactly how [name] thinks."
