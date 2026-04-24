const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  createAutoModeProject,
  readStateField,
  runAutoLoop,
  writeFile
} = require('./helpers/auto-mode');
const {
  ensureFakeBin,
  writeFakeClaude,
  writeFakeDate,
  writeFakeJq
} = require('./helpers/fake-bin');
const {
  packageRoot
} = require('./helpers/package-fixture');
const {
  makeTempDir
} = require('./helpers/temp');

function runGit(projectDir, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: projectDir,
    env: process.env,
    encoding: 'utf8'
  });

  if (!options.allowFailure) {
    assert.strictEqual(
      result.status,
      0,
      `git ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return result;
}

function makeEnv(binDir, extra = {}) {
  return {
    ...process.env,
    ...extra,
    GSD_CC_DISABLE_TEE: '1',
    HOME: makeTempDir('gsd-cc-base-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function setupBin() {
  const tempRoot = makeTempDir('gsd-cc-base-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeDate(binDir);
  writeFakeJq(binDir);
  writeFakeClaude(binDir, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const gsdDir = path.join(process.cwd(), '.gsd');

if (prompt.includes('PLAN_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'plan-dispatched.marker'), 'marker\\n');
  process.exit(1);
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  return binDir;
}

function createPlanningProject(state = {}) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan',
      auto_mode_scope: 'slice',
      ...state
    }
  });

  writeFile(path.join(projectDir, '.gsd', 'PROJECT.md'), '# Project\n');
  writeFile(path.join(projectDir, 'src', 'baseline.txt'), 'baseline\n');
  writeFile(path.join(projectDir, 'docs', 'notes.md'), 'baseline\n');

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
    '.gsd/PROJECT.md',
    '.claude/skills/auto/apply-instructions.txt',
    '.claude/skills/auto/plan-instructions.txt',
    '.claude/skills/auto/reassess-instructions.txt',
    '.claude/skills/auto/unify-instructions.txt',
    'src/baseline.txt',
    'docs/notes.md'
  ]);
  runGit(projectDir, ['commit', '-m', 'baseline']);

  return projectDir;
}

function renameCurrentBranch(projectDir, branchName) {
  runGit(projectDir, ['branch', '-M', branchName]);
}

function setOriginHead(projectDir, branchName) {
  runGit(projectDir, ['update-ref', `refs/remotes/origin/${branchName}`, 'HEAD']);
  runGit(projectDir, [
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    `refs/remotes/origin/${branchName}`
  ]);
}

function currentBranch(projectDir) {
  return runGit(projectDir, ['branch', '--show-current']).stdout.trim();
}

function branchExists(projectDir, branchName) {
  return runGit(
    projectDir,
    ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
    { allowFailure: true }
  ).status === 0;
}

function assertBranchContains(projectDir, branchName, filePath) {
  const result = runGit(projectDir, ['show', `${branchName}:${filePath}`]);
  assert.ok(result.stdout.length > 0, `${branchName} should contain ${filePath}`);
}

function assertAutoLoopStoppedAfterPlanDispatch(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop should stop cleanly after fake plan dispatch\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(result.stdout, /Dispatch failed/);
}

function testRemoteDefaultBranchIsRecorded(binDir) {
  const projectDir = createPlanningProject();
  renameCurrentBranch(projectDir, 'develop');
  setOriginHead(projectDir, 'develop');

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopStoppedAfterPlanDispatch(result);
  assert.strictEqual(readStateField(projectDir, 'base_branch'), 'develop');
  assert.strictEqual(currentBranch(projectDir), 'gsd/M001/S01');
  assert.ok(branchExists(projectDir, 'develop'));
  assert.ok(!branchExists(projectDir, 'main'));
}

function testLocalMasterIsDetected(binDir) {
  const projectDir = createPlanningProject();
  renameCurrentBranch(projectDir, 'master');

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopStoppedAfterPlanDispatch(result);
  assert.strictEqual(readStateField(projectDir, 'base_branch'), 'master');
  assert.strictEqual(currentBranch(projectDir), 'gsd/M001/S01');
  assert.ok(!branchExists(projectDir, 'main'));
}

function testExistingStateValueWins(binDir) {
  const projectDir = createPlanningProject({ base_branch: 'develop' });
  renameCurrentBranch(projectDir, 'main');
  runGit(projectDir, ['switch', '-c', 'develop']);
  writeFile(path.join(projectDir, 'src', 'develop-only.txt'), 'develop\n');
  runGit(projectDir, ['add', 'src/develop-only.txt']);
  runGit(projectDir, ['commit', '-m', 'develop marker']);
  runGit(projectDir, ['switch', 'main']);

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopStoppedAfterPlanDispatch(result);
  assert.strictEqual(readStateField(projectDir, 'base_branch'), 'develop');
  assert.strictEqual(currentBranch(projectDir), 'gsd/M001/S01');
  assertBranchContains(projectDir, 'gsd/M001/S01', 'src/develop-only.txt');
}

function testEnvironmentOverrideIsRecorded(binDir) {
  const projectDir = createPlanningProject();
  renameCurrentBranch(projectDir, 'main');
  runGit(projectDir, ['switch', '-c', 'trunk']);
  writeFile(path.join(projectDir, 'src', 'trunk-only.txt'), 'trunk\n');
  runGit(projectDir, ['add', 'src/trunk-only.txt']);
  runGit(projectDir, ['commit', '-m', 'trunk marker']);
  runGit(projectDir, ['switch', 'main']);

  const result = runAutoLoop(
    projectDir,
    makeEnv(binDir, { GSD_CC_BASE_BRANCH: 'trunk' })
  );

  assertAutoLoopStoppedAfterPlanDispatch(result);
  assert.strictEqual(readStateField(projectDir, 'base_branch'), 'trunk');
  assert.strictEqual(currentBranch(projectDir), 'gsd/M001/S01');
  assertBranchContains(projectDir, 'gsd/M001/S01', 'src/trunk-only.txt');
}

function testDirtyWorktreePreventsPlanBranchSwitch(binDir) {
  const projectDir = createPlanningProject();
  renameCurrentBranch(projectDir, 'main');
  fs.appendFileSync(path.join(projectDir, 'docs', 'notes.md'), 'user edit\n');

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assert.ifError(result.error);
  assert.notStrictEqual(result.status, 0, 'dirty worktree should stop planning');
  assert.match(result.stdout, /Cannot prepare planning branch/);
  assert.match(result.stdout, /docs\/notes.md/);
  assert.strictEqual(currentBranch(projectDir), 'main');
  assert.ok(!branchExists(projectDir, 'gsd/M001/S01'));
}

function testGitWorkflowTextAvoidsOperationalMain() {
  const files = [
    'skills/plan/SKILL.md',
    'skills/apply/SKILL.md',
    'skills/unify/SKILL.md',
    'skills/auto/plan-instructions.txt',
    'skills/auto/unify-instructions.txt',
    'skills/auto/auto-loop.sh'
  ];
  const combined = files
    .map((file) => fs.readFileSync(path.join(packageRoot, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(combined, /git checkout main/);
  assert.doesNotMatch(combined, /git switch main/);
  assert.doesNotMatch(combined, /back to main/i);
  assert.doesNotMatch(combined, /-> main/);
  assert.doesNotMatch(combined, /to main with a squash/i);
}

const binDir = setupBin();

testRemoteDefaultBranchIsRecorded(binDir);
testLocalMasterIsDetected(binDir);
testExistingStateValueWins(binDir);
testEnvironmentOverrideIsRecorded(binDir);
testDirtyWorktreePreventsPlanBranchSwitch(binDir);
testGitWorkflowTextAvoidsOperationalMain();
