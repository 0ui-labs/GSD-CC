const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  makeTempDir
} = require('./helpers/temp');
const {
  writeFile
} = require('./helpers/auto-mode');
const {
  loadStateMachine,
  validateState,
  validateTransition
} = require('./helpers/state-machine');
const {
  packageRoot
} = require('./helpers/package-fixture');

function writeState(projectDir, fields) {
  const lines = Object.entries(fields).map(([field, value]) => `${field}: ${value}`);
  writeFile(path.join(projectDir, '.gsd', 'STATE.md'), `${lines.join('\n')}\n`);
}

function validationErrors(projectDir, fields, files = []) {
  writeState(projectDir, fields);
  for (const filePath of files) {
    writeFile(path.join(projectDir, filePath), 'fixture\n');
  }
  return validateState(projectDir).errors;
}

function assertValid(projectDir, fields, files = []) {
  const errors = validationErrors(projectDir, fields, files);
  assert.deepStrictEqual(errors, []);
}

function assertInvalid(projectDir, fields, expectedPattern, files = []) {
  const errors = validationErrors(projectDir, fields, files);
  assert.match(errors.join('\n'), expectedPattern);
}

function extractRouterPhases() {
  const router = fs.readFileSync(path.join(packageRoot, 'skills', 'gsd-cc', 'SKILL.md'), 'utf8');
  const phases = new Set();
  const patterns = [
    /\bphase:\s*([a-z][a-z0-9-]+)/g,
    /\bphase is "([a-z][a-z0-9-]+)"/g,
    /\bphase to "([a-z][a-z0-9-]+)"/g,
    /\bset phase to "([a-z][a-z0-9-]+)"/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(router)) !== null) {
      phases.add(match[1]);
    }
  }

  return [...phases].sort();
}

function testSpecContainsExpectedPhases() {
  const spec = loadStateMachine();
  const expected = [
    'seed',
    'seed-complete',
    'stack-complete',
    'roadmap-complete',
    'discuss-complete',
    'plan',
    'plan-complete',
    'applying',
    'apply-blocked',
    'apply-complete',
    'unify-failed',
    'unify-blocked',
    'unified',
    'milestone-complete'
  ];

  for (const phase of expected) {
    assert.ok(spec.phases[phase], `${phase} should exist in STATE_MACHINE.json`);
  }
}

function testEarlyPhasesAllowEmptySliceAndTask() {
  const seedProject = makeTempDir('gsd-cc-state-seed-');
  assertValid(seedProject, {
    phase: 'seed-complete',
    current_slice: '-',
    current_task: '-',
    rigor: 'standard',
    project_type: 'application',
    language: 'English'
  }, [
    '.gsd/PLANNING.md',
    '.gsd/PROJECT.md'
  ]);

  const stackProject = makeTempDir('gsd-cc-state-stack-');
  assertValid(stackProject, {
    phase: 'stack-complete',
    current_slice: '-',
    current_task: '-',
    rigor: 'standard',
    project_type: 'application',
    language: 'English'
  }, [
    '.gsd/PLANNING.md',
    '.gsd/PROJECT.md',
    '.gsd/STACK.md'
  ]);
}

function testExecutionPhasesRequireActiveState() {
  assertInvalid(makeTempDir('gsd-cc-state-invalid-task-'), {
    phase: 'plan-complete',
    milestone: 'M001',
    current_slice: 'S01',
    current_task: '-',
    rigor: 'standard'
  }, /missing required field: current_task/, [
    '.gsd/S01-PLAN.md',
    '.gsd/S01-T01-PLAN.xml'
  ]);

  assertInvalid(makeTempDir('gsd-cc-state-invalid-artifact-'), {
    phase: 'applying',
    milestone: 'M001',
    current_slice: 'S01',
    current_task: 'T01',
    rigor: 'standard'
  }, /missing required artifact: \.gsd\/S01-T01-PLAN\.xml/, [
    '.gsd/S01-PLAN.md'
  ]);

  assertInvalid(makeTempDir('gsd-cc-state-invalid-blocked-'), {
    phase: 'apply-blocked',
    milestone: 'M001',
    current_slice: 'S01',
    current_task: 'T01',
    rigor: 'standard'
  }, /missing required field: blocked_reason/, [
    '.gsd/S01-T01-PLAN.xml',
    '.gsd/S01-T01-SUMMARY.md'
  ]);
}

function testAllowedTransitions() {
  const spec = loadStateMachine();
  const allowed = [
    ['seed', 'seed-complete'],
    ['seed-complete', 'stack-complete'],
    ['stack-complete', 'roadmap-complete'],
    ['plan-complete', 'applying'],
    ['applying', 'apply-complete'],
    ['apply-complete', 'unified']
  ];
  const rejected = [
    ['seed-complete', 'apply-complete'],
    ['apply-blocked', 'unified']
  ];

  for (const [fromPhase, toPhase] of allowed) {
    assert.deepStrictEqual(validateTransition(fromPhase, toPhase, spec), []);
  }

  for (const [fromPhase, toPhase] of rejected) {
    assert.match(
      validateTransition(fromPhase, toPhase, spec).join('\n'),
      new RegExp(`${fromPhase} -> ${toPhase}`)
    );
  }
}

function testRouterPhaseLiteralsExistInSpec() {
  const spec = loadStateMachine();
  const routerPhases = extractRouterPhases();

  assert.ok(routerPhases.includes('apply-blocked'));
  for (const phase of routerPhases) {
    assert.ok(spec.phases[phase], `${phase} appears in router but not in state spec`);
  }
}

testSpecContainsExpectedPhases();
testEarlyPhasesAllowEmptySliceAndTask();
testExecutionPhasesRequireActiveState();
testAllowedTransitions();
testRouterPhaseLiteralsExistInSpec();
