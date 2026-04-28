const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { makeTempDir } = require('./helpers/temp');

const packageRoot = path.resolve(__dirname, '..');
const validator = path.join(packageRoot, 'scripts', 'validate-plan.js');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeProject() {
  const projectDir = makeTempDir('gsd-cc-plan-validator-');
  fs.mkdirSync(path.join(projectDir, '.gsd'), { recursive: true });
  return projectDir;
}

function slicePlan(projectDir, options = {}) {
  const dependencies = options.dependencies === undefined
    ? 'T01 -> T02'
    : options.dependencies;
  const content = [
    '# S01 - Fixture Slice',
    '',
    '## Overview',
    'Validate generated task plans.',
    '',
    '## Tasks',
    '',
    '| Task | Name | Files | ACs |',
    '|------|------|-------|-----|',
    '| T01 | First task | 1 | 1 |',
    '| T02 | Second task | 1 | 1 |',
    '',
    '## Dependencies',
    dependencies,
    ''
  ].join('\n');
  writeFile(path.join(projectDir, '.gsd', 'S01-PLAN.md'), content);
}

function taskPlan(projectDir, task, options = {}) {
  const acId = options.acId || `AC-${Number(task.slice(1))}`;
  const files = options.files || [`src/${task.toLowerCase()}.txt`];
  const action = options.action || `1. Update ${files[0]}`;
  const verify = options.verify || `npm test (${acId})`;
  const name = options.name || `${task} fixture task`;
  const done = options.done || `${task} is complete.`;

  writeFile(path.join(projectDir, '.gsd', `S01-${task}-PLAN.xml`), [
    `<task id="S01-${task}" type="auto">`,
    `  <name>${name}</name>`,
    '  <files>',
    ...files.map((filePath) => `    ${filePath}`),
    '  </files>',
    '  <acceptance_criteria>',
    `    <ac id="${acId}">`,
    '      Given the fixture baseline exists',
    '      When the task runs',
    '      Then the fixture is updated',
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
  ].join('\n'));
}

function validProject(options = {}) {
  const projectDir = makeProject();
  slicePlan(projectDir, { dependencies: options.dependencies });
  taskPlan(projectDir, 'T01', {
    files: options.t01Files || ['src/shared.txt'],
    action: options.t01Action,
    name: options.t01Name,
    done: options.t01Done
  });
  taskPlan(projectDir, 'T02', {
    files: options.t02Files || ['src/second.txt'],
    action: options.t02Action,
    verify: options.t02Verify,
    name: options.t02Name,
    done: options.t02Done
  });
  return projectDir;
}

function runValidator(projectDir, args) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: projectDir,
    encoding: 'utf8'
  });
}

function assertPass(result) {
  assert.strictEqual(
    result.status,
    0,
    `expected validator to pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function assertFail(result, pattern) {
  assert.notStrictEqual(result.status, 0, 'expected validator to fail');
  assert.match(result.stdout + result.stderr, pattern);
}

function testValidSliceWithTwoTasksPasses() {
  const projectDir = validProject();
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertPass(result);
  assert.match(result.stdout, /Plan valid/);
}

function testSingleTaskPlanPasses() {
  const projectDir = validProject();
  const result = runValidator(projectDir, ['.gsd/S01-T01-PLAN.xml']);
  assertPass(result);
}

function testLegacyMarkdownTaskPlanFails() {
  const projectDir = makeProject();
  slicePlan(projectDir);
  writeFile(path.join(projectDir, '.gsd', 'S01-T01-PLAN.md'), '# Legacy task\n');
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertFail(result, /slice\.legacy_task_plan/);
}

function testMissingTaskXmlFails() {
  const projectDir = makeProject();
  slicePlan(projectDir);
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertFail(result, /slice\.taskPlans\.missing/);
}

function testTooManyTasksFail() {
  const projectDir = makeProject();
  slicePlan(projectDir);
  for (let index = 1; index <= 8; index += 1) {
    taskPlan(projectDir, `T0${index}`, {
      acId: `AC-${index}`,
      files: [`src/task-${index}.txt`]
    });
  }
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertFail(result, /slice\.taskPlans\.too_many/);
}

function testPlaceholderTodoLaterFieldsFail() {
  const projectDir = validProject({
    t01Files: ['{{FILE}}'],
    t01Action: '1. TODO update fixture',
    t02Done: 'Finish this later.'
  });
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertFail(result, /task\.files\.placeholder/);
  assertFail(result, /task\.unresolved\.action/);
  assertFail(result, /task\.unresolved\.done/);
}

function testInvalidFileEntriesFail() {
  const projectDir = validProject({
    t01Files: ['src/*.js'],
    t02Files: ['/tmp/outside.txt']
  });
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertFail(result, /task\.files\.invalid_path/);
}

function testTooBroadTaskFails() {
  const files = Array.from({ length: 16 }, (_, index) => `src/file-${index}.txt`);
  const projectDir = validProject({
    t01Files: files
  });
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertFail(result, /task\.too_broad/);
}

function testDuplicateOwnershipFailsWithoutDependencies() {
  const projectDir = validProject({
    dependencies: '',
    t01Files: ['src/shared.txt'],
    t02Files: ['src/shared.txt']
  });
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertFail(result, /slice\.files\.duplicate_ownership/);
}

function testDuplicateOwnershipPassesWithExplicitDependencies() {
  const projectDir = validProject({
    dependencies: 'T01 -> T02',
    t01Files: ['src/shared.txt'],
    t02Files: ['src/shared.txt']
  });
  const result = runValidator(projectDir, ['.gsd/S01-PLAN.md']);
  assertPass(result);
}

function testJsonOutputHasStableErrors() {
  const projectDir = validProject({
    t01Files: ['src/*.js']
  });
  const result = runValidator(projectDir, ['--json', '.gsd/S01-PLAN.md']);
  assert.notStrictEqual(result.status, 0, 'expected validator to fail');
  const payload = JSON.parse(result.stdout);
  assert.strictEqual(payload.valid, false);
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((error) => {
    return error.code === 'task.files.invalid_path' &&
      error.file === '.gsd/S01-T01-PLAN.xml' &&
      /concrete repo-relative/.test(error.message);
  }));
}

testValidSliceWithTwoTasksPasses();
testSingleTaskPlanPasses();
testLegacyMarkdownTaskPlanFails();
testMissingTaskXmlFails();
testTooManyTasksFail();
testPlaceholderTodoLaterFieldsFail();
testInvalidFileEntriesFail();
testTooBroadTaskFails();
testDuplicateOwnershipFailsWithoutDependencies();
testDuplicateOwnershipPassesWithExplicitDependencies();
testJsonOutputHasStableErrors();
