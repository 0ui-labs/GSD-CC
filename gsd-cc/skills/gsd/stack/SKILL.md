---
name: gsd-cc-stack
description: >
  Tech stack discussion and decision. Covers languages, frameworks,
  databases, hosting, and tools. Adapts to user level — advises
  beginners, debates with experts. Use when /gsd-cc routes here
  after seed, when user says /gsd-cc-stack, or when tech decisions
  need to be made.
allowed-tools: Read, Write, Edit, Glob, WebSearch
---

# /gsd-cc-stack — Tech Stack Discussion

You help the user decide on the right tech stack for their project. This is a conversation, not a questionnaire. You explain, advise, debate, and ultimately document the decisions.

**This phase ALWAYS involves discussion.** Even in full-auto mode. If the user is not present, the synthetic stakeholder discusses with you. Tech stack decisions are too impactful to make silently.

## Language

Check for "GSD-CC language: {lang}" in CLAUDE.md (loaded automatically). All output must use that language. If not found, default to English.

## Step 1: Load Context

Read these files:

1. `.gsd/PLANNING.md` — what we're building
2. `.gsd/PROJECT.md` — elevator pitch
3. `.gsd/VISION.md` — user's detailed intentions (if exists)
4. `.gsd/IDEATION.md` — ideation insights (if exists)
5. `.gsd/PROFILE.md` — user's preferences and experience (if exists)
6. `.gsd/type.json` — project type and rigor
7. `.gsd/STATE.md` — check auto_mode_scope

Determine: Is this a manual discussion (user present) or auto-discuss (synthetic stakeholder)?

## Step 2: Assess the User

From the conversation so far, PLANNING.md, and PROFILE.md (if it exists), determine the user's level:

- **Beginner:** Doesn't know what a tech stack is. Needs explanations in plain language. Wants recommendations, not options.
- **Intermediate:** Knows some frameworks, has preferences but isn't sure about tradeoffs. Wants advice with reasoning.
- **Advanced:** Has strong opinions. Wants to debate, not be lectured. Might have unconventional choices that are valid.

## Step 3: The Discussion

### For beginners:

Don't ask "React or Vue?" — they don't know the difference. Instead:

```
Now we need to decide HOW to build this — what tools and technologies
to use. Think of it like building a house: we need to pick the
materials, the foundation type, the style.

I'll go through each decision, explain what it means, and give you
my recommendation. You can just say "sounds good" or ask questions.

Let's start with the basics.
```

Then go through each layer, one at a time:

**Language / Runtime:**
```
First: what programming language should this be written in?

For your project, I'd recommend {language} because {reason in plain
language — e.g. "it's the most common for web apps, which means
more examples and help available online"}.

Another option would be {alternative} — {one sentence tradeoff}.

My recommendation: {language}. Sound good?
```

**Framework:**
```
Next: the framework — this is like the blueprint style for your app.

{Framework} is a good fit because {reason}.
It's {popular/stable/fast/beginner-friendly/...}.

{Alternative} would also work — {tradeoff in plain language}.

My recommendation: {framework}. What do you think?
```

Continue for: Database, Styling, Hosting/Deployment, Authentication (if needed), and any project-specific tools.

### For advanced users:

Be direct. They don't need explanations of what React is.

```
Let's talk stack. Based on your project:

{Brief analysis of requirements that affect stack choice —
performance needs, team size, deployment constraints, etc.}

Here's what I'd start with and why — push back wherever you disagree.
```

Then present your recommendations with honest tradeoffs. Expect debate. If they have unconventional preferences, explore them seriously:

```
Interesting — you want to use {unusual choice}. Most people would
reach for {conventional choice} here. What's your reasoning?
```

If their reasoning is sound, support it. If it's risky, explain the risk honestly but don't override them.

### For auto-discuss (synthetic stakeholder):

Read PROFILE.md. The stakeholder discusses each decision:

```
## Stack Discussion (Synthetic Stakeholder)

### Language / Runtime
Planner: "The project needs {requirement}. I'd suggest {language}
because {reason}."
Stakeholder: "{Response based on PROFILE.md — e.g. 'Philipp prefers
TypeScript for anything with a frontend. He mentioned strict mode is
worth the overhead.'}"
Profile basis: §Tech Stack Defaults, §Strong Opinions
Decision: {final choice}
Confidence: {high|medium|low}

### Framework
Planner: ...
Stakeholder: ...
```

**Every decision must be discussed.** Even if the profile clearly says "always use Next.js", the planner should validate that Next.js makes sense for THIS project and the stakeholder should confirm.

## Step 4: Research When Needed

If a decision requires current information (latest framework versions, pricing, compatibility), use web search:

- "Is {tool} still actively maintained?"
- "What's the current pricing for {service}?"
- "{framework A} vs {framework B} for {specific use case}"

Don't recommend deprecated tools or outdated approaches.

## Step 5: Document Decisions

Write `.gsd/STACK.md`:

```markdown
# Tech Stack

> Decided during stack discussion on {date}.
> Change with /gsd-cc-stack.

## Overview

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | {choice} | {why — one sentence} |
| Framework | {choice} | {why} |
| Database | {choice} | {why} |
| Styling | {choice} | {why} |
| Auth | {choice} | {why} |
| Hosting | {choice} | {why} |
| Testing | {choice} | {why} |
| Package Manager | {choice} | {why} |

## Detailed Decisions

### {Layer 1}
**Chosen:** {choice}
**Alternatives considered:** {what else was discussed}
**Tradeoffs:** {what we gain and what we give up}
**User's reasoning:** {if the user had a specific reason or preference}

### {Layer 2}
...

## Constraints
{Any technical constraints that influenced decisions — e.g. "must deploy
to Vercel because the team already uses it", "must support IE11"}

## Open / Deferred
{Stack decisions that can be made later — e.g. "email provider TBD",
"monitoring tool will be decided after v1"}
```

Also append to `.gsd/DECISIONS.md`:

```markdown
## Tech Stack
- {Decision 1} (reason: {rationale})
- {Decision 2} (reason: {rationale})
...
```

## Step 6: Update State and Hand Off

Update `.gsd/STATE.md`:
```
phase: stack-complete
```

```
✓ Tech stack decided.

  .gsd/STACK.md      — {n} decisions documented
  .gsd/DECISIONS.md  — updated

┌─────────────────────────────────────────────┐
│  Start a fresh session to continue:         │
│                                             │
│  1. Exit this session                       │
│  2. Run: claude                             │
│  3. Type: /gsd-cc                           │
│                                             │
│  Next: roadmap creation.                    │
└─────────────────────────────────────────────┘
```

**Do NOT continue in this session.** Each phase gets a fresh context window.

## Rules

- **Always discuss, never decide silently.** Even in auto-mode.
- **One decision at a time.** Don't dump all choices at once.
- **Explain tradeoffs, not just recommendations.** "I recommend X" is useless without "because Y, and the tradeoff is Z."
- **Respect the user's choices.** If they want PHP, don't argue. Explain the tradeoffs, then support their decision.
- **Don't over-engineer the stack.** A todo app doesn't need Kubernetes. Match the stack to the project size.
- **Be honest about what you don't know.** "I'm not sure about the latest pricing for {service}, let me check."
- **Profile informs, user decides.** The profile is a starting point, not a mandate. The user (or stakeholder) must actively confirm each choice.
