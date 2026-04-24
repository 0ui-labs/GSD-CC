# Documentation Consistency Implementation Plan

## Goal

Align GSD-CC documentation with actual runtime behavior so users, contributors,
and maintainers all see the same file paths, requirements, and workflow
expectations.

The target outcome is:

- one documented source of truth for install behavior
- one documented source of truth for custom project type paths
- one documented source of truth for dependency requirements
- no conflicting examples across README, package docs, contributing guides, and
  skill docs

## Why This Change Comes Fifth

The earlier phases deal with runtime safety and correctness. Once those are
defined, the next highest-value step is making the docs tell the same story as
the code.

Right now the documentation surface is partly updated and partly stale. Some
pages describe newer manifest-driven install behavior while other pages still
point to outdated skill paths or frame `jq` as an auto-mode-only dependency.
That inconsistency creates support load, contributor confusion, and makes it
hard to trust operational instructions.

## Current Documentation Drift

### 1. Custom project type paths disagree

Current examples point to different locations:

- `README.md` still references `~/.claude/skills/gsd-cc-seed/types/...`
- `gsd-cc/skills/seed/SKILL.md` points to `~/.claude/skills/seed/types/...`
- `CONTRIBUTING.md` references `gsd-cc/skills/gsd/seed/types/...`

At least one of these is wrong, and likely two are.

### 2. Dependency guidance is incomplete

- `README.md` and `gsd-cc/README.md` describe `jq` as required for auto-mode
- hook scripts also depend on `jq`
- users reading only the install docs may not understand that missing `jq` can
  affect hook readiness too

### 3. Install/uninstall behavior is unevenly described

Some docs now describe:

- install manifests
- manifest-driven uninstall
- namespaced hooks

But that behavior is not yet propagated consistently across all user- and
contributor-facing docs.

### 4. Artifact naming needs continued policing

Task plan naming appears mostly corrected toward:

- slice plans: `.gsd/S{nn}-PLAN.md`
- task plans: `.gsd/S{nn}-T{nn}-PLAN.xml`

But the broader documentation set still needs a systematic pass so old examples
do not creep back in.

## Non-Goals

- Rewrite all docs for tone or marketing voice.
- Expand tutorial content beyond what is needed for correctness.
- Replace concise docs with exhaustive internal design notes.

## Documentation Principles

1. Runtime truth wins over legacy wording.
2. One concept should have one canonical explanation.
3. Repeated instructions must be mechanically easy to keep in sync.
4. Contributor docs should explain maintenance constraints, not duplicate every
   user-facing paragraph.
5. If behavior is conditional, document the condition explicitly.

## Proposed Documentation Model

### 1. Define documentation tiers

Use clear ownership for each type of information:

- `README.md`
  primary user-facing overview and install/usage entry point
- `gsd-cc/README.md`
  package-level quick reference focused on installed artifact layout and local
  package behavior
- `CONTRIBUTING.md`
  contributor-specific development and maintenance guidance
- skill docs
  operational instructions for Claude, not the canonical place for broad user
  setup guidance

### 2. Create canonical statements for recurring topics

For each repeated concept, define one exact canonical statement and then adapt
it only lightly where needed.

Recurring concepts:

- install and uninstall behavior
- manifest location
- hook location and ownership
- custom project type lookup paths
- task plan artifact naming
- dependency readiness and `jq`

### 3. Prefer “overview here, details there”

Instead of repeating full explanations everywhere:

- `README.md` gives the primary explanation
- `gsd-cc/README.md` summarizes package-local specifics
- `CONTRIBUTING.md` links back conceptually and focuses on what contributors
  must not break

This reduces future drift.

## Proposed Implementation

### Phase A: Inventory every conflicting statement

Audit all relevant docs for these topics:

- custom project type paths
- install and uninstall commands
- manifest location
- hook location
- dependency requirements
- task plan file naming

Produce a checklist of all occurrences before editing so the fix is complete in
one pass.

### Phase B: Decide canonical wording

For each topic, write the final approved wording first.

Examples of canonical facts that need confirmation during implementation:

- where custom project types are discovered for local vs global installs
- whether `jq` should be described as hooks-ready, auto-ready, or fully required
- whether local uninstall should always be documented as `--uninstall --local`

Once these statements are fixed, use them everywhere.

### Phase C: Update primary user docs

Start with:

- `README.md`
- `gsd-cc/README.md`

These should define the user-visible truth for:

- how to install and uninstall
- what files are created
- where manifests live
- what dependencies are required for which capabilities
- where to drop custom project type files

### Phase D: Update contributor docs

Update `CONTRIBUTING.md` so it:

- uses the correct custom-type path
- explains any installer safety constraints contributors must preserve
- avoids duplicating user setup details unless they matter for development

### Phase E: Update skill docs and examples

Review skill docs that mention any of the canonical topics and align them:

- `gsd-cc/skills/help/SKILL.md`
- `gsd-cc/skills/tutorial/SKILL.md`
- `gsd-cc/skills/seed/SKILL.md`
- `gsd-cc/skills/plan/SKILL.md`
- `gsd-cc/skills/auto/SKILL.md`

Goals:

- operational instructions remain accurate
- examples use current file names and paths
- setup/dependency notes do not contradict the main README

### Phase F: Reduce future drift

Add lightweight documentation guardrails:

- a contributor note listing canonical topics that must stay synchronized
- optional checklist entries for docs-touching changes
- a short “if you change X, also update Y” section in `CONTRIBUTING.md`

This phase does not need automation unless it stays very lightweight.

## Canonical Topics To Standardize

### Install/uninstall behavior

Must consistently answer:

- which commands install globally vs locally
- where manifests are written
- what uninstall removes
- how ownership conflicts are handled

### Custom project type paths

Must consistently answer:

- where local custom types live in the repo
- where global custom types live under `.claude`
- which path examples users should actually copy

### Dependencies and readiness

Must consistently answer:

- what is needed for base installation
- what is needed for hooks readiness
- what is needed for auto-mode
- what happens if `jq` is missing

### Task artifacts

Must consistently answer:

- slice plans use Markdown
- task plans use XML
- which files are created during planning, execution, and unify

## Files Expected To Change

Primary docs:

- `README.md`
- `gsd-cc/README.md`
- `CONTRIBUTING.md`

Likely skill docs:

- `gsd-cc/skills/help/SKILL.md`
- `gsd-cc/skills/tutorial/SKILL.md`
- `gsd-cc/skills/seed/SKILL.md`
- `gsd-cc/skills/plan/SKILL.md`
- `gsd-cc/skills/auto/SKILL.md`

Possible maintenance docs:

- checklist files if a lightweight sync reminder is added

## Verification Plan

### Static verification

- search for stale custom-type paths and ensure only canonical paths remain
- search for `jq` references and confirm dependency language is consistent
- search for `PLAN.md` and `PLAN.xml` references and confirm they describe the
  correct artifact types
- search for uninstall behavior references and confirm they match runtime
  ownership semantics

### Manual review

1. Read `README.md` as a first-time user and confirm install and custom-type
   instructions are actionable without cross-checking another file.
2. Read `gsd-cc/README.md` and confirm it does not contradict the root README.
3. Read `CONTRIBUTING.md` and confirm contributor instructions are correct and
   focused on maintenance concerns.
4. Read the main skill docs and confirm Claude-facing operational instructions
   match the current runtime model.

### Success criteria

- no conflicting custom project type paths remain
- no doc implies `jq` matters only for auto-mode if hooks also depend on it
- install/uninstall behavior is described consistently everywhere
- task artifact naming stays aligned across overview, tutorial, and skill docs

## Commit Strategy

Planned atomic commits:

1. align primary user docs around canonical install, dependency, and path
   statements
2. align contributor docs and maintenance notes
3. align skill docs and examples with the canonical documentation model

## Open Questions

1. Which exact path should be treated as the canonical global custom-type path
   after the runtime changes land.
2. Whether `gsd-cc/README.md` should be a compact package reference or a
   near-mirror of the root README.
3. Whether a lightweight docs-sync checklist belongs in `CONTRIBUTING.md` or in
   a separate checklist file.
4. Whether dependency readiness terminology should be introduced explicitly in
   user docs or kept implicit.

## Exit Criteria

This phase is done when:

- major documentation surfaces no longer contradict each other
- setup, dependency, and custom-path instructions match runtime reality
- contributors have clear guidance on which docs must be kept in sync
- future changes have a lower chance of reintroducing documentation drift
