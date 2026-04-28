const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  createAutoModeProject,
  runAutoLoop,
  writeFile
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
    HOME: makeTempDir('gsd-cc-auto-allowlist-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function writeAllowlistFakeClaude(binDir) {
  writeFakeClaude(binDir, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const allowedToolsIndex = process.argv.indexOf('--allowedTools');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const allowedTools = allowedToolsIndex >= 0 ? process.argv[allowedToolsIndex + 1] || '' : '';
const gsdDir = path.join(process.cwd(), '.gsd');

function setState(field, value) {
  const statePath = path.join(gsdDir, 'STATE.md');
  const content = fs.readFileSync(statePath, 'utf8');
  const pattern = new RegExp('^' + field + ':.*$', 'm');
  fs.writeFileSync(statePath, content.replace(pattern, field + ': ' + value));
}

let exitCode = 0;

if (prompt.includes('APPLY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'allowed-tools-apply.txt'), allowedTools);
  setState('phase', 'apply-complete');
} else if (prompt.includes('UNIFY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'allowed-tools-unify.txt'), allowedTools);
  fs.writeFileSync(path.join(gsdDir, 'S01-UNIFY.md'), '# Unified\\n');
  setState('phase', 'unified');
} else if (prompt.includes('PLAN_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'allowed-tools-plan.txt'), allowedTools);
  fs.writeFileSync(path.join(gsdDir, 'S02-PLAN.md'), '# S02\\n');
  exitCode = 1;
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
process.exit(exitCode);
`);
}

function setupBin() {
  const tempRoot = makeTempDir('gsd-cc-auto-allowlist-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeDate(binDir);
  writeFakeGit(binDir);
  writeFakeJq(binDir);
  writeAllowlistFakeClaude(binDir);
  return binDir;
}

function writeTaskPlan(projectDir, verifyCommand) {
  writeFile(path.join(projectDir, '.gsd', 'S01-T01-PLAN.xml'), [
    '<task id="S01-T01" type="auto">',
    '  <name>Fixture task</name>',
    '  <files>',
    '    src/fixture.txt',
    '  </files>',
    `  <verify>${verifyCommand}</verify>`,
    '</task>',
    ''
  ].join('\n'));
}

function readAllowedTools(projectDir, phase) {
  return fs.readFileSync(
    path.join(projectDir, '.gsd', `allowed-tools-${phase}.txt`),
    'utf8'
  );
}

function assertAutoLoopSucceeded(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function testApplyAllowlistUsesVerifyAndConfig(binDir) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  writeTaskPlan(projectDir, 'npm test -- --grep parser (AC-1)');
  writeFile(
    path.join(projectDir, '.gsd', 'CONFIG.md'),
    'auto_apply_allowed_bash: pnpm lint *, npm run typecheck *\n'
  );

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);
  assert.match(result.stdout, /Apply Bash allowlist additions:/);

  const allowedTools = readAllowedTools(projectDir, 'apply');
  assert.match(allowedTools, /Bash\(git add \*\)/);
  assert.match(allowedTools, /Bash\(git commit \*\)/);
  assert.match(allowedTools, /Bash\(npm test \*\)/);
  assert.match(allowedTools, /Bash\(pnpm lint \*\)/);
  assert.match(allowedTools, /Bash\(npm run typecheck \*\)/);
  assert.doesNotMatch(allowedTools, /Bash\(npm \*\)/);
  assert.doesNotMatch(allowedTools, /Bash\(npx \*\)/);
  assert.doesNotMatch(allowedTools, /Bash\(node \*\)/);
  assert.doesNotMatch(allowedTools, /Bash\(python3 \*\)/);
}

function testUnknownVerifyDoesNotAddBroadBash(binDir) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  writeTaskPlan(projectDir, 'bash scripts/test.sh (AC-1)');

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);
  const allowedTools = readAllowedTools(projectDir, 'apply');
  assert.doesNotMatch(allowedTools, /Bash\(bash \*\)/);
  assert.doesNotMatch(allowedTools, /Bash\(npm \*\)/);
  assert.doesNotMatch(allowedTools, /Bash\(npx \*\)/);
  assert.doesNotMatch(allowedTools, /Bash\(node \*\)/);
  assert.doesNotMatch(allowedTools, /Bash\(python3 \*\)/);
}

function testPlanAllowlistIsUnchanged(binDir) {
  const projectDir = createAutoModeProject({
    unified: true,
    state: {
      phase: 'unified',
      auto_mode_scope: 'milestone'
    }
  });

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertAutoLoopSucceeded(result);
  assert.strictEqual(
    readAllowedTools(projectDir, 'plan'),
    'Read,Write,Edit,Glob,Grep,Bash(git switch *),Bash(git checkout *),Bash(git branch *),Bash(git add *),Bash(git commit *)'
  );
}

const binDir = setupBin();

testApplyAllowlistUsesVerifyAndConfig(binDir);
testUnknownVerifyDoesNotAddBroadBash(binDir);
testPlanAllowlistIsUnchanged(binDir);
