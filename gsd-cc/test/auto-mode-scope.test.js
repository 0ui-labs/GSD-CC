const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  createAutoModeProject,
  readStateField,
  runAutoLoop,
  writeFile,
  writePromptFiles,
  writeState
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

function makeEnv(binDir) {
  return {
    ...process.env,
    GSD_CC_DISABLE_TEE: '1',
    HOME: makeTempDir('gsd-cc-auto-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function writeScopeFakeClaude(binDir) {
  writeFakeClaude(binDir, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const gsdDir = path.join(process.cwd(), '.gsd');

function writeMarker(name) {
  fs.writeFileSync(path.join(gsdDir, name), 'marker\\n');
}

function setState(field, value) {
  const statePath = path.join(gsdDir, 'STATE.md');
  const content = fs.readFileSync(statePath, 'utf8');
  const pattern = new RegExp('^' + field + ':.*$', 'm');
  fs.writeFileSync(statePath, content.replace(pattern, field + ': ' + value));
}

let exitCode = 0;

if (prompt.includes('UNIFY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'S01-UNIFY.md'), '# Unified\\n');
  setState('phase', 'unified');
  writeMarker('unify.marker');
} else if (prompt.includes('REASSESS_PROMPT')) {
  writeMarker('reassess.marker');
} else if (prompt.includes('PLAN_PROMPT')) {
  writeMarker('S02-plan-dispatched.marker');
  fs.writeFileSync(path.join(gsdDir, 'S02-PLAN.md'), '# S02\\n');
  exitCode = 1;
} else if (prompt.includes('APPLY_PROMPT')) {
  writeMarker('apply-dispatched.marker');
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
process.exit(exitCode);
`);
}

function setupBin() {
  const tempRoot = makeTempDir('gsd-cc-auto-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeDate(binDir);
  writeFakeGit(binDir);
  writeFakeJq(binDir);
  writeScopeFakeClaude(binDir);
  return binDir;
}

function setupIllegalTransitionBin() {
  const tempRoot = makeTempDir('gsd-cc-auto-illegal-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeDate(binDir);
  writeFakeGit(binDir);
  writeFakeJq(binDir);
  writeFakeClaude(binDir, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const gsdDir = path.join(process.cwd(), '.gsd');
const statePath = path.join(gsdDir, 'STATE.md');
const state = fs.readFileSync(statePath, 'utf8');
fs.writeFileSync(statePath, state.replace(/^phase:.*$/m, 'phase: plan-complete'));
fs.writeFileSync(path.join(gsdDir, 'illegal-transition.marker'), 'marker\\n');

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  return binDir;
}

function assertRan(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function assertNoNextSliceWork(projectDir, result) {
  assert.strictEqual(readStateField(projectDir, 'current_slice'), 'S01');
  assert.ok(!fs.existsSync(path.join(projectDir, '.gsd', 'S02-plan-dispatched.marker')));
  assert.ok(!fs.existsSync(path.join(projectDir, '.gsd', 'reassess.marker')));
  assert.match(result.stdout, /Auto \(this slice\) complete/);
  assert.doesNotMatch(result.stdout, /Moving to next slice/);
}

function testSliceModeStopsAfterUnify(binDir) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'apply-complete',
      auto_mode_scope: 'slice'
    }
  });
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertRan(result);
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'S01-UNIFY.md')));
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'unify.marker')));
  assert.strictEqual(readStateField(projectDir, 'phase'), 'unified');
  assertNoNextSliceWork(projectDir, result);
}

function testAlreadyUnifiedSliceDoesNotAdvance(binDir) {
  const projectDir = createAutoModeProject({
    unified: true,
    state: {
      phase: 'unified',
      auto_mode_scope: 'slice'
    }
  });
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertRan(result);
  assertNoNextSliceWork(projectDir, result);
}

function testMissingScopeDefaultsToSlice(binDir) {
  const projectDir = createAutoModeProject({
    unified: true,
    state: {
      phase: 'unified',
      auto_mode_scope: undefined
    }
  });
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertRan(result);
  assert.match(result.stdout, /auto_mode_scope is missing; defaulting to slice mode/);
  assertNoNextSliceWork(projectDir, result);
}

function testInvalidScopeStopsBeforeWork(binDir) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'apply-complete',
      auto_mode_scope: 'everything'
    }
  });
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assert.ifError(result.error);
  assert.notStrictEqual(result.status, 0, 'invalid scope should stop auto-mode');
  assert.match(result.stdout, /Unsupported auto_mode_scope: everything/);
  assert.ok(!fs.existsSync(path.join(projectDir, '.gsd', 'unify.marker')));
}

function testValidEarlyStateStopsWithAutoHint(binDir) {
  const projectDir = makeTempDir('gsd-cc-auto-early-state-');
  writePromptFiles(projectDir);
  writeState(projectDir, {
    phase: 'seed-complete',
    current_slice: '-',
    current_task: '-',
    project_type: 'application',
    language: 'English',
    auto_mode_scope: 'slice'
  });
  writeFile(path.join(projectDir, '.gsd', 'PLANNING.md'), '# Planning\n');
  writeFile(path.join(projectDir, '.gsd', 'PROJECT.md'), '# Project\n');

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assert.ifError(result.error);
  assert.notStrictEqual(result.status, 0, 'early state should stop auto-mode');
  assert.match(result.stdout, /Auto-mode cannot run before a roadmap/);
  assert.doesNotMatch(result.stdout, /missing required field: current_task/);
}

function testMilestoneModeAdvances(binDir) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'apply-complete',
      auto_mode_scope: 'milestone'
    }
  });
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertRan(result);
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'reassess.marker')));
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'S02-plan-dispatched.marker')));
  assert.strictEqual(readStateField(projectDir, 'current_slice'), 'S02');
  assert.match(result.stdout, /Moving to next slice: S02/);
}

function testIllegalPostDispatchTransitionStops() {
  const binDir = setupIllegalTransitionBin();
  const projectDir = createAutoModeProject({
    state: {
      phase: 'apply-complete',
      auto_mode_scope: 'slice'
    }
  });
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assert.ifError(result.error);
  assert.notStrictEqual(result.status, 0, 'illegal transition should stop auto-mode');
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'illegal-transition.marker')));
  assert.match(result.stdout, /Illegal phase transition: apply-complete -> plan-complete/);
  assert.doesNotMatch(result.stdout, /Auto \(this slice\) complete/);
}

const binDir = setupBin();

testSliceModeStopsAfterUnify(binDir);
testAlreadyUnifiedSliceDoesNotAdvance(binDir);
testMissingScopeDefaultsToSlice(binDir);
testInvalidScopeStopsBeforeWork(binDir);
testValidEarlyStateStopsWithAutoHint(binDir);
testMilestoneModeAdvances(binDir);
testIllegalPostDispatchTransitionStops();
