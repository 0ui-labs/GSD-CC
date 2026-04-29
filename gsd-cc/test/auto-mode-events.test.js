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

function setupAutoLoopBin(claudeScript) {
  const tempRoot = makeTempDir('gsd-cc-auto-events-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeDate(binDir);
  writeFakeGit(binDir);
  writeFakeJq(binDir);
  writeFakeClaude(binDir, claudeScript);
  return binDir;
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
  assert.deepStrictEqual(types.slice(0, 5), [
    'auto_started',
    'slice_started',
    'phase_started',
    'dispatch_started',
    'dispatch_failed'
  ]);
  assert.strictEqual(events[4].dispatch_phase, 'apply');
  assert.strictEqual(events[4].exit_code, '42');
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

testWritesEscapedJsonLine();
testReadsContextFromStateWhenVariablesAreMissing();
testWriteFailureIsNonFatal();
testAutoLoopWritesLifecycleEventsInOrder();
testAutoLoopWritesDispatchFailureEvent();
testAutoLoopWritesBudgetReachedEvent();
