# Application — Conversation Guide

## 1/10 — Problem Statement

**Explore:** What does this solve? Who's it for — just you, a team, the public? Why build it instead of buying something off the shelf?

**Suggest:** If the user is vague: "What's the one thing a user would do in their first 5 minutes?" If they're solving their own problem, that's valid — note it and move on.

**Skip-Condition:** Never skip. Every application needs a clear problem statement.

## 2/10 — Tech Stack

**Explore:** Do you have a stack in mind, or are you exploring? What's the deployment target — local, cloud, edge? Any constraints from existing infrastructure?

**Suggest:** For solo builders: Next.js + SQLite is fast to ship. For teams: consider what everyone knows. If unsure, suggest deferring to the plan phase for deeper research.

**Skip-Condition:** Can skip if user already has an established codebase with clear stack.

## 3/10 — Data Model

**Explore:** What are the core things this app tracks? How do they relate to each other? What's the most important entity — the one everything else connects to?

**Suggest:** Start with 3-5 entities max. Draw the relationships: "A User has many X, each X belongs to one Y." Keep it minimal — evolve later.

**Skip-Condition:** Never skip. The data model shapes everything downstream.

## 4/10 — API Surface

**Explore:** What endpoints does this need? Is there auth? Internal-only or public API? REST, GraphQL, or tRPC? What's the most critical endpoint?

**Suggest:** For MVPs: REST is fastest. Auth: start with JWT or session-based. If they need real-time: consider SSE over WebSockets for simplicity.

**Skip-Condition:** Skip if this is a purely frontend app with no backend.

## 5/10 — Deployment Strategy

**Explore:** Where does this run? Local dev, staging, production — what's the plan? Docker or bare metal? CI/CD needed?

**Suggest:** For solo: Railway or Vercel for zero-config. For Docker: suggest a compose file early. Database: managed > self-hosted for MVPs.

**Skip-Condition:** Skip if user explicitly says "I'll figure out deployment later" — but note it as an open question.

## 6/10 — Security Considerations

**Explore:** What's the auth model? What data is sensitive? Any compliance requirements (HIPAA, SOC2, GDPR)? What are the risks specific to THIS app?

**Suggest:** At minimum: input validation, parameterized queries, CSRF protection, rate limiting. If handling PII: encryption at rest. Don't over-engineer for internal tools.

**Skip-Condition:** Skip if it's a personal tool with no sensitive data and no external users.

## 7/10 — UI/UX Needs

**Explore:** What does the user see? Key views or pages? Design system or freestyle? Mobile-responsive? Any real-time UI (dashboards, notifications)?

**Suggest:** For MVPs: Tailwind + shadcn/ui gets 80% there. Start with the one screen that delivers core value. Wireframe in words before code.

**Skip-Condition:** Skip if this is a pure API/backend with no UI.

## 8/10 — Phase Breakdown

**Explore:** What's the minimum slice that proves the concept? What comes after? Can you ship something useful in 3-5 phases? What's the "it works" moment for each phase?

**Suggest:** Phase 1 = smallest thing that delivers value. Each phase independently testable. More than 7 phases? The scope might be too big.

**Skip-Condition:** Never skip. This directly feeds the roadmap.

## 9/10 — Integration Points

**Explore:** What external systems does this talk to? APIs, webhooks, third-party services? What happens if an integration is down?

**Suggest:** List each integration: what data flows, which direction, what auth is needed. Consider graceful degradation for each.

**Skip-Condition:** Skip if no external integrations are needed.

## 10/10 — Testing Strategy

**Explore:** What kind of testing matters most here? Unit tests, integration tests, E2E? What's the most critical path to test? What would break that you'd want to catch early?

**Suggest:** Start with integration tests for the critical path. Unit tests for business logic. E2E for the one flow that must never break.

**Skip-Condition:** Skip if user explicitly defers testing decisions to plan phase.
