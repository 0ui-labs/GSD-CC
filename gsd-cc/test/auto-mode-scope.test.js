const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  createAutoModeProject,
  readStateField,
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

const binDir = setupBin();

testSliceModeStopsAfterUnify(binDir);
testAlreadyUnifiedSliceDoesNotAdvance(binDir);
testMissingScopeDefaultsToSlice(binDir);
testInvalidScopeStopsBeforeWork(binDir);
testMilestoneModeAdvances(binDir);
