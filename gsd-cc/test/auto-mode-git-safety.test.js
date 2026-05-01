const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  createAutoModeProject,
  runAutoLoop,
  writeFile,
  writeState
} = require('./helpers/auto-mode');
const {
  ensureFakeBin,
  writeFakeClaude,
  writeFakeDate,
  writeFakeJq
} = require('./helpers/fake-bin');
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

function makeEnv(binDir) {
  return {
    ...process.env,
    GSD_CC_DISABLE_TEE: '1',
    HOME: makeTempDir('gsd-cc-auto-git-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function setupBin() {
  const tempRoot = makeTempDir('gsd-cc-auto-git-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeDate(binDir);
  writeFakeJq(binDir);
  writeFakeClaude(binDir, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const projectDir = process.cwd();

if (prompt.includes('APPLY_PROMPT')) {
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'src', 'fixture.txt'), 'changed by fake claude\\n');
  const statePath = path.join(projectDir, '.gsd', 'STATE.md');
  const state = fs.readFileSync(statePath, 'utf8');
  fs.writeFileSync(statePath, state.replace(/^phase:.*$/m, 'phase: apply-complete'));
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  return binDir;
}

function createGitProject(summaryStatus = 'complete', taskName = 'Fixture task') {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });

  writeState(projectDir, {
    phase: 'plan-complete',
    auto_mode_scope: 'slice'
  });
  const taskPlanPath = path.join(projectDir, '.gsd', 'S01-T01-PLAN.xml');
  fs.writeFileSync(
    taskPlanPath,
    fs.readFileSync(taskPlanPath, 'utf8')
      .replace('<name>Fixture task</name>', `<name>${taskName}</name>`)
  );
  writeFile(path.join(projectDir, 'src', 'fixture.txt'), 'baseline\n');
  writeFile(path.join(projectDir, 'docs', 'unrelated.md'), 'baseline\n');
  writeFile(path.join(projectDir, '.gsd', 'S01-T01-SUMMARY.md'), [
    '## Status',
    summaryStatus,
    ''
  ].join('\n'));

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

  return projectDir;
}

function commitCount(projectDir) {
  const result = runGit(projectDir, ['rev-list', '--count', 'HEAD']);
  return Number(result.stdout.trim());
}

function statusLines(projectDir) {
  return runGit(projectDir, ['status', '--porcelain']).stdout
    .split('\n')
    .filter(Boolean);
}

function untrackedFiles(projectDir) {
  return runGit(projectDir, ['ls-files', '--others', '--exclude-standard']).stdout
    .split('\n')
    .filter(Boolean);
}

function lastCommitFiles(projectDir) {
  return runGit(projectDir, ['show', '--name-only', '--format=', 'HEAD']).stdout
    .split('\n')
    .filter(Boolean);
}

function lastCommitSubject(projectDir) {
  return runGit(projectDir, ['log', '-1', '--format=%s']).stdout.trim();
}

function lastCommitBody(projectDir) {
  return runGit(projectDir, ['log', '-1', '--format=%b']).stdout.trim();
}

function assertAutoLoopSucceeded(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function testUnrelatedDirtyWorktreeAborts(binDir) {
  const projectDir = createGitProject('complete');
  fs.appendFileSync(path.join(projectDir, 'docs', 'unrelated.md'), 'user edit\n');
  writeFile(path.join(projectDir, 'notes', 'untracked.txt'), 'user note\n');

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);
  assert.strictEqual(commitCount(projectDir), 1);
  assert.match(result.stdout, /Fallback commit aborted: unrelated changes detected/);
  assert.match(result.stdout, /docs\/unrelated.md/);
  assert.match(result.stdout, /notes\/untracked.txt/);
  assert.match(result.stdout, /Resolve or stash unrelated worktree changes/);

  const status = statusLines(projectDir).join('\n');
  assert.match(status, /docs\/unrelated.md/);
  assert.match(status, /src\/fixture.txt/);
  assert.ok(untrackedFiles(projectDir).includes('notes/untracked.txt'));
}

function testCompleteTaskCanFallbackCommit(binDir) {
  const projectDir = createGitProject('complete', 'Deutsche Aufgabe');
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);
  assert.strictEqual(commitCount(projectDir), 2);
  assert.match(result.stdout, /Fallback committed task-scoped changes/);
  assert.strictEqual(lastCommitSubject(projectDir), 'feat(S01/T01): apply task');
  assert.match(lastCommitBody(projectDir), /Auto-mode applied fallback Git handling/);

  const committedFiles = lastCommitFiles(projectDir);
  assert.ok(committedFiles.includes('src/fixture.txt'));
  assert.ok(committedFiles.includes('.gsd/STATE.md'));
  assert.ok(!committedFiles.includes('.gsd/COSTS.jsonl'));

  const status = statusLines(projectDir).join('\n');
  assert.match(status, /\?\? \.gsd\/COSTS\.jsonl/);
}

function testIncompleteSummariesDoNotCommit(binDir, summaryStatus) {
  const projectDir = createGitProject(summaryStatus);
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);
  assert.strictEqual(commitCount(projectDir), 1);
  assert.match(
    result.stdout,
    new RegExp(`status is '${summaryStatus}'`)
  );
}

const binDir = setupBin();

testUnrelatedDirtyWorktreeAborts(binDir);
testCompleteTaskCanFallbackCommit(binDir);
testIncompleteSummariesDoNotCommit(binDir, 'partial');
testIncompleteSummariesDoNotCommit(binDir, 'blocked');
