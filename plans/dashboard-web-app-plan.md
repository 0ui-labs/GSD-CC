# Dashboard Web App Plan

## Summary

Build a local GSD-CC Web App that acts as a real-time execution cockpit for
Claude Code projects. This is not a static report and not a prettier CLI
status command. It is a browser-based alternative to watching the terminal:
users should see what is running, what Claude Code is doing, why it is doing
it, what is already finished, what needs attention, and what is safe to do
next.

The first usable version should be a local-only app started from the GSD-CC
package. It should watch `.gsd/` continuously, stream live updates to the
browser, and present the current project state in a modern, dense, readable
interface.

## Product Goal

The dashboard should reduce uncertainty during autonomous or semi-autonomous
AI development work.

It must answer these questions at a glance:

- What task is running right now?
- What phase is Claude Code in: planning, applying, verifying, unifying,
  waiting for approval, or recovering?
- Why is this task being run?
- Which acceptance criteria does the current task cover?
- Which files are in scope and which files are protected?
- What has already completed?
- Did auto-mode stop, fail, or require approval?
- What is the safest next action?

## Non-Goals

The initial Web App should not become a cloud service, a hosted project
management product, or a replacement for Claude Code.

Avoid:

- accounts, auth, sync, or remote storage
- databases
- telemetry
- background daemons outside the explicit local server process
- hidden write actions from the UI
- complex project editing flows before the read model is reliable
- trying to show Claude's private reasoning

The UI can explain "why" from explicit artifacts: task plans, risk sections,
acceptance criteria, approvals, recovery reports, state transitions, and
structured events.

## Experience Principles

The app should feel like a local developer operations console.

- Attention-first: blockers, approvals, recovery, and failed states appear
  before normal progress.
- Live by default: if `.gsd/` changes, the UI updates without refresh.
- Dense but calm: show enough information for serious work without looking
  like a marketing page.
- Artifact-backed: every claim links back to the file or event that produced
  it.
- Read-only first: the first version observes and explains. Action buttons can
  come after the safety model is proven.
- Local and private: the server binds to localhost and only reads the current
  project.

## Target Launch Command

Preferred UX:

```bash
npx gsd-cc dashboard
```

or from an installed local package:

```bash
gsd-cc dashboard
```

Expected output:

```text
GSD-CC Dashboard running at http://127.0.0.1:4766
Watching /path/to/project/.gsd
Press Ctrl+C to stop.
```

The command should open the browser automatically only when it is safe and not
surprising. A `--no-open` flag should disable browser launch.

## Architecture

### Local Server

Add a small local Node server:

```text
gsd-cc/scripts/dashboard-server.js
```

Responsibilities:

- serve the Web App assets
- read and normalize `.gsd/` project state
- watch `.gsd/` for changes
- stream state updates to the browser
- expose read-only API endpoints
- never execute project workflow commands in V1

Use Node built-ins where possible:

- `http` for the server
- `fs` and `fs.watch` for file watching
- polling fallback for platforms where `fs.watch` is unreliable
- Server-Sent Events for live updates

SSE is enough for V1 because the browser mostly receives updates. WebSockets
can be added later if the UI starts sending interactive control commands.

### Web Client

Preferred V1 implementation:

```text
gsd-cc/dashboard/
  index.html
  app.js
  styles.css
```

This keeps the app dependency-light while still allowing a modern UI. If the UI
quickly becomes hard to maintain, move to an optional Vite/React app in a later
slice. The first version should prove the product model before adding a build
pipeline.

The client should:

- fetch `/api/state` on load
- subscribe to `/api/events`
- render the current normalized dashboard model
- show connection state
- recover gracefully if the server restarts

### Normalized Dashboard Model

The server should transform raw `.gsd/` files into a stable JSON model:

```json
{
  "project": {
    "root": "/path/to/project",
    "language": "English",
    "project_type": "application",
    "rigor": "deep"
  },
  "current": {
    "milestone": "M001",
    "slice": "S02",
    "task": "T03",
    "phase": "applying",
    "task_name": "Add auth token validation",
    "next_action": "Wait for auto-mode to finish S02/T03."
  },
  "attention": [],
  "automation": {
    "status": "running",
    "scope": "slice",
    "unit": "S02/T03",
    "pid": 12345,
    "started_at": "2026-04-28T12:00:00+02:00"
  },
  "progress": {
    "slices": [],
    "acceptance_criteria": {
      "total": 0,
      "passed": 0,
      "partial": 0,
      "failed": 0,
      "pending": 0
    }
  },
  "current_task": {
    "risk": {
      "level": "medium",
      "reason": "Touches shared request validation."
    },
    "files": [],
    "boundaries": [],
    "acceptance_criteria": [],
    "verify": []
  },
  "activity": [],
  "evidence": {
    "latest_unify": null,
    "latest_recovery": null,
    "approval_request": null,
    "recent_decisions": []
  },
  "costs": {
    "available": false
  }
}
```

The UI should depend on this normalized model, not on ad hoc parsing in the
browser.

## Live Event Journal

The Web App cannot feel live if it only rereads final artifacts. Auto-mode
needs to emit a structured event stream.

Add:

```text
.gsd/events.jsonl
```

and an auto-mode helper:

```text
gsd-cc/skills/auto/lib/events.sh
```

Each event is one JSON line:

```json
{
  "ts": "2026-04-28T12:00:00+02:00",
  "type": "task_started",
  "milestone": "M001",
  "slice": "S02",
  "task": "T03",
  "phase": "apply",
  "message": "Started S02/T03.",
  "why": "Implements AC-4 and AC-5 from the slice plan."
}
```

### Required Event Types

Start with a small, useful set:

- `auto_started`
- `auto_finished`
- `phase_started`
- `phase_completed`
- `slice_started`
- `task_started`
- `task_completed`
- `dispatch_started`
- `dispatch_failed`
- `verification_planned`
- `summary_missing_retry`
- `fallback_commit_started`
- `fallback_commit_completed`
- `unify_started`
- `unify_completed`
- `approval_required`
- `approval_found`
- `recovery_written`
- `budget_reached`
- `state_validation_failed`

Each event should include:

- timestamp
- type
- milestone, slice, task when known
- phase or dispatch phase when known
- human-readable message
- optional `why`
- optional artifact paths
- optional risk and approval fields
- optional verify command

### Why Events Matter

The UI can show:

- current activity feed
- last heartbeat
- what Claude Code was dispatched to do
- why a task exists
- when verification was expected
- when fallback commit handling ran
- where auto-mode stopped

This avoids scraping terminal logs for meaning.

## Server Read Model

The dashboard server should read these files:

- `.gsd/STATE.md`
- `.gsd/CONFIG.md`
- `.gsd/type.json`
- `.gsd/M*-ROADMAP.md`
- `.gsd/S*-PLAN.md`
- `.gsd/S*-T*-PLAN.xml`
- `.gsd/S*-T*-SUMMARY.md`
- `.gsd/S*-UNIFY.md`
- `.gsd/DECISIONS.md`
- `.gsd/APPROVAL-REQUEST.json`
- `.gsd/APPROVALS.jsonl`
- `.gsd/AUTO-RECOVERY.md`
- `.gsd/auto-recovery.json`
- `.gsd/auto.lock`
- `.gsd/COSTS.jsonl`
- `.gsd/events.jsonl`

It should tolerate missing files. A project can be in early setup, interrupted,
or partially migrated.

## API Design

Read-only V1 endpoints:

```text
GET /                  Web App
GET /api/state          Current normalized dashboard model
GET /api/events         SSE stream of dashboard model updates
GET /api/artifact?path= Safe read of selected .gsd artifact
GET /api/health         Server health and watched project root
```

Safety rules:

- reject artifact paths outside `.gsd/`
- reject absolute paths from the browser
- normalize and validate all requested paths
- bind to `127.0.0.1` by default
- do not expose write endpoints in V1

## UI Information Architecture

### Top Bar

Purpose: orientation.

Show:

- project folder name
- milestone / slice / task
- phase
- auto-mode status
- connection state
- last updated timestamp

### Attention Panel

Purpose: make important states impossible to miss.

Priority order:

1. approval pending
2. live auto-mode lock with stale PID
3. auto recovery from last problem stop
4. blocked or failed phase
5. UNIFY required
6. high-risk current task
7. dirty or incomplete state if detectable

Each attention item should include:

- severity
- short explanation
- source artifact
- recommended next action

### Current Run

Purpose: show what Claude Code is doing now.

Show:

- current phase
- current dispatch phase
- current task name
- activity feed from `events.jsonl`
- latest event timestamp
- running time
- PID status when auto-mode is active
- latest log/recovery pointer

The copy should be plain:

```text
Claude Code is applying S02/T03.
This task covers AC-4 and AC-5.
Risk is high because it touches token validation.
Verification is expected through npm test -- --grep auth.
```

### Why This Task

Purpose: make auto-mode understandable.

Source data:

- task `<name>`
- task `<action>`
- task `<risk>`
- task `<acceptance_criteria>`
- slice overview
- latest relevant decision

The UI should not invent rationale. It should compose rationale from explicit
plan fields and events.

### Progress View

Purpose: show what is done and what remains.

Show:

- slices from roadmap
- per-slice status: pending, planned, running, apply-complete, unified, failed
- task counts
- AC counts
- risk distribution per slice
- UNIFY status per slice

Prefer a compact roadmap/timeline over large decorative cards.

### Task Detail View

Purpose: inspect the current or selected task.

Show:

- task name
- risk level and reason
- files in scope
- boundaries
- acceptance criteria with status
- verify command
- summary status if complete
- related events
- source links to plan and summary artifacts

### Evidence View

Purpose: show what proves the work.

Show:

- latest task summaries
- latest UNIFY report status
- plan vs actual result
- risks introduced
- high-risk task approval status
- decisions made
- deferred items

### Automation View

Purpose: diagnose auto-mode.

Show:

- active/stale/inactive lock
- auto-mode scope
- PID status
- start time
- latest recovery report
- recent auto-mode events
- cost/token summary if available

## Visual Direction

The UI should feel modern but work-focused.

Use:

- restrained neutral background
- strong status accents for attention states
- compact tables for tasks and ACs
- timeline/list for events
- small status badges for phase, risk, and approvals
- monospace only for paths, commands, IDs, and logs

Avoid:

- marketing hero sections
- oversized cards
- decorative gradients
- one-note purple/blue palettes
- vague status copy
- hiding critical details behind hover-only UI

The first screen should be the cockpit itself.

## Implementation Plan

For implementation, use the smaller thread-sized breakdown in
`plans/dashboard-web-app-workbreakdown.md`. The slices below describe the
product architecture; the breakdown file is the execution checklist.

### Slice 1: Dashboard Server Skeleton

Goal: start a local server and render a minimal live shell.

Tasks:

1. Add `scripts/dashboard-server.js`.
2. Add CLI argument handling for `dashboard`.
3. Serve `dashboard/index.html`, `dashboard/app.js`, and `dashboard/styles.css`.
4. Add `/api/health`.
5. Bind to `127.0.0.1`.
6. Print the local URL.
7. Add tests for command parsing and server startup where practical.

Acceptance criteria:

- `node scripts/dashboard-server.js` starts a local server.
- `GET /api/health` returns project root and status.
- Missing `.gsd/` produces a friendly empty-project state.
- No external dependencies are required.

### Slice 2: State Read Model

Goal: expose a normalized dashboard model.

Tasks:

1. Parse `.gsd/STATE.md`.
2. Discover roadmap, slice plans, task plans, summaries, and UNIFY files.
3. Parse task XML for name, files, risk, ACs, boundaries, and verify.
4. Parse approval request and auto recovery JSON.
5. Detect active, stale, and inactive auto-mode lock.
6. Build `/api/state`.
7. Add unit tests using temporary `.gsd/` fixtures.

Acceptance criteria:

- `/api/state` returns stable JSON for seed, planned, applying, approval,
  recovery, and unified states.
- Missing optional files do not crash the server.
- Artifact paths are repo-relative and safe.

### Slice 3: Live Updates

Goal: update the browser automatically.

Tasks:

1. Add `.gsd/` watcher with debounce.
2. Add polling fallback.
3. Add `/api/events` as an SSE stream.
4. Push normalized state snapshots after relevant file changes.
5. Add client reconnect handling.
6. Show connection state in the UI.

Acceptance criteria:

- Editing `.gsd/STATE.md` updates the browser without refresh.
- Adding a task summary updates task and AC progress.
- Removing or creating `APPROVAL-REQUEST.json` updates attention state.
- Browser reconnects after server restart.

### Slice 4: Event Journal

Goal: make auto-mode narrate observable execution progress.

Tasks:

1. Add `skills/auto/lib/events.sh`.
2. Emit events from `auto-loop.sh` at major lifecycle points.
3. Include `why` where it can be derived from task plans.
4. Include artifact paths for summaries, UNIFY, recovery, and approvals.
5. Make event writing best-effort so auto-mode never fails because event
   logging failed.
6. Add tests for JSONL shape and failure tolerance.

Acceptance criteria:

- Auto-mode writes `.gsd/events.jsonl`.
- Dashboard shows live activity from structured events.
- Invalid or partial event lines do not break the UI.
- Event logging failures do not stop auto-mode.

### Slice 5: Current Run UI

Goal: make the main cockpit useful during execution.

Tasks:

1. Build top bar.
2. Build attention panel.
3. Build current run panel.
4. Build activity feed.
5. Build "Why this task" panel.
6. Build current task AC/risk/files/verify sections.

Acceptance criteria:

- A user can tell which task is running within 5 seconds.
- A user can see what Claude Code is doing now.
- A user can see why the current task exists.
- Approval, recovery, and blocked states are visually prominent.

### Slice 6: Progress And Evidence UI

Goal: show completed work and remaining work.

Tasks:

1. Build slice roadmap.
2. Build task list per selected slice.
3. Build acceptance criteria summary.
4. Build latest UNIFY/evidence panel.
5. Build artifact viewer drawer for `.gsd` files.
6. Add empty and partial-state UI.

Acceptance criteria:

- Completed slices and tasks are visible.
- Current and pending slices are distinct.
- UNIFY status and recommendations are visible.
- Artifact viewer cannot read outside `.gsd/`.

### Slice 7: Polish And Packaging

Goal: make the app feel like part of GSD-CC.

Tasks:

1. Add help docs for `gsd-cc dashboard`.
2. Ensure installer includes dashboard assets.
3. Add README section.
4. Add smoke test for installed package assets.
5. Add manual QA checklist for browser layout.
6. Verify UI on desktop and narrow widths.

Acceptance criteria:

- Installed GSD-CC can launch the dashboard.
- README explains the local-only privacy model.
- UI remains usable on common laptop widths.
- No build step is required for V1.

## Future Interactive Actions

After read-only live mode is reliable, add explicit, narrow actions.

Candidate V2 actions:

- approve once
- dismiss stale lock after confirmation
- open recovery report
- open artifact
- copy recommended command
- resume auto-mode
- run manual task
- replan current task

Each action should map to an existing GSD-CC workflow and require clear user
confirmation when it can mutate project state.

## Risks

### UI Outruns State Quality

If the UI guesses too much, users will lose trust. Keep the server read model
strict and artifact-backed.

Mitigation:

- normalized model tests
- explicit unknown states
- source artifact links

### Event Logging Becomes Fragile

Auto-mode should never fail because dashboard events failed.

Mitigation:

- event writes are best-effort
- shell helper traps JSON escaping carefully
- tests cover missing `.gsd/`, readonly event file, and malformed events

### Dependency Creep

A polished Web App can pull in a full frontend stack too early.

Mitigation:

- V1 uses vanilla browser APIs
- add a framework only if UI complexity justifies it
- keep dashboard optional and local

### Unsafe UI Actions

Users may expect buttons to control auto-mode. That is useful but risky.

Mitigation:

- V1 read-only
- V2 actions mirror existing router decisions
- every write action requires confirmation
- write action events are logged

## Recommended First Milestone

Build the read-only live cockpit first:

1. Server skeleton
2. Normalized read model
3. SSE live updates
4. Event journal
5. Current run UI
6. Progress/evidence UI
7. Packaging and docs

This produces a real Web App, not a static dashboard, while keeping the first
version safe enough to ship with GSD-CC.
