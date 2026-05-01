const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  createAutoModeProject,
  runAutoLoop,
  writeFile,
  writePromptFiles,
  writeState
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
  packageRoot
} = require('./helpers/package-fixture');
const {
  makeTempDir
} = require('./helpers/temp');

function makeEnv(binDir, extra = {}) {
  return {
    ...process.env,
    ...extra,
    GSD_CC_DISABLE_TEE: '1',
    HOME: makeTempDir('gsd-cc-recovery-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function setupBin(claudeScript, options = {}) {
  const tempRoot = makeTempDir('gsd-cc-recovery-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeDate(binDir);
  writeFakeJq(binDir);
  if (options.fakeGit !== false) {
    writeFakeGit(binDir);
  }
  if (options.timeoutScript) {
    writeExecutable(binDir, 'timeout', options.timeoutScript);
  }
  writeFakeClaude(binDir, claudeScript || `#!/usr/bin/env node
console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  return binDir;
}

function recoveryJsonPath(projectDir) {
  return path.join(projectDir, '.gsd', 'auto-recovery.json');
}

function recoveryMarkdownPath(projectDir) {
  return path.join(projectDir, '.gsd', 'AUTO-RECOVERY.md');
}

function readRecovery(projectDir) {
  return JSON.parse(fs.readFileSync(recoveryJsonPath(projectDir), 'utf8'));
}

function assertRecovery(projectDir, reason) {
  assert.ok(fs.existsSync(recoveryMarkdownPath(projectDir)), 'recovery markdown should exist');
  assert.ok(fs.existsSync(recoveryJsonPath(projectDir)), 'recovery json should exist');
  const recovery = readRecovery(projectDir);
  assert.strictEqual(recovery.status, 'problem');
  assert.strictEqual(recovery.reason, reason);
  assert.ok(recovery.safe_next_action, 'safe_next_action should be recorded');
  return recovery;
}

function assertNoRecovery(projectDir) {
  assert.ok(!fs.existsSync(recoveryMarkdownPath(projectDir)), 'recovery markdown should not exist');
  assert.ok(!fs.existsSync(recoveryJsonPath(projectDir)), 'recovery json should not exist');
}

function assertSoftStop(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop should preserve soft-stop exit behavior\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
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
}

function testDispatchFailureWritesRecovery() {
  const binDir = setupBin(`#!/usr/bin/env node
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

  assertSoftStop(result);
  assert.match(result.stdout, /Dispatch failed/);
  const recovery = assertRecovery(projectDir, 'dispatch_failed');
  assert.strictEqual(recovery.unit, 'S01/T01');
  assert.strictEqual(recovery.dispatch_phase, 'apply');
}

function testTimeoutWritesRecovery() {
  const binDir = setupBin(null, {
    timeoutScript: '#!/bin/sh\nexit 124\n'
  });
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertSoftStop(result);
  assert.match(result.stdout, /Timeout after/);
  assertRecovery(projectDir, 'timeout');
}

function testMissingSummaryWritesRecovery() {
  const binDir = setupBin();
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  fs.unlinkSync(path.join(projectDir, '.gsd', 'S01-T01-SUMMARY.md'));

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertSoftStop(result);
  assert.match(result.stdout, /stuck after 2 attempts/);
  assertRecovery(projectDir, 'stuck_missing_summary');
}

function testMissingPlanWritesRecovery() {
  const binDir = setupBin();
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan',
      auto_mode_scope: 'slice'
    }
  });
  fs.unlinkSync(path.join(projectDir, '.gsd', 'S01-PLAN.md'));

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertSoftStop(result);
  assert.match(result.stdout, /Planning S01 stuck after 2 attempts/);
  assertRecovery(projectDir, 'stuck_missing_plan');
}

function testBudgetStopWritesRecovery() {
  const binDir = setupBin();
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

  assertSoftStop(result);
  assert.match(result.stdout, /Budget reached/);
  assertRecovery(projectDir, 'budget_reached');
}

function setupGitFallbackProject() {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  writeFile(path.join(projectDir, 'src', 'fixture.txt'), 'baseline\n');
  writeFile(path.join(projectDir, 'docs', 'unrelated.md'), 'baseline\n');

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
    'src/fixture.txt',
    'docs/unrelated.md'
  ]);
  runGit(projectDir, ['commit', '-m', 'baseline']);

  fs.appendFileSync(path.join(projectDir, 'docs', 'unrelated.md'), 'user edit\n');
  writeFile(path.join(projectDir, 'notes', 'untracked.txt'), 'user note\n');

  return projectDir;
}

function testGitSafetyStopWritesRecovery() {
  const binDir = setupBin(`#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectDir = process.cwd();
fs.writeFileSync(path.join(projectDir, 'src', 'fixture.txt'), 'changed by fake claude\\n');
const statePath = path.join(projectDir, '.gsd', 'STATE.md');
const state = fs.readFileSync(statePath, 'utf8');
fs.writeFileSync(statePath, state.replace(/^phase:.*$/m, 'phase: apply-complete'));

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`, { fakeGit: false });
  const projectDir = setupGitFallbackProject();

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertSoftStop(result);
  assert.match(result.stdout, /Fallback commit aborted: unrelated changes detected/);
  const recovery = assertRecovery(projectDir, 'git_safety_stop');
  assert.ok(recovery.uncommitted_files.includes('docs/unrelated.md'));
  assert.ok(recovery.uncommitted_files.includes('notes/untracked.txt'));
  const markdown = fs.readFileSync(recoveryMarkdownPath(projectDir), 'utf8');
  assert.match(markdown, /docs\/unrelated\.md/);
  assert.match(markdown, /notes\/untracked\.txt/);
}

function testInvalidStateWritesValidationRecovery() {
  const binDir = setupBin();
  const projectDir = makeTempDir('gsd-cc-recovery-invalid-state-');
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
  assert.notStrictEqual(result.status, 0, 'validation failure should keep non-zero exit');
  assert.match(result.stdout, /Auto-mode cannot run before a roadmap/);
  assertRecovery(projectDir, 'validation_failed');
}

function testSuccessfulSliceDoesNotWriteRecovery() {
  const binDir = setupBin(`#!/usr/bin/env node
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

  assertSoftStop(result);
  assert.match(result.stdout, /Auto \(this slice\) complete/);
  assertNoRecovery(projectDir);
}

function testAutoModeClearsStaleRecovery() {
  const binDir = setupBin();
  const projectDir = createAutoModeProject({
    unified: true,
    state: {
      phase: 'unified',
      auto_mode_scope: 'slice'
    }
  });
  writeFile(recoveryMarkdownPath(projectDir), '# stale\n');
  writeFile(recoveryJsonPath(projectDir), '{"status":"problem","reason":"stale"}\n');

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertSoftStop(result);
  assert.match(result.stdout, /Auto \(this slice\) complete/);
  assertNoRecovery(projectDir);
}

function testRecoveryHelpersWorkWithoutRuntimeTimestampFunction() {
  const binDir = setupBin();
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  const script = [
    'set -euo pipefail',
    `GSD_DIR=${JSON.stringify(path.join(projectDir, '.gsd'))}`,
    `source ${JSON.stringify(path.join(packageRoot, 'skills', 'auto', 'lib', 'recovery.sh'))}`,
    'auto_recovery_capture_start',
    'auto_recovery_write "manual_stop" "Manual recovery test."',
    ''
  ].join('\n');

  const result = spawnSync('bash', ['-c', script], {
    env: makeEnv(binDir),
    encoding: 'utf8'
  });

  assert.strictEqual(
    result.status,
    0,
    `recovery helper failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  const recovery = assertRecovery(projectDir, 'manual_stop');
  assert.strictEqual(recovery.started_at, '2026-01-01T00:00:00+00:00');
  assert.strictEqual(recovery.stopped_at, '2026-01-01T00:00:00+00:00');
}

testDispatchFailureWritesRecovery();
testTimeoutWritesRecovery();
testMissingSummaryWritesRecovery();
testMissingPlanWritesRecovery();
testBudgetStopWritesRecovery();
testGitSafetyStopWritesRecovery();
testInvalidStateWritesValidationRecovery();
testSuccessfulSliceDoesNotWriteRecovery();
testAutoModeClearsStaleRecovery();
testRecoveryHelpersWorkWithoutRuntimeTimestampFunction();
