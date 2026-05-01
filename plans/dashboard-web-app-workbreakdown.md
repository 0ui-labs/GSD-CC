# Dashboard Web App Work Breakdown

This document breaks `plans/dashboard-web-app-plan.md` into small,
thread-sized implementation packages. The dashboard is large enough that it
should not be implemented in one long Codex thread. Each package below should
be treated as one logical unit of work, with its own tests and commit.

## Working Rules

- One package per implementation thread unless the package is explicitly marked
  as documentation-only.
- Each package must end with a commit.
- Do not start UI polish before the read model and live update path are tested.
- Do not add write actions to the Web App in the read-only milestone.
- Do not add frontend build tooling until a package explicitly decides it is
  necessary.
- Prefer small modules with exported functions so the read model and server can
  be tested without opening a browser.
- Every package must preserve existing CLI and auto-mode behavior.
- Existing unrelated worktree changes must be left alone.

## Milestone 0: Project Shape And Boundaries

### DASH-00: Confirm Web App Scope

Goal: lock the first Web App milestone as a read-only live cockpit.

Files likely touched:

- `plans/dashboard-web-app-plan.md`
- `plans/dashboard-web-app-workbreakdown.md`

Tasks:

1. Ensure the plan says "local Web App", not static HTML.
2. Ensure V1 is read-only.
3. Define that auto-mode events explain behavior from artifacts, not hidden
   model reasoning.

Tests:

- Documentation review only.

Done when:

- The scope is unambiguous enough that implementation threads do not reopen
  the static dashboard vs. Web App decision.

## Milestone 1: Launch Path And Server Skeleton

### DASH-01: Add Dashboard CLI Entry

Goal: make `gsd-cc dashboard` route to a dashboard launcher without starting
the full UI yet.

Files likely touched:

- `gsd-cc/bin/install.js`
- `gsd-cc/bin/install/args.js`
- `gsd-cc/bin/install/cli.js`
- `gsd-cc/test/dashboard-cli.test.js`

Tasks:

1. Add argument parsing for the `dashboard` subcommand.
2. Support `--port <number>`, `--host <host>`, and `--no-open`.
3. Keep existing install/update/uninstall behavior unchanged.
4. Add tests proving install arguments still behave as before.

Tests:

- `node test/dashboard-cli.test.js`
- `node test/entrypoints.test.js`
- `node test/installer.test.js`

Done when:

- `node bin/install.js dashboard --no-open` reaches a stub launcher path.
- Existing installer commands still parse as before.

### DASH-02: Add Minimal Dashboard Asset Directory

Goal: introduce the browser app files without server logic.

Files likely touched:

- `gsd-cc/dashboard/index.html`
- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`
- `gsd-cc/bin/install/constants.js`
- `gsd-cc/test/installer.test.js`

Tasks:

1. Add a minimal HTML shell.
2. Add a minimal JS entry that renders "Dashboard loading".
3. Add baseline CSS variables and layout containers.
4. Ensure package installation includes the dashboard assets.

Tests:

- `node test/installer.test.js`
- `node test/uninstall.test.js`

Done when:

- Installed manifests include dashboard assets.
- No UI behavior is implemented yet.

### DASH-03: Add Local HTTP Server

Goal: serve the minimal dashboard shell locally.

Files likely touched:

- `gsd-cc/scripts/dashboard-server.js`
- `gsd-cc/test/dashboard-server.test.js`

Tasks:

1. Add a small Node HTTP server using built-in modules.
2. Bind to `127.0.0.1` by default.
3. Serve `/`, `/app.js`, and `/styles.css`.
4. Add `GET /api/health`.
5. Return safe 404 responses for unknown paths.

Tests:

- `node test/dashboard-server.test.js`

Done when:

- The server can start on an ephemeral test port.
- `/api/health` returns JSON with `ok`, `projectRoot`, `host`, and `port`.
- Static assets are served with correct content types.

### DASH-04: Add Server Lifecycle And Port Handling

Goal: make the dashboard launch usable from the CLI.

Files likely touched:

- `gsd-cc/scripts/dashboard-server.js`
- `gsd-cc/bin/install.js`
- `gsd-cc/test/dashboard-server.test.js`
- `gsd-cc/test/dashboard-cli.test.js`

Tasks:

1. Wire `gsd-cc dashboard` to the server script.
2. Pick a default port.
3. Fall back to another port if the default is in use.
4. Print the dashboard URL.
5. Respect `--host`, `--port`, and `--no-open`.
6. Keep the process alive until interrupted.

Tests:

- `node test/dashboard-cli.test.js`
- `node test/dashboard-server.test.js`

Done when:

- CLI launch starts the server.
- Port collision is handled predictably.
- The command prints a usable localhost URL.

## Milestone 2: Read Model Foundation

### DASH-05: Add Dashboard Read Model Module

Goal: create a testable module that returns a safe empty dashboard model.

Files likely touched:

- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/test/dashboard-read-model.test.js`

Tasks:

1. Add `buildDashboardModel(projectRoot)`.
2. Return a stable object shape even when `.gsd/` is missing.
3. Include `project`, `current`, `attention`, `automation`, `progress`,
   `current_task`, `activity`, `evidence`, and `costs`.
4. Avoid throwing on missing optional files.

Tests:

- `node test/dashboard-read-model.test.js`

Done when:

- Empty projects return a friendly model with a "no project" attention item.

### DASH-06: Parse STATE And CONFIG

Goal: populate current project position from `.gsd/STATE.md` and config.

Files likely touched:

- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/test/dashboard-read-model.test.js`

Tasks:

1. Parse simple `key: value` fields from `.gsd/STATE.md`.
2. Parse relevant fields from `.gsd/CONFIG.md` when present.
3. Resolve language, milestone, current slice, current task, phase,
   project type, rigor, base branch, and auto-mode scope.
4. Add unknown-state handling when fields are missing.

Tests:

- `node test/dashboard-read-model.test.js`

Done when:

- Seed, planned, applying, and unified fixture states populate `current`.
- Missing fields appear as unknown instead of crashing.

### DASH-07: Parse Task Plan XML

Goal: extract current task details from `Sxx-Tyy-PLAN.xml`.

Files likely touched:

- `gsd-cc/scripts/dashboard/task-plan-parser.js`
- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/test/dashboard-task-plan-parser.test.js`

Tasks:

1. Extract task id, type, name, files, risk, acceptance criteria, action,
   boundaries, verify, and done.
2. Keep parsing conservative and dependency-free.
3. Tolerate missing optional text while preserving errors as warnings.
4. Reuse semantics from auto-mode validation where practical.

Tests:

- `node test/dashboard-task-plan-parser.test.js`
- `node test/dashboard-read-model.test.js`

Done when:

- A valid XML task plan populates `current_task`.
- Malformed XML produces a warning, not a server crash.

### DASH-08: Discover Roadmap, Slices, And Tasks

Goal: build project progress from `.gsd` artifacts.

Files likely touched:

- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/test/dashboard-read-model.test.js`

Tasks:

1. Discover `M*-ROADMAP.md`.
2. Extract slice ids and names from roadmap headings.
3. Discover `S*-PLAN.md`, `S*-T*-PLAN.xml`, summaries, and UNIFY files.
4. Compute slice status: pending, planned, running, apply-complete, unified,
   failed, blocked, or unknown.
5. Compute task counts per slice.

Tests:

- `node test/dashboard-read-model.test.js`

Done when:

- The model can show completed, current, planned, and pending slices from test
  fixtures.

### DASH-09: Compute Acceptance Criteria Progress

Goal: show what is done and what remains.

Files likely touched:

- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/test/dashboard-read-model.test.js`

Tasks:

1. Collect ACs from task plans.
2. Read AC status evidence from summaries and UNIFY files where available.
3. Compute total, passed, partial, failed, and pending counts.
4. Attach AC status to current task.

Tests:

- `node test/dashboard-read-model.test.js`

Done when:

- AC counts update when summaries or UNIFY files exist.
- Unknown evidence leaves ACs pending rather than guessing pass.

### DASH-10: Compute Automation And Attention State

Goal: make approvals, recovery, stale locks, and required UNIFY visible.

Files likely touched:

- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/test/dashboard-read-model.test.js`

Tasks:

1. Parse `.gsd/auto.lock`.
2. Detect live vs. stale PID.
3. Parse `.gsd/auto-recovery.json`.
4. Parse `.gsd/APPROVAL-REQUEST.json`.
5. Detect blocked or failed phases from state.
6. Detect apply-complete without UNIFY.
7. Sort attention items by severity.

Tests:

- `node test/dashboard-read-model.test.js`

Done when:

- Approval, recovery, stale lock, blocked phase, and UNIFY-required fixtures
  each produce the expected top attention item.

### DASH-11: Add `/api/state`

Goal: expose the normalized read model over HTTP.

Files likely touched:

- `gsd-cc/scripts/dashboard-server.js`
- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/test/dashboard-server.test.js`

Tasks:

1. Add `GET /api/state`.
2. Return the dashboard model as JSON.
3. Set no-cache headers.
4. Return safe errors as JSON if model building fails unexpectedly.

Tests:

- `node test/dashboard-server.test.js`
- `node test/dashboard-read-model.test.js`

Done when:

- Test fixtures can request `/api/state` and receive the normalized model.

### DASH-12: Add Safe Artifact Endpoint

Goal: allow the UI to open `.gsd` artifacts safely.

Files likely touched:

- `gsd-cc/scripts/dashboard-server.js`
- `gsd-cc/test/dashboard-server.test.js`

Tasks:

1. Add `GET /api/artifact?path=<repo-relative-path>`.
2. Allow only files inside `.gsd/`.
3. Reject absolute paths and traversal attempts.
4. Return text content and metadata.
5. Return 404 for missing artifacts.

Tests:

- `node test/dashboard-server.test.js`

Done when:

- `.gsd/STATE.md` can be read.
- `../package.json` and absolute paths are rejected.

## Milestone 3: Live Updates

### DASH-13: Add File Watcher With Debounce

Goal: detect `.gsd/` changes reliably.

Files likely touched:

- `gsd-cc/scripts/dashboard/watch.js`
- `gsd-cc/scripts/dashboard-server.js`
- `gsd-cc/test/dashboard-watch.test.js`

Tasks:

1. Watch `.gsd/` recursively where supported.
2. Add polling fallback.
3. Debounce rapid changes.
4. Expose a testable watcher callback API.
5. Handle missing `.gsd/` and later creation.

Tests:

- `node test/dashboard-watch.test.js`

Done when:

- Creating, editing, and deleting relevant `.gsd` files emits one debounced
  update.

### DASH-14: Add SSE State Stream

Goal: push live state snapshots to the browser.

Files likely touched:

- `gsd-cc/scripts/dashboard-server.js`
- `gsd-cc/scripts/dashboard/watch.js`
- `gsd-cc/test/dashboard-sse.test.js`

Tasks:

1. Add `GET /api/events` as an SSE endpoint.
2. Send an initial state snapshot.
3. Send a new snapshot after watcher updates.
4. Add heartbeat comments.
5. Clean up closed client connections.

Tests:

- `node test/dashboard-sse.test.js`
- `node test/dashboard-watch.test.js`

Done when:

- A test client receives an initial state and at least one update after a file
  change.

### DASH-15: Wire Browser Live Connection

Goal: make the browser update without refresh.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`
- `gsd-cc/test/dashboard-ui-smoke.test.js`

Tasks:

1. Fetch `/api/state` on load.
2. Connect to `/api/events`.
3. Update the app state from SSE messages.
4. Show connected, reconnecting, and disconnected states.
5. Fall back to periodic polling if SSE is unavailable.

Tests:

- `node test/dashboard-ui-smoke.test.js`

Done when:

- Static UI smoke tests can verify the client references `/api/state` and
  `/api/events`.
- Manual browser check shows updates without refresh.

## Milestone 4: Auto-Mode Event Journal

### DASH-16: Add Event Writer Helper

Goal: add best-effort JSONL event writing for auto-mode.

Files likely touched:

- `gsd-cc/skills/auto/lib/events.sh`
- `gsd-cc/test/auto-mode-events.test.js`

Tasks:

1. Add `auto_event_write`.
2. JSON-escape fields safely in shell.
3. Write to `.gsd/events.jsonl`.
4. Make writes best-effort and non-fatal.
5. Include timestamp, type, milestone, slice, task, phase, message, and
   optional fields.

Tests:

- `node test/auto-mode-events.test.js`

Done when:

- Event lines are valid JSON.
- Event write failures do not fail the shell helper.

### DASH-17: Emit Auto-Mode Lifecycle Events

Goal: record what auto-mode is doing at high-level boundaries.

Files likely touched:

- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/skills/auto/lib/events.sh`
- `gsd-cc/test/auto-mode-events.test.js`
- existing auto-mode tests if expectations need updates

Tasks:

1. Source `events.sh`.
2. Emit `auto_started` and `auto_finished`.
3. Emit `phase_started` and `phase_completed`.
4. Emit `slice_started`.
5. Emit `dispatch_started` and `dispatch_failed`.
6. Emit `budget_reached`.

Tests:

- `node test/auto-mode-events.test.js`
- `node test/auto-mode-recovery.test.js`
- `node test/auto-mode-scope.test.js`

Done when:

- Auto-mode runs still pass existing tests.
- Events appear in the expected order for a simple fixture run.

### DASH-18: Emit Task, Approval, Recovery, And Commit Events

Goal: capture the useful details users need during execution.

Files likely touched:

- `gsd-cc/skills/auto/auto-loop.sh`
- `gsd-cc/skills/auto/lib/approval.sh`
- `gsd-cc/skills/auto/lib/git.sh`
- `gsd-cc/skills/auto/lib/recovery.sh`
- `gsd-cc/test/auto-mode-events.test.js`

Tasks:

1. Emit `task_started` and `task_completed`.
2. Emit `approval_required` and `approval_found`.
3. Emit `recovery_written`.
4. Emit `fallback_commit_started` and `fallback_commit_completed`.
5. Emit summary and artifact paths where available.

Tests:

- `node test/auto-mode-events.test.js`
- `node test/auto-mode-approval.test.js`
- `node test/auto-mode-git-safety.test.js`
- `node test/auto-mode-recovery.test.js`

Done when:

- Approval, recovery, and fallback commit fixtures produce readable events.

### DASH-19: Add Event Read Model

Goal: surface structured events in `/api/state`.

Files likely touched:

- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/test/dashboard-read-model.test.js`

Tasks:

1. Parse `.gsd/events.jsonl`.
2. Ignore malformed lines and report warnings.
3. Sort events by timestamp and file order.
4. Return recent activity in the dashboard model.
5. Derive "current activity" from latest events where possible.

Tests:

- `node test/dashboard-read-model.test.js`

Done when:

- Recent events appear in the activity feed model.
- Malformed JSONL does not crash model building.

## Milestone 5: Current Run UI

### DASH-20: Build App Layout Shell

Goal: create the main browser layout without deep feature panels.

Files likely touched:

- `gsd-cc/dashboard/index.html`
- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`
- `gsd-cc/test/dashboard-ui-smoke.test.js`

Tasks:

1. Add top bar, left navigation, main area, and right context panel.
2. Add responsive layout constraints.
3. Add empty-state rendering.
4. Avoid nested cards and oversized marketing sections.

Tests:

- `node test/dashboard-ui-smoke.test.js`
- Manual browser screenshot check.

Done when:

- The app looks like a cockpit with clear regions, even with empty data.

### DASH-21: Build Top Bar And Status Strip

Goal: show orientation and live connection state.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`

Tasks:

1. Show project folder name.
2. Show milestone, slice, task, phase.
3. Show auto-mode status.
4. Show connection state and last updated timestamp.
5. Add compact status badges.

Tests:

- `node test/dashboard-ui-smoke.test.js`
- Manual browser check with fixture states.

Done when:

- A user can tell where they are in the project from the top bar alone.

### DASH-22: Build Attention Panel

Goal: make blockers and required user action impossible to miss.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`

Tasks:

1. Render attention items by severity.
2. Show approval pending details.
3. Show recovery details.
4. Show stale lock, blocked phase, and UNIFY-required states.
5. Link to source artifacts where available.

Tests:

- `node test/dashboard-ui-smoke.test.js`
- Manual fixture check for each attention type.

Done when:

- Approval and recovery states appear above normal progress.

### DASH-23: Build Current Run Panel

Goal: show what Claude Code is doing right now.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`

Tasks:

1. Show current phase and dispatch phase.
2. Show current task name.
3. Show PID and runtime when active.
4. Show latest activity event.
5. Show latest log or recovery pointer.

Tests:

- `node test/dashboard-ui-smoke.test.js`
- Manual browser check during a fake event stream.

Done when:

- A user can identify the active task and current auto-mode operation within
  five seconds.

### DASH-24: Build Why This Task Panel

Goal: explain why the current task exists using explicit artifacts.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`

Tasks:

1. Render task action summary.
2. Render risk level and risk reason.
3. Render ACs covered by the task.
4. Render verify command.
5. Avoid invented rationale.

Tests:

- `node test/dashboard-ui-smoke.test.js`
- Manual fixture check with low, medium, and high risk tasks.

Done when:

- The panel answers "why is Claude Code doing this?" from the task plan.

### DASH-25: Build Activity Feed

Goal: show live execution history.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`

Tasks:

1. Render recent events from the model.
2. Group or visually distinguish lifecycle, task, approval, recovery, and
   error events.
3. Show timestamps.
4. Keep the feed readable when many events arrive.

Tests:

- `node test/dashboard-ui-smoke.test.js`
- Manual fake `events.jsonl` check.

Done when:

- The feed makes auto-mode progress understandable without reading
  `.gsd/auto.log`.

## Milestone 6: Progress, Evidence, And Artifacts

### DASH-26: Build Slice Roadmap View

Goal: show what is done and what remains.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`

Tasks:

1. Render all discovered slices.
2. Show status, task count, AC count, and risk distribution.
3. Highlight current slice.
4. Allow selecting a slice for detail.

Tests:

- `node test/dashboard-ui-smoke.test.js`
- Manual fixture check with pending, planned, running, and unified slices.

Done when:

- Progress is understandable without opening roadmap files.

### DASH-27: Build Task Detail View

Goal: inspect current or selected task.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`

Tasks:

1. Render task name, risk, files, boundaries, ACs, verify, and summary status.
2. Show source artifact links.
3. Distinguish completed, current, and pending tasks.
4. Handle tasks with partial data.

Tests:

- `node test/dashboard-ui-smoke.test.js`
- Manual task fixture check.

Done when:

- A user can inspect a task without reading XML directly.

### DASH-28: Build Evidence Panel

Goal: show proof and reconciliation output.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`
- `gsd-cc/scripts/dashboard/read-model.js` if additional UNIFY fields are
  needed

Tasks:

1. Show latest UNIFY status.
2. Show plan-vs-actual summary when parseable.
3. Show risks introduced.
4. Show high-risk approval status.
5. Show recent decisions and deferred items.

Tests:

- `node test/dashboard-read-model.test.js` if parser changes are needed.
- `node test/dashboard-ui-smoke.test.js`

Done when:

- Users can see whether completed work was reconciled and what evidence exists.

### DASH-29: Build Artifact Viewer

Goal: let users inspect `.gsd` artifacts from the Web App.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`
- `gsd-cc/scripts/dashboard-server.js`

Tasks:

1. Add artifact links in relevant panels.
2. Fetch `/api/artifact`.
3. Render artifact content in a drawer or side panel.
4. Show loading, missing, and rejected states.

Tests:

- `node test/dashboard-server.test.js`
- `node test/dashboard-ui-smoke.test.js`

Done when:

- Artifact links open `.gsd` files safely and cannot read outside `.gsd/`.

### DASH-30: Build Automation And Cost Panel

Goal: diagnose auto-mode state and resource usage.

Files likely touched:

- `gsd-cc/scripts/dashboard/read-model.js`
- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`
- `gsd-cc/test/dashboard-read-model.test.js`

Tasks:

1. Parse `COSTS.jsonl` enough for dashboard totals.
2. Show auto-mode active, stale, inactive, or stopped state.
3. Show scope, PID, start time, and last stop.
4. Show cost/token summary when available.

Tests:

- `node test/dashboard-read-model.test.js`
- `node test/dashboard-ui-smoke.test.js`

Done when:

- Users can diagnose whether auto-mode is alive, stale, stopped, or idle.

## Milestone 7: Polish, QA, And Documentation

### DASH-31: Add Dashboard Skill And Help Docs

Goal: make the dashboard discoverable from GSD-CC.

Files likely touched:

- `gsd-cc/skills/dashboard/SKILL.md`
- `gsd-cc/skills/help/SKILL.md`
- `gsd-cc/README.md`
- `README.md`

Tasks:

1. Add `/gsd-cc-dashboard` skill instructions.
2. Add help entry.
3. Add README usage section.
4. Explain local-only privacy behavior.
5. Explain read-only V1 limitation.

Tests:

- Documentation review.
- `node test/installer.test.js` if new skill packaging needs coverage.

Done when:

- Users can discover how to launch and what to expect.

### DASH-32: Add Installed Package Smoke Coverage

Goal: ensure dashboard files survive packaging and install.

Files likely touched:

- `gsd-cc/test/installer.test.js`
- `gsd-cc/test/uninstall.test.js`
- `gsd-cc/package.json`

Tasks:

1. Verify dashboard assets are included in package files.
2. Verify install manifest tracks dashboard files.
3. Verify uninstall removes dashboard assets it owns.
4. Verify non-dashboard install behavior is unchanged.

Tests:

- `node test/installer.test.js`
- `node test/uninstall.test.js`

Done when:

- Installed GSD-CC can serve the dashboard assets.

### DASH-33: Browser QA Pass

Goal: verify the UI behaves like a modern Web App in real browser viewports.

Files likely touched:

- `gsd-cc/dashboard/app.js`
- `gsd-cc/dashboard/styles.css`
- optional QA notes in `plans/`

Tasks:

1. Run the local server against fixture projects.
2. Check desktop viewport.
3. Check narrow laptop/mobile-ish viewport.
4. Verify no overlapping text.
5. Verify activity feed updates live.
6. Verify attention states are prominent.
7. Verify artifact drawer cannot escape `.gsd/`.

Tests:

- Manual browser QA.
- Optional Playwright smoke checks if added in a later package.

Done when:

- The cockpit is readable, modern, and useful across common viewports.

### DASH-34: Final Integration Sweep

Goal: close the read-only live cockpit milestone.

Files likely touched:

- whatever tests, docs, or small fixes remain

Tasks:

1. Run full test suite.
2. Run dashboard manually against at least one realistic `.gsd` fixture.
3. Check that auto-mode still works without the dashboard running.
4. Check that dashboard works without auto-mode running.
5. Update any stale docs.

Tests:

- `npm test` from `gsd-cc/`
- Manual dashboard launch

Done when:

- The read-only live Web App is complete enough to replace terminal watching
  for status, current activity, approvals, recovery, progress, and evidence.

## Recommended Thread Order

Use this order unless a package reveals a blocker:

1. DASH-01
2. DASH-02
3. DASH-03
4. DASH-04
5. DASH-05
6. DASH-06
7. DASH-07
8. DASH-08
9. DASH-09
10. DASH-10
11. DASH-11
12. DASH-12
13. DASH-13
14. DASH-14
15. DASH-15
16. DASH-16
17. DASH-17
18. DASH-18
19. DASH-19
20. DASH-20
21. DASH-21
22. DASH-22
23. DASH-23
24. DASH-24
25. DASH-25
26. DASH-26
27. DASH-27
28. DASH-28
29. DASH-29
30. DASH-30
31. DASH-31
32. DASH-32
33. DASH-33
34. DASH-34

## Practical Thread Prompt Template

For each future implementation thread, start with:

```text
Implement DASH-XX from plans/dashboard-web-app-workbreakdown.md.
Only do this package. Do not start the next package.
Commit atomically when done.
```

That keeps context bounded and prevents the dashboard work from expanding into
a multi-layer rewrite in one session.
