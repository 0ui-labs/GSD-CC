const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  packageRoot
} = require('./helpers/package-fixture');
const {
  createAutoModeProject,
  runAutoLoop
} = require('./helpers/auto-mode');
const {
  ensureFakeBin,
  writeExecutable,
  writeFakeClaude,
  writeFakeDate,
  writeFakeGit,
  writeFakeJq
} = require('./helpers/fake-bin');
const {
  makeTempDir
} = require('./helpers/temp');

const eventsHelperPath = path.join(packageRoot, 'skills', 'auto', 'lib', 'events.sh');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function runEventScript(projectDir, script) {
  return spawnSync(
    'bash',
    ['-c', script, 'auto-mode-events-test', eventsHelperPath, projectDir],
    {
      cwd: projectDir,
      env: process.env,
      encoding: 'utf8'
    }
  );
}

function assertScriptSucceeded(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `event helper script failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function readEvents(projectDir) {
  const eventsPath = path.join(projectDir, '.gsd', 'events.jsonl');
  return fs.readFileSync(eventsPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

function makeEnv(binDir, extra = {}) {
  return {
    ...process.env,
    ...extra,
    GSD_CC_DISABLE_TEE: '1',
    HOME: makeTempDir('gsd-cc-auto-events-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function setupAutoLoopBin(claudeScript, options = {}) {
  const tempRoot = makeTempDir('gsd-cc-auto-events-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeExecutable(binDir, 'sleep', '#!/bin/sh\nexit 0\n');
  writeFakeDate(binDir);
  if (options.fakeGit !== false) {
    writeFakeGit(binDir);
  }
  writeFakeJq(binDir);
  writeFakeClaude(binDir, claudeScript);
  return binDir;
}

function runGit(projectDir, args) {
  const result = spawnSync('git', args, {
    cwd: projectDir,
    env: process.env,
    encoding: 'utf8'
  });

  assert.strictEqual(
    result.status,
    0,
    `git ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );

  return result;
}

function taskPlanPath(projectDir) {
  return path.join(projectDir, '.gsd', 'S01-T01-PLAN.xml');
}

function setTaskRisk(projectDir, riskLevel, riskText) {
  const planPath = taskPlanPath(projectDir);
  const content = fs.readFileSync(planPath, 'utf8')
    .replace(/<risk level="[^"]+">/, `<risk level="${riskLevel}">`)
    .replace(
      /Isolated fixture change with focused verification\./,
      riskText
    );
  fs.writeFileSync(planPath, content);
}

function taskPlanFingerprint(projectDir) {
  const result = spawnSync('cksum', [taskPlanPath(projectDir)], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  const [sum, size] = result.stdout.trim().split(/\s+/);
  return `${sum}:${size}`;
}

function writeApproval(projectDir, fingerprint) {
  writeFile(path.join(projectDir, '.gsd', 'APPROVALS.jsonl'), JSON.stringify({
    slice: 'S01',
    task: 'T01',
    fingerprint,
    status: 'approved'
  }) + '\n');
}

function assertAutoLoopSucceeded(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function testWritesEscapedJsonLine() {
  const projectDir = makeTempDir('gsd-cc-auto-events-');
  const result = runEventScript(projectDir, `
set -euo pipefail
source "$1"
GSD_DIR="$2/.gsd"
mkdir -p "$GSD_DIR"
MILESTONE="M001"
SLICE="S02"
TASK="T03"
PHASE="applying"
iso_now() { printf '%s\\n' '2026-01-01T00:00:00+00:00'; }
auto_event_write "dispatch_started" 'Starting "apply" \\ path
Next line' "why=AC-4 and AC-5" "artifact=.gsd/S02-T03-PLAN.xml" $'note=tab\\tvalue' "bad-key=ignored"
`);

  assertScriptSucceeded(result);

  const [event] = readEvents(projectDir);
  assert.strictEqual(event.timestamp, '2026-01-01T00:00:00+00:00');
  assert.strictEqual(event.type, 'dispatch_started');
  assert.strictEqual(event.milestone, 'M001');
  assert.strictEqual(event.slice, 'S02');
  assert.strictEqual(event.task, 'T03');
  assert.strictEqual(event.phase, 'applying');
  assert.strictEqual(event.message, 'Starting "apply" \\ path\nNext line');
  assert.strictEqual(event.why, 'AC-4 and AC-5');
  assert.strictEqual(event.artifact, '.gsd/S02-T03-PLAN.xml');
  assert.strictEqual(event.note, 'tab\tvalue');
  assert.ok(!Object.prototype.hasOwnProperty.call(event, 'bad-key'));
}

function testReadsContextFromStateWhenVariablesAreMissing() {
  const projectDir = makeTempDir('gsd-cc-auto-events-state-');
  writeFile(path.join(projectDir, '.gsd', 'STATE.md'), [
    'milestone: M002',
    'current_slice: S04',
    'current_task: T05',
    'phase: plan-complete',
    ''
  ].join('\n'));

  const result = runEventScript(projectDir, `
set -euo pipefail
source "$1"
GSD_DIR="$2/.gsd"
unset MILESTONE SLICE TASK PHASE || true
iso_now() { printf '%s\\n' '2026-01-02T00:00:00+00:00'; }
auto_event_write "auto_started" "Started from STATE.md"
`);

  assertScriptSucceeded(result);

  const [event] = readEvents(projectDir);
  assert.strictEqual(event.timestamp, '2026-01-02T00:00:00+00:00');
  assert.strictEqual(event.type, 'auto_started');
  assert.strictEqual(event.milestone, 'M002');
  assert.strictEqual(event.slice, 'S04');
  assert.strictEqual(event.task, 'T05');
  assert.strictEqual(event.phase, 'plan-complete');
  assert.strictEqual(event.message, 'Started from STATE.md');
}

function testWriteFailureIsNonFatal() {
  const projectDir = makeTempDir('gsd-cc-auto-events-failure-');
  const result = runEventScript(projectDir, `
set -euo pipefail
source "$1"
GSD_DIR="$2/.gsd"
printf '%s\\n' 'not a directory' > "$GSD_DIR"
auto_event_write "dispatch_failed" "This should not stop the shell"
printf '%s\\n' 'still-running'
`);

  assertScriptSucceeded(result);
  assert.match(result.stdout, /still-running/);
}

function testAutoLoopWritesLifecycleEventsInOrder() {
  const binDir = setupAutoLoopBin(`#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const gsdDir = path.join(process.cwd(), '.gsd');

if (prompt.includes('UNIFY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'S01-UNIFY.md'), '# Unified\\n');
  const statePath = path.join(gsdDir, 'STATE.md');
  const state = fs.readFileSync(statePath, 'utf8');
  fs.writeFileSync(statePath, state.replace(/^phase:.*$/m, 'phase: unified'));
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  const projectDir = createAutoModeProject({
    state: {
      phase: 'apply-complete',
      auto_mode_scope: 'slice'
    }
  });

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);

  const events = readEvents(projectDir);
  assert.deepStrictEqual(
    events.map((event) => event.type),
    [
      'auto_started',
      'slice_started',
      'phase_started',
      'dispatch_started',
      'phase_completed',
      'auto_finished'
    ]
  );
  assert.strictEqual(events[0].scope, 'slice');
  assert.strictEqual(events[1].slice, 'S01');
  assert.strictEqual(events[2].phase, 'apply-complete');
  assert.strictEqual(events[3].dispatch_phase, 'unify');
  assert.strictEqual(events[4].phase, 'apply-complete');
}

function testAutoLoopWritesDispatchFailureEvent() {
  const binDir = setupAutoLoopBin(`#!/usr/bin/env node
console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
process.exit(42);
`);
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);

  const events = readEvents(projectDir);
  const types = events.map((event) => event.type);
  assert.deepStrictEqual(types.slice(0, 6), [
    'auto_started',
    'slice_started',
    'phase_started',
    'task_started',
    'dispatch_started',
    'dispatch_failed'
  ]);
  assert.strictEqual(events[3].task_plan, '.gsd/S01-T01-PLAN.xml');
  assert.strictEqual(events[4].dispatch_phase, 'apply');
  assert.strictEqual(events[5].dispatch_phase, 'apply');
  assert.strictEqual(events[5].exit_code, '42');
  assert.ok(types.includes('recovery_written'));
  assert.strictEqual(events[events.length - 1].type, 'auto_finished');
}

function testAutoLoopWritesBudgetReachedEvent() {
  const binDir = setupAutoLoopBin(`#!/usr/bin/env node
console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  writeFile(
    path.join(projectDir, '.gsd', 'COSTS.jsonl'),
    '{"usage":{"input_tokens":2,"output_tokens":2}}\n'
  );

  const result = runAutoLoop(projectDir, makeEnv(binDir, { GSD_CC_BUDGET: '1' }));

  assertAutoLoopSucceeded(result);

  const events = readEvents(projectDir);
  const budgetEvent = events.find((event) => event.type === 'budget_reached');
  assert.ok(budgetEvent, 'budget_reached event should be recorded');
  assert.strictEqual(budgetEvent.total_tokens, '4');
  assert.strictEqual(budgetEvent.budget, '1');
  assert.strictEqual(events[events.length - 1].type, 'auto_finished');
}

function testAutoLoopWritesTaskEvents() {
  const binDir = setupAutoLoopBin(`#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const gsdDir = path.join(process.cwd(), '.gsd');
const statePath = path.join(gsdDir, 'STATE.md');

function setPhase(phase) {
  const state = fs.readFileSync(statePath, 'utf8');
  fs.writeFileSync(statePath, state.replace(/^phase:.*$/m, 'phase: ' + phase));
}

if (prompt.includes('APPLY_PROMPT')) {
  setPhase('apply-complete');
}

if (prompt.includes('UNIFY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'S01-UNIFY.md'), '# Unified\\n');
  setPhase('unified');
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);

  const events = readEvents(projectDir);
  const started = events.find((event) => event.type === 'task_started');
  const completed = events.find((event) => event.type === 'task_completed');
  assert.ok(started, 'task_started event should be recorded');
  assert.ok(completed, 'task_completed event should be recorded');
  assert.strictEqual(started.attempt, '1');
  assert.strictEqual(started.task_plan, '.gsd/S01-T01-PLAN.xml');
  assert.strictEqual(started.artifact, '.gsd/S01-T01-PLAN.xml');
  assert.strictEqual(completed.attempt, '1');
  assert.strictEqual(completed.summary, '.gsd/S01-T01-SUMMARY.md');
  assert.strictEqual(completed.artifact, '.gsd/S01-T01-SUMMARY.md');
}

function testAutoLoopWritesApprovalRequiredEvent() {
  const binDir = setupAutoLoopBin(`#!/usr/bin/env node
console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  setTaskRisk(projectDir, 'high', 'Touches shared deployment behavior.');

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);

  const events = readEvents(projectDir);
  const approval = events.find((event) => event.type === 'approval_required');
  assert.ok(approval, 'approval_required event should be recorded');
  assert.strictEqual(approval.task_plan, '.gsd/S01-T01-PLAN.xml');
  assert.strictEqual(approval.request, '.gsd/APPROVAL-REQUEST.json');
  assert.strictEqual(approval.artifact, '.gsd/APPROVAL-REQUEST.json');
  assert.strictEqual(approval.risk_level, 'high');
  assert.match(approval.reasons, /risk high/);
  assert.ok(!events.some((event) => event.type === 'dispatch_started'));
}

function testAutoLoopWritesApprovalFoundEvent() {
  const binDir = setupAutoLoopBin(`#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const gsdDir = path.join(process.cwd(), '.gsd');
const statePath = path.join(gsdDir, 'STATE.md');

function setPhase(phase) {
  const state = fs.readFileSync(statePath, 'utf8');
  fs.writeFileSync(statePath, state.replace(/^phase:.*$/m, 'phase: ' + phase));
}

if (prompt.includes('APPLY_PROMPT')) {
  setPhase('apply-complete');
}

if (prompt.includes('UNIFY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'S01-UNIFY.md'), '# Unified\\n');
  setPhase('unified');
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  setTaskRisk(projectDir, 'high', 'Touches shared deployment behavior.');
  const fingerprint = taskPlanFingerprint(projectDir);
  writeApproval(projectDir, fingerprint);

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);

  const events = readEvents(projectDir);
  const approval = events.find((event) => event.type === 'approval_found');
  assert.ok(approval, 'approval_found event should be recorded');
  assert.strictEqual(approval.approval_log, '.gsd/APPROVALS.jsonl');
  assert.strictEqual(approval.fingerprint, fingerprint);
  assert.strictEqual(approval.risk_level, 'high');
  assert.match(approval.reasons, /risk high/);
  assert.ok(events.some((event) => event.type === 'task_completed'));
}

function testAutoLoopWritesFallbackCommitEvents() {
  const binDir = setupAutoLoopBin(`#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const projectDir = process.cwd();
const gsdDir = path.join(projectDir, '.gsd');
const statePath = path.join(gsdDir, 'STATE.md');

function setPhase(phase) {
  const state = fs.readFileSync(statePath, 'utf8');
  fs.writeFileSync(statePath, state.replace(/^phase:.*$/m, 'phase: ' + phase));
}

if (prompt.includes('APPLY_PROMPT')) {
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'src', 'fixture.txt'), 'changed by fake claude\\n');
  setPhase('apply-complete');
}

if (prompt.includes('UNIFY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'S01-UNIFY.md'), '# Unified\\n');
  setPhase('unified');
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`, { fakeGit: false });
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  writeFile(path.join(projectDir, 'src', 'fixture.txt'), 'baseline\n');

  runGit(projectDir, ['init']);
  runGit(projectDir, ['config', 'user.email', 'test@example.com']);
  runGit(projectDir, ['config', 'user.name', 'GSD Test']);
  runGit(projectDir, [
    'add',
    '.gsd/STATE.md',
    '.gsd/M001-ROADMAP.md',
    '.gsd/S01-PLAN.md',
    '.gsd/S01-T01-PLAN.xml',
    '.gsd/S01-T01-SUMMARY.md',
    '.claude/skills/auto/apply-instructions.txt',
    '.claude/skills/auto/plan-instructions.txt',
    '.claude/skills/auto/reassess-instructions.txt',
    '.claude/skills/auto/unify-instructions.txt',
    'src/fixture.txt'
  ]);
  runGit(projectDir, ['commit', '-m', 'baseline']);

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);

  const events = readEvents(projectDir);
  const started = events.find((event) => event.type === 'fallback_commit_started');
  const completed = events.find((event) => event.type === 'fallback_commit_completed');
  assert.ok(started, 'fallback_commit_started event should be recorded');
  assert.ok(completed, 'fallback_commit_completed event should be recorded');
  assert.strictEqual(started.summary, '.gsd/S01-T01-SUMMARY.md');
  assert.match(started.paths, /src\/fixture\.txt/);
  assert.match(started.paths, /\.gsd\/STATE\.md/);
  assert.strictEqual(completed.subject, 'feat(S01/T01): apply task');
  assert.match(completed.commit, /^[0-9a-f]+$/);
  assert.match(completed.paths, /src\/fixture\.txt/);
}

testWritesEscapedJsonLine();
testReadsContextFromStateWhenVariablesAreMissing();
testWriteFailureIsNonFatal();
testAutoLoopWritesLifecycleEventsInOrder();
testAutoLoopWritesDispatchFailureEvent();
testAutoLoopWritesBudgetReachedEvent();
testAutoLoopWritesTaskEvents();
testAutoLoopWritesApprovalRequiredEvent();
testAutoLoopWritesApprovalFoundEvent();
testAutoLoopWritesFallbackCommitEvents();
