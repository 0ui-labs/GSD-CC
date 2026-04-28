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
    HOME: makeTempDir('gsd-cc-plan-validation-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function setupBin() {
  const tempRoot = makeTempDir('gsd-cc-plan-validation-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeDate(binDir);
  writeFakeGit(binDir);
  writeFakeJq(binDir);
  writeFakeClaude(binDir, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const promptIndex = process.argv.indexOf('-p');
const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] || '' : '';
const gsdDir = path.join(process.cwd(), '.gsd');

function setState(field, value) {
  const statePath = path.join(gsdDir, 'STATE.md');
  const content = fs.readFileSync(statePath, 'utf8');
  const pattern = new RegExp('^' + field + ':.*$', 'm');
  fs.writeFileSync(statePath, content.replace(pattern, field + ': ' + value));
}

function writeValidTaskPlan(slice, task, acId) {
  fs.writeFileSync(path.join(gsdDir, slice + '-' + task + '-PLAN.xml'), [
    '<task id="' + slice + '-' + task + '" type="auto">',
    '  <name>Generated task</name>',
    '  <files>',
    '    src/generated.txt',
    '  </files>',
    '  <risk level="low">',
    '    Isolated generated fixture change.',
    '  </risk>',
    '  <acceptance_criteria>',
    '    <ac id="' + acId + '">',
    '      Given a generated plan exists',
    '      When auto-mode validates it',
    '      Then apply can start',
    '    </ac>',
    '  </acceptance_criteria>',
    '  <action>',
    '    1. Update src/generated.txt',
    '  </action>',
    '  <boundaries>',
    '    No boundary restrictions for this task.',
    '  </boundaries>',
    '  <verify>npm test (' + acId + ')</verify>',
    '  <done>The generated task is complete.</done>',
    '</task>',
    ''
  ].join('\\n'));
}

if (prompt.includes('APPLY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'apply-dispatched.marker'), 'marker\\n');
  setState('phase', 'apply-complete');
} else if (prompt.includes('UNIFY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'S01-UNIFY.md'), '# Unified\\n');
  setState('phase', 'unified');
} else if (prompt.includes('PLAN_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'S02-plan-dispatched.marker'), 'marker\\n');
  fs.writeFileSync(path.join(gsdDir, 'S02-PLAN.md'), '# S02\\n');
  writeValidTaskPlan('S02', 'T01', 'AC-1');
  fs.appendFileSync(path.join(gsdDir, 'S02-T01-PLAN.xml'), '<!-- invalid marker -->\\n');
  const planPath = path.join(gsdDir, 'S02-T01-PLAN.xml');
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace('type="auto"', 'type="manual"'));
  setState('phase', 'plan-complete');
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  return binDir;
}

function writeTaskPlan(projectDir, options = {}) {
  const slice = options.slice || 'S01';
  const task = options.task || 'T01';
  const id = options.id === undefined ? `${slice}-${task}` : options.id;
  const type = options.type === undefined ? 'auto' : options.type;
  const acId = options.acId || 'AC-1';
  const verify = options.verify || `npm test (${acId})`;
  const files = options.files === undefined ? ['src/fixture.txt'] : options.files;
  const includeFiles = options.includeFiles !== false;
  const includeThen = options.includeThen !== false;
  const action = options.action || '1. Update src/fixture.txt';
  const name = options.name || 'Fixture task';
  const done = options.done || 'The fixture task is complete.';
  const riskLevel = options.riskLevel || 'low';
  const riskText = options.riskText || 'Isolated fixture change with focused verification.';

  const lines = [
    `<task id="${id}" type="${type}">`,
    `  <name>${name}</name>`
  ];

  if (includeFiles) {
    lines.push('  <files>');
    for (const filePath of files) {
      lines.push(`    ${filePath}`);
    }
    lines.push('  </files>');
  }

  lines.push(
    `  <risk level="${riskLevel}">`,
    `    ${riskText}`,
    '  </risk>',
    '  <acceptance_criteria>',
    `    <ac id="${acId}">`,
    '      Given the fixture baseline exists',
    '      When the task runs'
  );
  if (includeThen) {
    lines.push('      Then the fixture is updated');
  }
  lines.push(
    '    </ac>',
    '  </acceptance_criteria>',
    '  <action>',
    `    ${action}`,
    '  </action>',
    '  <boundaries>',
    '    No boundary restrictions for this task.',
    '  </boundaries>',
    `  <verify>${verify}</verify>`,
    `  <done>${done}</done>`,
    '</task>',
    ''
  );

  writeFile(path.join(projectDir, '.gsd', `${slice}-${task}-PLAN.xml`), lines.join('\n'));
}

function runValidationProject(binDir, options = {}) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });

  if (options.config) {
    writeFile(path.join(projectDir, '.gsd', 'CONFIG.md'), options.config);
  }
  writeTaskPlan(projectDir, options.plan || {});

  return {
    projectDir,
    result: runAutoLoop(projectDir, makeEnv(binDir))
  };
}

function assertInvalidPlan(result, projectDir, pattern) {
  assert.ifError(result.error);
  assert.notStrictEqual(result.status, 0, 'invalid plan should stop auto-mode');
  assert.match(result.stdout, /Invalid task plan:/);
  assert.match(result.stdout, pattern);
  assert.match(result.stdout, /Run \/gsd-cc-plan/);
  assert.ok(!fs.existsSync(path.join(projectDir, '.gsd', 'apply-dispatched.marker')));
}

function assertAutoLoopSucceeded(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function testValidPlanDispatchesApply(binDir) {
  const { projectDir, result } = runValidationProject(binDir);

  assertAutoLoopSucceeded(result);
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'apply-dispatched.marker')));
}

function testMissingFilesStopsBeforeDispatch(binDir) {
  const { projectDir, result } = runValidationProject(binDir, {
    plan: { includeFiles: false }
  });

  assertInvalidPlan(result, projectDir, /files must exist and be non-empty/);
}

function testInvalidFilePathsStopBeforeDispatch(binDir) {
  const placeholder = runValidationProject(binDir, {
    plan: { files: ['{{FILE}}'] }
  });
  assertInvalidPlan(placeholder.result, placeholder.projectDir, /placeholder path/);

  const absolute = runValidationProject(binDir, {
    plan: { files: ['/tmp/fixture.txt'] }
  });
  assertInvalidPlan(absolute.result, absolute.projectDir, /repo-relative path/);

  const wildcard = runValidationProject(binDir, {
    plan: { files: ['src/*.js'] }
  });
  assertInvalidPlan(wildcard.result, wildcard.projectDir, /repo-relative path/);
}

function testManualTaskStopsBeforeDispatch(binDir) {
  const { projectDir, result } = runValidationProject(binDir, {
    plan: { type: 'manual' }
  });

  assertInvalidPlan(result, projectDir, /task type must be auto/);
}

function testDuplicateAcIdStopsBeforeDispatch(binDir) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  writeTaskPlan(projectDir, { task: 'T01', acId: 'AC-1', files: ['src/one.txt'] });
  writeTaskPlan(projectDir, { task: 'T02', acId: 'AC-1', files: ['src/two.txt'] });

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assertInvalidPlan(result, projectDir, /duplicate AC id in slice: AC-1/);
}

function testAcWithoutBddStopsBeforeDispatch(binDir) {
  const { projectDir, result } = runValidationProject(binDir, {
    plan: { includeThen: false }
  });

  assertInvalidPlan(result, projectDir, /Given, When, and Then/);
}

function testVerifyUnknownAcStopsBeforeDispatch(binDir) {
  const { projectDir, result } = runValidationProject(binDir, {
    plan: { verify: 'npm test (AC-2)' }
  });

  assertInvalidPlan(result, projectDir, /verify references unknown AC-2/);
}

function testUnknownVerifyCommandStopsWithoutConfig(binDir) {
  const { projectDir, result } = runValidationProject(binDir, {
    plan: { verify: 'bash scripts/test.sh (AC-1)' }
  });

  assertInvalidPlan(result, projectDir, /verify command is not allowed/);
}

function testUnknownVerifyCommandRunsWithConfig(binDir) {
  const { projectDir, result } = runValidationProject(binDir, {
    config: 'auto_apply_allowed_bash: bash scripts/test.sh\n',
    plan: { verify: 'bash scripts/test.sh (AC-1)' }
  });

  assertAutoLoopSucceeded(result);
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'apply-dispatched.marker')));
}

function testUnresolvedActionStopsBeforeDispatch(binDir) {
  const { projectDir, result } = runValidationProject(binDir, {
    plan: { action: '1. TODO update fixture' }
  });

  assertInvalidPlan(result, projectDir, /action contains TODO, TBD, or later/);
}

function testInvalidRiskStopsBeforeDispatch(binDir) {
  const invalidLevel = runValidationProject(binDir, {
    plan: { riskLevel: 'critical' }
  });
  assertInvalidPlan(invalidLevel.result, invalidLevel.projectDir, /risk level must be low, medium, or high/);

  const unresolved = runValidationProject(binDir, {
    plan: { riskText: 'Review this risk later.' }
  });
  assertInvalidPlan(unresolved.result, unresolved.projectDir, /risk contains TODO, TBD, or later/);
}

function testTooBroadTaskStopsBeforeDispatch(binDir) {
  const files = Array.from({ length: 16 }, (_, index) => `src/file-${index}.txt`);
  const { projectDir, result } = runValidationProject(binDir, {
    plan: { files }
  });

  assertInvalidPlan(result, projectDir, /task owns 16 files/);
}

function testDuplicateOwnershipStopsWithoutSequencing(binDir) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: 'slice'
    }
  });
  writeFile(path.join(projectDir, '.gsd', 'S01-PLAN.md'), [
    '# S01',
    '',
    '## Dependencies',
    ''
  ].join('\n'));
  writeTaskPlan(projectDir, { task: 'T01', acId: 'AC-1', files: ['src/shared.txt'] });
  writeTaskPlan(projectDir, { task: 'T02', acId: 'AC-2', files: ['src/shared.txt'] });

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assert.ifError(result.error);
  assert.notStrictEqual(result.status, 0, 'duplicate ownership should stop auto-mode');
  assert.match(result.stdout, /Invalid slice plan:/);
  assert.match(result.stdout, /owned by multiple tasks/);
  assert.ok(!fs.existsSync(path.join(projectDir, '.gsd', 'apply-dispatched.marker')));
}

function testMilestoneModeValidatesAfterPlanDispatch(binDir) {
  const projectDir = createAutoModeProject({
    unified: true,
    state: {
      phase: 'unified',
      auto_mode_scope: 'milestone'
    }
  });

  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assert.ifError(result.error);
  assert.notStrictEqual(result.status, 0, 'invalid generated plan should stop auto-mode');
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'S02-plan-dispatched.marker')));
  assert.ok(!fs.existsSync(path.join(projectDir, '.gsd', 'apply-dispatched.marker')));
  assert.match(result.stdout, /Invalid task plan: \.gsd\/S02-T01-PLAN\.xml/);
  assert.match(result.stdout, /task type must be auto/);
}

const binDir = setupBin();

testValidPlanDispatchesApply(binDir);
testMissingFilesStopsBeforeDispatch(binDir);
testInvalidFilePathsStopBeforeDispatch(binDir);
testManualTaskStopsBeforeDispatch(binDir);
testDuplicateAcIdStopsBeforeDispatch(binDir);
testAcWithoutBddStopsBeforeDispatch(binDir);
testVerifyUnknownAcStopsBeforeDispatch(binDir);
testUnknownVerifyCommandStopsWithoutConfig(binDir);
testUnknownVerifyCommandRunsWithConfig(binDir);
testUnresolvedActionStopsBeforeDispatch(binDir);
testInvalidRiskStopsBeforeDispatch(binDir);
testTooBroadTaskStopsBeforeDispatch(binDir);
testDuplicateOwnershipStopsWithoutSequencing(binDir);
testMilestoneModeValidatesAfterPlanDispatch(binDir);
