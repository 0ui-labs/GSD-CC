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

**CRITICAL: Adapt your language to the user's level.** The questions below are guidelines, not scripts. A senior engineer can handle "monolith or microservices?" A first-time builder needs "should it start simple or be built for growth from day one?" Read the room from the first answer and adjust everything that follows.

### Section 1: Who Are You?

Start casual. Get a feel for who you're talking to.

- "Tell me a bit about yourself — do you build software for a living, or is this more of a side thing?"
- "Have you built something before that you were proud of? What was it?"
- "How do you usually work — do you plan everything first, or do you figure it out as you go?"

**Based on their answers, determine their level:**
- **Beginner/Vibe Coder:** No CS background, maybe built a few things with AI help, thinks in terms of "I want it to do X" not "I need an API endpoint"
- **Intermediate:** Has shipped a few projects, knows some frameworks, has opinions but not strong ones
- **Advanced:** Years of experience, strong opinions, can discuss tradeoffs in depth

**Adapt ALL following questions to their level.** The sections below show both styles — pick the right one.

### Section 2: How Do You Like Things Built?

**For beginners:**
- "When you imagine your project — should it be simple and just work, or do you want it built so it can grow into something bigger later?"
- "Do you care about what's under the hood, or just that it works?"
- "If Claude has to pick between two ways to build something — one is quicker but messier, one takes longer but is cleaner — which would you prefer?"
- "Are there apps or tools you use that you think are really well made? What do you like about them?"
- "Is there software you've used that frustrated you? What was annoying about it?"

**For advanced users:**
- "What drives your architecture decisions — simplicity, scalability, developer experience, something else?"
- "Where do you fall on the 'build it right vs. ship it fast' spectrum? Does it depend on context?"
- "What's a popular approach that you think is overrated?"
- "What's an unpopular opinion you hold about how software should be built?"

### Section 3: Tools & Technologies

**For beginners:**
- "Do you have a preference for how things look? Modern and clean? Colorful? Simple?"
- "Is this going to be a website, an app, something that runs on your computer, or something else?"
- "Have you used or heard about specific tools or languages that you'd like to use — or avoid?"
- "Do you want Claude to pick the best tools, or do you want to have a say?"

**For advanced users:**
- "What's your go-to stack? What do you reach for by default?"
- "Any technologies you refuse to use? Why?"
- "How do you feel about dependencies — fewer is better, or best tool for each job?"
- "Testing philosophy — when and how much?"

### Section 4: Quality & "Good Enough"

**For beginners:**
- "When would you say something is 'done'? When it works? When it looks nice? When it handles weird situations?"
- "If something goes wrong while someone uses your app — should it crash, show an error message, or try to fix itself?"
- "How polished does it need to be for version 1? Perfect, or good enough to use?"
- "Is speed important? Should it feel instant?"

**For advanced users:**
- "What's your bar for shipping? What's your bar for 'done done'?"
- "Error handling strategy — defensive from day one, or add as needed?"
- "Performance — optimize early or measure first?"
- "Security baseline — what do you always do, what do you defer?"

### Section 5: How You Think & Decide

**For everyone (adapt tone):**
- "When there's no obvious right answer — how do you usually decide? Gut feeling? Research? Ask someone?"
- "Have you ever built something and halfway through realized you should have done it differently? What happened?"
- "What makes you give up on a tool or approach and try something else?"
- "Is there something about how things are usually done that you think is stupid or overcomplicated?"

### Section 6: Look & Feel

**For everyone:**
- "How important is it that it looks good — on a scale from 'who cares, it just needs to work' to 'design is everything'?"
- "When you think of apps you love using — what's the vibe? Clean and minimal? Packed with features? Playful?"
- "Phone first or computer first?"
- "Any apps or websites that you think nailed the design?"

### Section 7: Things You Don't Want

**For beginners:**
- "Is there anything where you'd say 'I definitely don't want that'?"
- "Any features or behaviors in apps that annoy you? Things you'd never put in your own project?"
- "Anything that Claude should absolutely not decide on its own — something where it should always ask you first?"

**For advanced users:**
- "Hard no-gos — patterns, tools, approaches?"
- "Anything where you'd rather have ugly-but-working than clean-but-incomplete?"
- "What should Claude never do without asking?"

### Section 8: The Fun Ones

- "If you could change one thing about how software is built today, what would it be?"
- "Is there something that 'everyone knows is wrong' that you secretly think is fine?"
- "What do people who are new to this understand better than the experts?"

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
