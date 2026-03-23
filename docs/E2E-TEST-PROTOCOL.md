# GSD-CC End-to-End Test Protocol

> Run through this protocol manually to verify the complete lifecycle works.
> Use a fresh, empty project directory for testing.

## Prerequisites Check

- [ ] Claude Code installed and logged in
- [ ] Max Plan active (for auto-mode)
- [ ] Git installed
- [ ] jq installed (`jq --version`)

---

## Test 1: Installation

```bash
mkdir /tmp/gsd-test && cd /tmp/gsd-test
git init
```

### 1a: Global Install

```bash
npx gsd-cc --global
```

**Expected:**
- [ ] Banner displays with version
- [ ] Files copied to `~/.claude/skills/gsd/`
- [ ] Success message: "Done. Open Claude Code and type /gsd to start."
- [ ] `auto-loop.sh` is executable

**Verify:**
```bash
ls ~/.claude/skills/gsd/SKILL.md
ls ~/.claude/skills/gsd/auto/auto-loop.sh
test -x ~/.claude/skills/gsd/auto/auto-loop.sh && echo "executable"
```

### 1b: Local Install

```bash
npx gsd-cc --local
```

**Expected:**
- [ ] Files copied to `./.claude/skills/gsd/`

### 1c: Help

```bash
npx gsd-cc --help
```

**Expected:**
- [ ] Shows usage, options, examples

### 1d: Uninstall

```bash
npx gsd-cc --uninstall
```

**Expected:**
- [ ] Removes skills directory
- [ ] Confirms removal

---

## Test 2: Ideation (`/gsd` → `/gsd-seed`)

```bash
cd /tmp/gsd-test
claude
```

```
> /gsd
```

**Expected:**
- [ ] Detects no `.gsd/` directory
- [ ] Asks "What are you building?"

```
> A CLI tool that converts CSV files to JSON
```

**Expected:**
- [ ] Detects type: `utility`
- [ ] Sets rigor: `tight`
- [ ] Starts guided exploration with 6 sections
- [ ] Coach persona (thinking with you, not interrogating)

**Walk through all 6 sections. Answer briefly (tight rigor).**

**After completion, expected files:**
- [ ] `.gsd/PLANNING.md` — filled with real content, no placeholders
- [ ] `.gsd/PROJECT.md` — 3-5 sentence vision
- [ ] `.gsd/type.json` — `{"type":"utility","rigor":"tight"}`
- [ ] `.gsd/STATE.md` — `phase: seed-complete`
- [ ] `.gsd/DECISIONS.md` — ideation decisions logged

---

## Test 3: Roadmap Creation

```
> /gsd
```

**Expected:**
- [ ] Detects PLANNING.md exists, no roadmap
- [ ] Suggests creating a roadmap
- [ ] Does NOT show a menu — one action only

```
> yes
```

**Expected:**
- [ ] Creates `.gsd/M001-ROADMAP.md` with slices
- [ ] Slices are ordered by dependency
- [ ] Each slice has a name and description
- [ ] STATE.md updated: `phase: roadmap-complete`

---

## Test 4: Planning (`/gsd-plan`)

```
> /gsd
```

**Expected:**
- [ ] Suggests planning the first slice (S01)

```
> yes
```

**Expected:**
- [ ] Research phase runs (reads codebase)
- [ ] Creates `.gsd/S01-PLAN.md` with:
  - [ ] Task table
  - [ ] AC table (all Given/When/Then)
  - [ ] Boundaries summary
  - [ ] Dependency order
- [ ] Creates `.gsd/S01-T01-PLAN.md` (and T02, etc.)
- [ ] Each task has:
  - [ ] At least 1 AC in Given/When/Then format
  - [ ] Boundaries section (even if "no restrictions")
  - [ ] Verify step referencing AC IDs
- [ ] Git branch created: `gsd/M001/S01`
- [ ] STATE.md updated: `phase: plan-complete`
- [ ] Quality gate passed (no TBD, no missing ACs)

---

## Test 5: Manual Execution (`/gsd-apply`)

```
> /gsd
```

**Expected:**
- [ ] Offers manual or auto execution

```
> manual
```

**Expected for each task:**
- [ ] Announces task name, files, AC count
- [ ] Reads boundaries aloud before coding
- [ ] Implements the action steps
- [ ] Runs verification
- [ ] Reports AC results (Pass/Partial/Fail)
- [ ] Creates `.gsd/S01-T01-SUMMARY.md`
- [ ] Git commit: `feat(S01/T01): {name}`
- [ ] Asks to continue with next task

**After last task:**
- [ ] STATE.md: `phase: apply-complete`, `unify_required: true`

---

## Test 6: UNIFY Enforcement

```
> /gsd
```

**Expected:**
- [ ] Does NOT offer other options
- [ ] Says UNIFY is required
- [ ] Immediately starts UNIFY (no escape)

**UNIFY output (`.gsd/S01-UNIFY.md`):**
- [ ] Plan vs. Actual table (all tasks listed)
- [ ] AC status table (all ACs with Pass/Partial/Fail + evidence)
- [ ] Decisions section (or "No additional decisions")
- [ ] Boundary violations section (or "None.")
- [ ] Deferred section (or "Nothing deferred.")
- [ ] Reassessment verdict
- [ ] Frontmatter with slice, date, status
- [ ] Quality gate passed

**Git:**
- [ ] Squash-merge to main: `feat(M001/S01): {slice name}`
- [ ] Slice branch NOT deleted

**State:**
- [ ] `phase: unified`
- [ ] `unify_required: false`

---

## Test 7: Next Slice Transition

```
> /gsd
```

**Expected:**
- [ ] Detects S01 is unified
- [ ] Suggests continuing with S02
- [ ] Smooth transition, no confusion about state

---

## Test 8: Status (`/gsd-status`)

```
> /gsd-status
```

**Expected:**
- [ ] Milestone overview with per-slice status
- [ ] S01 shows `[done]` with AC count and `unified`
- [ ] Current position displayed
- [ ] AC summary (aggregate)
- [ ] Token usage (if COSTS.jsonl exists) or "manual mode"
- [ ] Auto-mode status: inactive
- [ ] ONE suggested next action

---

## Test 9: Auto-Mode (`/gsd-auto`)

> For this test, plan S02 first, then run auto.

```
> /gsd          → plan S02
> /gsd-auto
```

**Expected:**
- [ ] Prerequisite checks pass (STATE.md, jq, claude -p)
- [ ] Shows current state and what will happen
- [ ] Asks for optional budget
- [ ] Starts auto-loop.sh
- [ ] Each task shows: `▶ S02/T01 (apply)...` then `✓ S02/T01 complete.`
- [ ] UNIFY runs automatically after last task
- [ ] Squash-merge happens
- [ ] Reports final status

**Interrupt test (Ctrl+C):**
- [ ] Lock file cleaned up (trap works)
- [ ] `/gsd` detects interrupted state and offers recovery

---

## Test 10: Crash Recovery

Simulate a crash by creating a stale lock file:

```bash
echo '{"unit":"S03/T02","phase":"apply","pid":99999,"started":"2026-03-23T10:00:00Z"}' > .gsd/auto.lock
```

```
> /gsd
```

**Expected:**
- [ ] Detects lock file
- [ ] Checks PID 99999 (not running = stale)
- [ ] Offers recovery options
- [ ] Cleans up on confirmation

---

## Test 11: Discuss Phase (Optional)

```
> /gsd-discuss
```

**Expected:**
- [ ] Reads current slice from STATE.md
- [ ] Identifies gray areas relevant to the slice
- [ ] Asks about each one at a time with concrete options
- [ ] Creates `S{nn}-CONTEXT.md`
- [ ] Appends to DECISIONS.md
- [ ] STATE.md: `phase: discuss-complete`

---

## Test 12: Full Milestone Completion

Run through all slices (manual or auto) until done.

```
> /gsd
```

**Expected:**
- [ ] "Milestone M001 is complete! All slices planned, executed, and unified."
- [ ] Git log on main shows one clean commit per slice

**Verify git log:**
```bash
git log --oneline main
```

**Expected:**
```
abc123  feat(M001/S03): {slice 3 name}
def456  feat(M001/S02): {slice 2 name}
ghi789  feat(M001/S01): {slice 1 name}
```

---

## Checklist Summary

| Test | Description | Pass |
|------|-------------|------|
| 1 | Installation (global, local, help, uninstall) | |
| 2 | Ideation (type detection, coach mode, output files) | |
| 3 | Roadmap creation | |
| 4 | Planning (ACs, boundaries, quality gate) | |
| 5 | Manual execution (boundary enforcement, summaries, commits) | |
| 6 | UNIFY enforcement (mandatory, all sections, squash-merge) | |
| 7 | Slice transition | |
| 8 | Status overview | |
| 9 | Auto-mode (fresh sessions, auto-UNIFY) | |
| 10 | Crash recovery (stale lock) | |
| 11 | Discuss phase | |
| 12 | Full milestone completion (clean git history) | |
