const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  buildDashboardModel
} = require('../scripts/dashboard/read-model');
const {
  makeTempDir
} = require('./helpers/temp');

function assertStableEmptyShape(model) {
  assert.deepStrictEqual(Object.keys(model), [
    'project',
    'current',
    'attention',
    'automation',
    'progress',
    'current_task',
    'activity',
    'evidence',
    'costs'
  ]);

  assert.deepStrictEqual(Object.keys(model.project), [
    'root',
    'name',
    'gsd_dir',
    'has_gsd',
    'language',
    'project_type',
    'rigor',
    'base_branch'
  ]);
  assert.deepStrictEqual(Object.keys(model.current), [
    'milestone',
    'slice',
    'task',
    'phase',
    'task_name',
    'next_action'
  ]);
  assert.deepStrictEqual(Object.keys(model.automation), [
    'status',
    'scope',
    'unit',
    'pid',
    'started_at'
  ]);
  assert.deepStrictEqual(Object.keys(model.progress), [
    'slices',
    'acceptance_criteria'
  ]);
  assert.deepStrictEqual(Object.keys(model.current_task), [
    'risk',
    'files',
    'boundaries',
    'acceptance_criteria',
    'action',
    'verify',
    'done',
    'warnings'
  ]);
  assert.deepStrictEqual(Object.keys(model.evidence), [
    'latest_unify',
    'latest_recovery',
    'approval_request',
    'recent_decisions'
  ]);
  assert.deepStrictEqual(Object.keys(model.costs), ['available']);
}

function testMissingGsdReturnsFriendlyNoProjectModel() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-empty-');
  const model = buildDashboardModel(projectRoot);

  assertStableEmptyShape(model);
  assert.strictEqual(model.project.root, path.resolve(projectRoot));
  assert.strictEqual(model.project.name, path.basename(projectRoot));
  assert.strictEqual(model.project.gsd_dir, '.gsd');
  assert.strictEqual(model.project.has_gsd, false);
  assert.strictEqual(model.project.language, 'unknown');
  assert.strictEqual(model.project.project_type, 'unknown');
  assert.strictEqual(model.project.rigor, 'unknown');
  assert.strictEqual(model.project.base_branch, 'unknown');

  assert.strictEqual(model.current.phase, 'no-project');
  assert.strictEqual(model.current.milestone, 'unknown');
  assert.strictEqual(model.current.slice, 'unknown');
  assert.strictEqual(model.current.task, 'unknown');
  assert.match(model.current.next_action, /initialize this project/);

  assert.strictEqual(model.attention.length, 1);
  assert.strictEqual(model.attention[0].id, 'no-project');
  assert.strictEqual(model.attention[0].severity, 'info');
  assert.match(model.attention[0].message, /\.gsd directory/);
  assert.match(model.attention[0].recommended_action, /\/gsd-cc/);

  assert.strictEqual(model.automation.status, 'inactive');
  assert.strictEqual(model.progress.acceptance_criteria.total, 0);
  assert.deepStrictEqual(model.progress.slices, []);
  assert.deepStrictEqual(model.current_task.files, []);
  assert.strictEqual(model.current_task.risk.level, 'unknown');
  assert.deepStrictEqual(model.activity, []);
  assert.strictEqual(model.evidence.latest_unify, null);
  assert.strictEqual(model.costs.available, false);
}

function testMissingOptionalFilesDoNotThrow() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-partial-');
  fs.mkdirSync(path.join(projectRoot, '.gsd'));

  const model = buildDashboardModel(projectRoot);

  assertStableEmptyShape(model);
  assert.strictEqual(model.project.has_gsd, true);
  assert.strictEqual(model.current.phase, 'unknown');
  assert.deepStrictEqual(model.attention, []);
  assert.deepStrictEqual(model.progress.slices, []);
  assert.strictEqual(model.evidence.approval_request, null);
}

function writeProjectFile(projectRoot, relativePath, content) {
  const filePath = path.join(projectRoot, relativePath);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeGsdFile(projectRoot, fileName, content) {
  writeProjectFile(projectRoot, path.join('.gsd', fileName), content);
}

function createProjectWithState(stateContent, configContent = '') {
  const projectRoot = makeTempDir('gsd-cc-dashboard-state-');

  fs.mkdirSync(path.join(projectRoot, '.gsd'));
  writeGsdFile(projectRoot, 'STATE.md', stateContent);

  if (configContent) {
    writeGsdFile(projectRoot, 'CONFIG.md', configContent);
  }

  return projectRoot;
}

function testStateFixturesPopulateCurrentPosition() {
  const fixtures = [
    {
      label: 'seed',
      state: [
        'milestone: M001',
        'current_slice: -',
        'current_task: -',
        'phase: seed-complete',
        'language: English',
        'project_type: application',
        'rigor: deep',
        'base_branch: main',
        'auto_mode_scope: slice',
        ''
      ].join('\n'),
      expected: {
        milestone: 'M001',
        slice: 'unknown',
        task: 'unknown',
        phase: 'seed-complete'
      }
    },
    {
      label: 'planned',
      state: [
        'milestone: M002',
        'current_slice: S03',
        'current_task: T04',
        'phase: plan-complete',
        'language: English',
        'project_type: workflow',
        'rigor: standard',
        'base_branch: develop',
        'auto_mode_scope: milestone',
        ''
      ].join('\n'),
      expected: {
        milestone: 'M002',
        slice: 'S03',
        task: 'T04',
        phase: 'plan-complete'
      }
    },
    {
      label: 'applying',
      state: [
        'milestone: M001',
        'current_slice: S01',
        'current_task: T02',
        'phase: applying',
        'language: Deutsch',
        'project_type: utility',
        'rigor: tight',
        'base_branch: trunk',
        'auto_mode_scope: slice',
        ''
      ].join('\n'),
      expected: {
        milestone: 'M001',
        slice: 'S01',
        task: 'T02',
        phase: 'applying'
      }
    },
    {
      label: 'unified',
      state: [
        'milestone: M003',
        'current_slice: S05',
        'current_task: T07',
        'phase: unified',
        'language: English',
        'project_type: campaign',
        'rigor: creative',
        'base_branch: main',
        'auto_mode_scope: slice',
        ''
      ].join('\n'),
      expected: {
        milestone: 'M003',
        slice: 'S05',
        task: 'T07',
        phase: 'unified'
      }
    }
  ];

  for (const fixture of fixtures) {
    const projectRoot = createProjectWithState(fixture.state);
    const model = buildDashboardModel(projectRoot);

    assertStableEmptyShape(model);
    assert.strictEqual(model.current.milestone, fixture.expected.milestone, fixture.label);
    assert.strictEqual(model.current.slice, fixture.expected.slice, fixture.label);
    assert.strictEqual(model.current.task, fixture.expected.task, fixture.label);
    assert.strictEqual(model.current.phase, fixture.expected.phase, fixture.label);
    assert.notStrictEqual(model.current.next_action, 'Add GSD-CC project state to show dashboard details.');
  }
}

function testConfigFallbackPopulatesProjectFields() {
  const projectRoot = createProjectWithState([
    'milestone: M002',
    'current_slice: S03',
    'current_task: T04',
    'phase: plan-complete',
    ''
  ].join('\n'), [
    '# Workflow - Configuration',
    '',
    'language: English',
    'rigor: standard',
    'base_branch: develop',
    'auto_mode_scope: milestone',
    ''
  ].join('\n'));

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.project.language, 'English');
  assert.strictEqual(model.project.project_type, 'workflow');
  assert.strictEqual(model.project.rigor, 'standard');
  assert.strictEqual(model.project.base_branch, 'develop');
  assert.strictEqual(model.automation.scope, 'milestone');
}

function testStateFieldsTakePrecedenceOverConfig() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T01',
    'phase: applying',
    'language: Deutsch',
    'project_type: application',
    'rigor: deep',
    'base_branch: main',
    'auto_mode_scope: slice',
    ''
  ].join('\n'), [
    '# Utility - Configuration',
    '',
    'language: English',
    'rigor: tight',
    'base_branch: develop',
    'auto_mode_scope: milestone',
    ''
  ].join('\n'));

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.project.language, 'Deutsch');
  assert.strictEqual(model.project.project_type, 'application');
  assert.strictEqual(model.project.rigor, 'deep');
  assert.strictEqual(model.project.base_branch, 'main');
  assert.strictEqual(model.automation.scope, 'slice');
}

function testMissingStateFieldsRemainUnknown() {
  const projectRoot = createProjectWithState([
    'phase: applying',
    ''
  ].join('\n'));

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.project.language, 'unknown');
  assert.strictEqual(model.project.project_type, 'unknown');
  assert.strictEqual(model.project.rigor, 'unknown');
  assert.strictEqual(model.project.base_branch, 'unknown');
  assert.strictEqual(model.current.milestone, 'unknown');
  assert.strictEqual(model.current.slice, 'unknown');
  assert.strictEqual(model.current.task, 'unknown');
  assert.strictEqual(model.current.phase, 'applying');
  assert.strictEqual(model.automation.scope, 'unknown');
}

function testRelativeProjectRootIsResolved() {
  const previousCwd = process.cwd();
  const parentDir = makeTempDir('gsd-cc-dashboard-parent-');
  const projectName = 'relative-project';
  const projectRoot = path.join(parentDir, projectName);
  fs.mkdirSync(projectRoot);

  try {
    process.chdir(parentDir);
    const model = buildDashboardModel(projectName);

    assert.strictEqual(model.project.root, path.resolve(projectName));
    assert.strictEqual(model.project.name, projectName);
  } finally {
    process.chdir(previousCwd);
  }
}

function run() {
  testMissingGsdReturnsFriendlyNoProjectModel();
  testMissingOptionalFilesDoNotThrow();
  testStateFixturesPopulateCurrentPosition();
  testConfigFallbackPopulatesProjectFields();
  testStateFieldsTakePrecedenceOverConfig();
  testMissingStateFieldsRemainUnknown();
  testRelativeProjectRootIsResolved();
}

run();
