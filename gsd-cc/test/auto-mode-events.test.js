const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  packageRoot
} = require('./helpers/package-fixture');
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

testWritesEscapedJsonLine();
testReadsContextFromStateWhenVariablesAreMissing();
testWriteFailureIsNonFatal();
