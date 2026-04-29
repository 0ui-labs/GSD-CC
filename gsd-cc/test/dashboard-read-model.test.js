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
    'rigor'
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
  testRelativeProjectRootIsResolved();
}

run();
