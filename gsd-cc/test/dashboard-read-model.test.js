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
    'activity',
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
    'id',
    'type',
    'name',
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
  assert.strictEqual(model.current.activity, null);
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

function writeGsdJson(projectRoot, fileName, data) {
  writeGsdFile(projectRoot, fileName, `${JSON.stringify(data, null, 2)}\n`);
}

function writeGsdJsonLines(projectRoot, fileName, lines) {
  writeGsdFile(projectRoot, fileName, `${lines.join('\n')}\n`);
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

function currentTaskPlanXml(options = {}) {
  const slice = options.slice || 'S01';
  const task = options.task || 'T01';
  const name = options.name || 'Dashboard parser task';
  const acceptanceCriteria = options.acceptanceCriteria || [
    {
      id: 'AC-1',
      lines: [
        'Given a current task plan exists',
        'When the dashboard model is built',
        'Then current task details are populated'
      ]
    }
  ];
  const criteriaLines = [];

  for (const criterion of acceptanceCriteria) {
    criteriaLines.push(`    <ac id="${criterion.id}">`);

    for (const line of criterion.lines) {
      criteriaLines.push(`      ${line}`);
    }

    criteriaLines.push('    </ac>');
  }

  return [
    `<task id="${slice}-${task}" type="auto">`,
    `  <name>${name}</name>`,
    '  <files>',
    '    scripts/dashboard/task-plan-parser.js',
    '    scripts/dashboard/read-model.js',
    '  </files>',
    '  <risk level="low">',
    '    Parser output is read-only dashboard data.',
    '  </risk>',
    '  <acceptance_criteria>',
    ...criteriaLines,
    '  </acceptance_criteria>',
    '  <action>',
    '    1. Parse task plan XML',
    '  </action>',
    '  <boundaries>',
    '    Keep dashboard V1 read-only.',
    '  </boundaries>',
    '  <verify>node test/dashboard-read-model.test.js (AC-1)</verify>',
    '  <done>The dashboard read model includes the current task.</done>',
    '</task>',
    ''
  ].join('\n');
}

function writeSlicePlan(projectRoot, slice, name = 'Fixture Slice') {
  writeProjectFile(projectRoot, `.gsd/${slice}-PLAN.md`, [
    `# ${slice} - ${name}`,
    '',
    '## Overview',
    'Fixture slice plan.',
    '',
    '## Tasks',
    '',
    '| Task | Name | Risk | Files | ACs |',
    '|------|------|------|-------|-----|',
    '| T01 | First task | low | 1 | 1 |',
    ''
  ].join('\n'));
}

function writeTaskPlan(projectRoot, slice, task, name) {
  writeProjectFile(
    projectRoot,
    `.gsd/${slice}-${task}-PLAN.xml`,
    currentTaskPlanXml({ slice, task, name })
  );
}

function writeTaskSummary(projectRoot, slice, task, status = 'complete') {
  writeProjectFile(projectRoot, `.gsd/${slice}-${task}-SUMMARY.md`, [
    `# ${slice}/${task} — Summary`,
    '',
    '## Status',
    status,
    '',
    '## What Was Done',
    '- Fixture work.',
    ''
  ].join('\n'));
}

function writeTaskSummaryWithAcResults(projectRoot, slice, task, rows, status = 'complete') {
  writeProjectFile(projectRoot, `.gsd/${slice}-${task}-SUMMARY.md`, [
    `# ${slice}/${task} — Summary`,
    '',
    '## Status',
    status,
    '',
    '## Acceptance Criteria Results',
    '',
    '| AC | Status | Evidence |',
    '|----|--------|----------|',
    ...rows.map((row) => `| ${row.ac} | ${row.status} | ${row.evidence} |`),
    ''
  ].join('\n'));
}

function writeUnify(projectRoot, slice, status = 'complete') {
  writeProjectFile(projectRoot, `.gsd/${slice}-UNIFY.md`, [
    `# ${slice} UNIFY`,
    '',
    '## Status',
    status,
    ''
  ].join('\n'));
}

function writeUnifyWithAcResults(projectRoot, slice, rows, status = 'complete') {
  writeProjectFile(projectRoot, `.gsd/${slice}-UNIFY.md`, [
    `# ${slice} UNIFY`,
    '',
    '## Status',
    status,
    '',
    '## Acceptance Criteria',
    '',
    '| AC | Task | Status | Evidence |',
    '|----|------|--------|----------|',
    ...rows.map((row) => (
      `| ${row.ac} | ${row.task} | ${row.status} | ${row.evidence} |`
    )),
    ''
  ].join('\n'));
}

function warningCodes(model) {
  return model.current_task.warnings.map((warning) => warning.code);
}

function assertTopAttention(model, id, severity) {
  assert.ok(model.attention.length > 0, `expected ${id} attention item`);
  assert.strictEqual(model.attention[0].id, id);
  assert.strictEqual(model.attention[0].severity, severity);
}

function testCurrentTaskPlanPopulatesCurrentTask() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T01',
    'phase: plan-complete',
    ''
  ].join('\n'));
  writeProjectFile(projectRoot, '.gsd/S01-T01-PLAN.xml', currentTaskPlanXml());

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.current.task_name, 'Dashboard parser task');
  assert.strictEqual(model.current_task.id, 'S01-T01');
  assert.strictEqual(model.current_task.type, 'auto');
  assert.strictEqual(model.current_task.name, 'Dashboard parser task');
  assert.deepStrictEqual(model.current_task.files, [
    'scripts/dashboard/task-plan-parser.js',
    'scripts/dashboard/read-model.js'
  ]);
  assert.deepStrictEqual(model.current_task.risk, {
    level: 'low',
    reason: 'Parser output is read-only dashboard data.'
  });
  assert.deepStrictEqual(model.current_task.acceptance_criteria, [
    {
      id: 'AC-1',
      text: [
        'Given a current task plan exists',
        'When the dashboard model is built',
        'Then current task details are populated'
      ].join('\n'),
      status: 'pending',
      evidence: '',
      source: null,
      source_type: null
    }
  ]);
  assert.deepStrictEqual(model.current_task.action, [
    '1. Parse task plan XML'
  ]);
  assert.deepStrictEqual(model.current_task.boundaries, [
    'Keep dashboard V1 read-only.'
  ]);
  assert.deepStrictEqual(model.current_task.verify, [
    'node test/dashboard-read-model.test.js (AC-1)'
  ]);
  assert.strictEqual(
    model.current_task.done,
    'The dashboard read model includes the current task.'
  );
  assert.deepStrictEqual(model.current_task.warnings, []);
}

function testProgressDiscoversRoadmapSlicesAndArtifacts() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S02',
    'current_task: T02',
    'phase: applying',
    ''
  ].join('\n'));

  writeProjectFile(projectRoot, '.gsd/M001-ROADMAP.md', [
    '# M001 — Dashboard Milestone',
    '',
    '## Slices',
    '',
    '### S01 — Completed Foundation',
    'Finished baseline work.',
    '',
    '### S02 — Active Execution',
    'Currently running task work.',
    '',
    '### S03 — Planned Work',
    'Ready for execution.',
    '',
    '### S04 — Pending Work',
    'Not planned yet.',
    '',
    '### S05 — Awaiting UNIFY',
    'All tasks are done.',
    '',
    '### S06 — Failed Reconciliation',
    'UNIFY reported failure.',
    '',
    '### S07 — Blocked Execution',
    'A task is blocked.',
    ''
  ].join('\n'));

  writeSlicePlan(projectRoot, 'S01', 'Completed Foundation');
  writeTaskPlan(projectRoot, 'S01', 'T01', 'First completed task');
  writeTaskPlan(projectRoot, 'S01', 'T02', 'Second completed task');
  writeTaskSummary(projectRoot, 'S01', 'T01', 'complete');
  writeTaskSummary(projectRoot, 'S01', 'T02', 'complete');
  writeUnify(projectRoot, 'S01', 'complete');

  writeSlicePlan(projectRoot, 'S02', 'Active Execution');
  writeTaskPlan(projectRoot, 'S02', 'T01', 'Completed active task');
  writeTaskPlan(projectRoot, 'S02', 'T02', 'Current active task');
  writeTaskSummary(projectRoot, 'S02', 'T01', 'complete');
  writeProjectFile(projectRoot, '.gsd/S02-T02-PLAN.xml', currentTaskPlanXml({
    slice: 'S02',
    task: 'T02',
    name: 'Current active task'
  }));

  writeSlicePlan(projectRoot, 'S03', 'Planned Work');
  writeTaskPlan(projectRoot, 'S03', 'T01', 'Planned task');

  writeSlicePlan(projectRoot, 'S05', 'Awaiting UNIFY');
  writeTaskPlan(projectRoot, 'S05', 'T01', 'Done before UNIFY');
  writeTaskSummary(projectRoot, 'S05', 'T01', 'complete');

  writeSlicePlan(projectRoot, 'S06', 'Failed Reconciliation');
  writeTaskPlan(projectRoot, 'S06', 'T01', 'Failed unify task');
  writeTaskSummary(projectRoot, 'S06', 'T01', 'complete');
  writeUnify(projectRoot, 'S06', 'failed');

  writeSlicePlan(projectRoot, 'S07', 'Blocked Execution');
  writeTaskPlan(projectRoot, 'S07', 'T01', 'Blocked task');
  writeTaskSummary(projectRoot, 'S07', 'T01', 'blocked');

  const model = buildDashboardModel(projectRoot);
  const statuses = model.progress.slices.map((slice) => [
    slice.id,
    slice.name,
    slice.status,
    slice.tasks.total,
    slice.tasks.completed,
    slice.tasks.pending
  ]);

  assert.deepStrictEqual(statuses, [
    ['S01', 'Completed Foundation', 'unified', 2, 2, 0],
    ['S02', 'Active Execution', 'running', 2, 1, 1],
    ['S03', 'Planned Work', 'planned', 1, 0, 1],
    ['S04', 'Pending Work', 'pending', 0, 0, 0],
    ['S05', 'Awaiting UNIFY', 'apply-complete', 1, 1, 0],
    ['S06', 'Failed Reconciliation', 'failed', 1, 1, 0],
    ['S07', 'Blocked Execution', 'blocked', 1, 1, 0]
  ]);

  const activeSlice = model.progress.slices.find((slice) => slice.id === 'S02');
  assert.strictEqual(activeSlice.current, true);
  assert.strictEqual(activeSlice.artifacts.roadmap, '.gsd/M001-ROADMAP.md');
  assert.strictEqual(activeSlice.artifacts.plan, '.gsd/S02-PLAN.md');
  assert.deepStrictEqual(activeSlice.artifacts.task_plans, [
    '.gsd/S02-T01-PLAN.xml',
    '.gsd/S02-T02-PLAN.xml'
  ]);
  assert.deepStrictEqual(activeSlice.artifacts.summaries, [
    '.gsd/S02-T01-SUMMARY.md'
  ]);
  assert.deepStrictEqual(activeSlice.tasks.risk, {
    low: 2,
    medium: 0,
    high: 0,
    unknown: 0
  });
  assert.deepStrictEqual(activeSlice.acceptance_criteria, {
    total: 2,
    passed: 0,
    partial: 0,
    failed: 0,
    pending: 2
  });
  assert.deepStrictEqual(activeSlice.tasks.items.map((item) => [
    item.id,
    item.name,
    item.status,
    item.risk.level,
    item.acceptance_criteria.total,
    item.artifacts.plan,
    item.artifacts.summary
  ]), [
    [
      'T01',
      'Completed active task',
      'complete',
      'low',
      1,
      '.gsd/S02-T01-PLAN.xml',
      '.gsd/S02-T01-SUMMARY.md'
    ],
    [
      'T02',
      'Current active task',
      'pending',
      'low',
      1,
      '.gsd/S02-T02-PLAN.xml',
      null
    ]
  ]);
}

function testArtifactOnlySlicesAreIncludedWhenRoadmapIsMissing() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T01',
    'phase: plan-complete',
    ''
  ].join('\n'));

  writeSlicePlan(projectRoot, 'S01');
  writeTaskPlan(projectRoot, 'S01', 'T01', 'Artifact-only task');

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.progress.slices.length, 1);
  assert.strictEqual(model.progress.slices[0].id, 'S01');
  assert.strictEqual(model.progress.slices[0].name, 'unknown');
  assert.strictEqual(model.progress.slices[0].status, 'planned');
  assert.strictEqual(model.progress.slices[0].artifacts.roadmap, null);
}

function testAcceptanceCriteriaProgressUsesSummaryAndUnifyEvidence() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T02',
    'phase: applying',
    ''
  ].join('\n'));

  writeProjectFile(projectRoot, '.gsd/S01-T01-PLAN.xml', currentTaskPlanXml({
    slice: 'S01',
    task: 'T01',
    name: 'Completed task with summary evidence',
    acceptanceCriteria: [
      {
        id: 'AC-1',
        lines: [
          'Given summary evidence exists',
          'When the read model parses it',
          'Then the AC is marked passed'
        ]
      },
      {
        id: 'AC-2',
        lines: [
          'Given summary evidence is later reconciled',
          'When UNIFY reports a stronger result',
          'Then UNIFY evidence wins'
        ]
      }
    ]
  }));
  writeProjectFile(projectRoot, '.gsd/S01-T02-PLAN.xml', currentTaskPlanXml({
    slice: 'S01',
    task: 'T02',
    name: 'Current task with mixed AC evidence',
    acceptanceCriteria: [
      {
        id: 'AC-3',
        lines: [
          'Given UNIFY evidence exists',
          'When summary evidence is unavailable',
          'Then the AC can be partial'
        ]
      },
      {
        id: 'AC-4',
        lines: [
          'Given failed task evidence exists',
          'When the read model parses it',
          'Then the AC is marked failed'
        ]
      },
      {
        id: 'AC-5',
        lines: [
          'Given only unknown evidence exists',
          'When the read model cannot classify it',
          'Then the AC remains pending'
        ]
      }
    ]
  }));

  writeTaskSummaryWithAcResults(projectRoot, 'S01', 'T01', [
    {
      ac: 'AC-1',
      status: 'Pass ✓',
      evidence: 'dashboard-read-model.test.js passed'
    },
    {
      ac: 'AC-2',
      status: 'Partial',
      evidence: 'summary was superseded by UNIFY'
    }
  ]);
  writeTaskSummaryWithAcResults(projectRoot, 'S01', 'T02', [
    {
      ac: 'AC-4',
      status: 'Fail ✗',
      evidence: 'verification reported a regression'
    },
    {
      ac: 'AC-5',
      status: '{{PASS/PARTIAL/FAIL}}',
      evidence: 'template placeholder is not evidence'
    }
  ]);
  writeUnifyWithAcResults(projectRoot, 'S01', [
    {
      ac: 'AC-2',
      task: 'T01',
      status: 'Pass',
      evidence: 'UNIFY confirmed the criterion'
    },
    {
      ac: 'AC-3',
      task: 'T02',
      status: 'Partial',
      evidence: 'UNIFY found follow-up work'
    }
  ]);

  const model = buildDashboardModel(projectRoot);

  assert.deepStrictEqual(model.progress.acceptance_criteria, {
    total: 5,
    passed: 2,
    partial: 1,
    failed: 1,
    pending: 1
  });
  assert.deepStrictEqual(model.progress.slices[0].acceptance_criteria, {
    total: 5,
    passed: 2,
    partial: 1,
    failed: 1,
    pending: 1
  });
  assert.deepStrictEqual(model.current_task.acceptance_criteria.map((criterion) => [
    criterion.id,
    criterion.status,
    criterion.evidence,
    criterion.source,
    criterion.source_type
  ]), [
    [
      'AC-3',
      'partial',
      'UNIFY found follow-up work',
      '.gsd/S01-UNIFY.md',
      'unify'
    ],
    [
      'AC-4',
      'failed',
      'verification reported a regression',
      '.gsd/S01-T02-SUMMARY.md',
      'summary'
    ],
    [
      'AC-5',
      'pending',
      '',
      null,
      null
    ]
  ]);
}

function testLiveAutoLockPopulatesAutomationState() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T01',
    'phase: applying',
    'auto_mode_scope: slice',
    ''
  ].join('\n'));
  writeGsdJson(projectRoot, 'auto.lock', {
    unit: 'S01/T01',
    phase: 'applying',
    pid: process.pid,
    started: '2026-04-29T08:00:00Z'
  });

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.automation.status, 'active');
  assert.strictEqual(model.automation.scope, 'slice');
  assert.strictEqual(model.automation.unit, 'S01/T01');
  assert.strictEqual(model.automation.pid, process.pid);
  assert.strictEqual(model.automation.started_at, '2026-04-29T08:00:00Z');
  assert.deepStrictEqual(model.attention, []);
}

function testStaleAutoLockProducesTopAttentionItem() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T01',
    'phase: applying',
    ''
  ].join('\n'));
  writeGsdJson(projectRoot, 'auto.lock', {
    unit: 'S01/T01',
    phase: 'applying',
    pid: 99999999,
    started: '2026-04-29T08:00:00Z'
  });

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.automation.status, 'stale');
  assert.strictEqual(model.automation.unit, 'S01/T01');
  assert.strictEqual(model.automation.pid, 99999999);
  assertTopAttention(model, 'auto-lock-stale', 'critical');
  assert.match(model.attention[0].message, /PID is not running/);
}

function testApprovalRequestProducesTopAttentionItem() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T02',
    'phase: plan-complete',
    ''
  ].join('\n'));
  writeGsdJson(projectRoot, 'APPROVAL-REQUEST.json', {
    slice: 'S01',
    task: 'T02',
    plan: '.gsd/S01-T02-PLAN.xml',
    risk_level: 'high',
    risk_reason: 'Touches deployment configuration.',
    fingerprint: '123:456',
    reasons: [
      'risk high meets approval_required_risk high'
    ],
    created_at: '2026-04-29T08:01:00Z'
  });

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.automation.status, 'approval-required');
  assert.strictEqual(model.automation.unit, 'S01/T02');
  assert.deepStrictEqual(model.evidence.approval_request, {
    slice: 'S01',
    task: 'T02',
    unit: 'S01/T02',
    plan: '.gsd/S01-T02-PLAN.xml',
    risk_level: 'high',
    risk_reason: 'Touches deployment configuration.',
    fingerprint: '123:456',
    reasons: [
      'risk high meets approval_required_risk high'
    ],
    created_at: '2026-04-29T08:01:00Z',
    source: '.gsd/APPROVAL-REQUEST.json'
  });
  assertTopAttention(model, 'approval-required', 'critical');
  assert.match(model.attention[0].recommended_action, /risk high/);
}

function testAttentionItemsSortBySeverity() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T02',
    'phase: applying',
    ''
  ].join('\n'));
  writeGsdFile(projectRoot, 'auto.lock', '{not-json');
  writeGsdJson(projectRoot, 'APPROVAL-REQUEST.json', {
    slice: 'S01',
    task: 'T02',
    risk_level: 'high',
    reasons: [
      'risk high meets approval_required_risk high'
    ]
  });

  const model = buildDashboardModel(projectRoot);

  assertTopAttention(model, 'approval-required', 'critical');
  assert.strictEqual(model.attention[1].id, 'auto-lock-invalid');
  assert.strictEqual(model.attention[1].severity, 'warning');
}

function testRecoveryProducesTopAttentionItem() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T01',
    'phase: applying',
    ''
  ].join('\n'));
  writeGsdJson(projectRoot, 'auto-recovery.json', {
    status: 'problem',
    reason: 'dispatch_failed',
    message: 'Dispatch failed with exit 42 on S01/T01.',
    scope: 'slice',
    unit: 'S01/T01',
    phase: 'applying',
    dispatch_phase: 'apply',
    started_at: '2026-04-29T08:00:00Z',
    stopped_at: '2026-04-29T08:02:00Z',
    commits_since_start: ['abc123 Fix fixture'],
    uncommitted_files: ['src/fixture.txt'],
    log_file: '.gsd/auto.log',
    safe_next_action: 'Inspect the log before resuming.'
  });
  writeGsdFile(projectRoot, 'AUTO-RECOVERY.md', '# Auto-Mode Recovery\n');

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.automation.status, 'recovery-needed');
  assert.strictEqual(model.automation.unit, 'S01/T01');
  assert.strictEqual(model.evidence.latest_recovery.reason, 'dispatch_failed');
  assert.strictEqual(model.evidence.latest_recovery.report, '.gsd/AUTO-RECOVERY.md');
  assert.deepStrictEqual(model.evidence.latest_recovery.uncommitted_files, [
    'src/fixture.txt'
  ]);
  assertTopAttention(model, 'auto-recovery', 'critical');
  assert.match(model.attention[0].recommended_action, /Inspect the log/);
}

function testBlockedAndFailedPhasesProduceAttentionItems() {
  const blockedRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T01',
    'phase: apply-blocked',
    'blocked_reason: Missing API credentials',
    ''
  ].join('\n'));

  const blockedModel = buildDashboardModel(blockedRoot);

  assertTopAttention(blockedModel, 'phase-apply-blocked', 'warning');
  assert.match(blockedModel.attention[0].recommended_action, /Missing API credentials/);

  const failedRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S02',
    'current_task: T03',
    'phase: unify-failed',
    ''
  ].join('\n'));

  const failedModel = buildDashboardModel(failedRoot);

  assertTopAttention(failedModel, 'phase-unify-failed', 'critical');
}

function testApplyCompleteWithoutUnifyProducesTopAttentionItem() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T02',
    'phase: apply-complete',
    ''
  ].join('\n'));
  writeSlicePlan(projectRoot, 'S01');
  writeTaskPlan(projectRoot, 'S01', 'T01', 'Completed task');
  writeTaskPlan(projectRoot, 'S01', 'T02', 'Current completed task');
  writeTaskSummary(projectRoot, 'S01', 'T01', 'complete');
  writeTaskSummary(projectRoot, 'S01', 'T02', 'complete');

  const model = buildDashboardModel(projectRoot);

  assertTopAttention(model, 'unify-required', 'warning');
  assert.match(model.attention[0].message, /no UNIFY report/);
  assert.match(model.attention[0].recommended_action, /Run UNIFY for S01/);
}

function testEventJournalPopulatesRecentActivity() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T02',
    'phase: applying',
    ''
  ].join('\n'));
  writeGsdJsonLines(projectRoot, 'events.jsonl', [
    JSON.stringify({
      timestamp: '2026-04-29T08:02:00Z',
      type: 'dispatch_started',
      milestone: 'M001',
      slice: 'S01',
      task: 'T02',
      phase: 'applying',
      dispatch_phase: 'apply',
      message: 'Started apply dispatch.',
      artifact: '.gsd/S01-T02-PLAN.xml',
      attempt: '1'
    }),
    JSON.stringify({
      timestamp: '2026-04-29T08:01:00Z',
      type: 'task_started',
      milestone: 'M001',
      slice: 'S01',
      task: 'T02',
      phase: 'applying',
      message: 'Started task S01/T02.',
      task_plan: '.gsd/S01-T02-PLAN.xml'
    }),
    JSON.stringify({
      timestamp: '2026-04-29T08:02:00Z',
      type: 'dispatch_failed',
      milestone: 'M001',
      slice: 'S01',
      task: 'T02',
      phase: 'applying',
      dispatch_phase: 'apply',
      message: 'Apply dispatch failed.',
      artifact: '.gsd/AUTO-RECOVERY.md',
      exit_code: '42'
    })
  ]);

  const model = buildDashboardModel(projectRoot);

  assert.deepStrictEqual(model.activity.map((event) => event.type), [
    'dispatch_failed',
    'dispatch_started',
    'task_started'
  ]);
  assert.strictEqual(model.activity[0].category, 'dispatch');
  assert.strictEqual(model.activity[0].severity, 'warning');
  assert.strictEqual(model.activity[0].unit, 'S01/T02');
  assert.strictEqual(model.activity[0].dispatch_phase, 'apply');
  assert.deepStrictEqual(model.activity[0].artifacts, [
    '.gsd/AUTO-RECOVERY.md'
  ]);
  assert.deepStrictEqual(model.activity[0].details, {
    exit_code: '42'
  });
  assert.deepStrictEqual(model.current.activity, {
    timestamp: '2026-04-29T08:02:00Z',
    type: 'dispatch_failed',
    category: 'dispatch',
    severity: 'warning',
    message: 'Apply dispatch failed.',
    unit: 'S01/T02',
    phase: 'applying',
    dispatch_phase: 'apply',
    source: '.gsd/events.jsonl',
    line: 3,
    artifact: '.gsd/AUTO-RECOVERY.md'
  });
}

function testMalformedEventJournalLinesProduceWarning() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T02',
    'phase: applying',
    ''
  ].join('\n'));
  writeGsdJsonLines(projectRoot, 'events.jsonl', [
    '{not-json',
    JSON.stringify(['not', 'an', 'event']),
    JSON.stringify({
      timestamp: '2026-04-29T08:00:00Z',
      message: 'Missing type.'
    }),
    JSON.stringify({
      timestamp: '2026-04-29T08:01:00Z',
      type: 'task_started',
      message: 'Started task S01/T02.',
      slice: 'S01',
      task: 'T02'
    })
  ]);

  const model = buildDashboardModel(projectRoot);

  assert.deepStrictEqual(model.activity.map((event) => event.type), [
    'task_started'
  ]);
  assert.strictEqual(model.current.activity.type, 'task_started');

  const warning = model.attention.find((item) => item.id === 'events-jsonl-invalid');
  assert.ok(warning, 'expected malformed event journal warning');
  assert.strictEqual(warning.severity, 'warning');
  assert.strictEqual(warning.source, '.gsd/events.jsonl');
  assert.match(warning.message, /Ignored 3 malformed event lines/);
  assert.match(warning.recommended_action, /line 1/);
}

function testMalformedCurrentTaskPlanProducesWarning() {
  const projectRoot = createProjectWithState([
    'milestone: M001',
    'current_slice: S01',
    'current_task: T02',
    'phase: plan-complete',
    ''
  ].join('\n'));
  writeProjectFile(
    projectRoot,
    '.gsd/S01-T02-PLAN.xml',
    '<task id="S01-T02" type="auto"><name>Broken task'
  );

  const model = buildDashboardModel(projectRoot);

  assert.strictEqual(model.current.task_name, 'unknown');
  assert.strictEqual(model.current_task.id, 'S01-T02');
  assert.strictEqual(model.current_task.type, 'auto');
  assert.deepStrictEqual(model.current_task.files, []);
  assert.ok(warningCodes(model).includes('task.xml.root_unclosed'));
  assert.ok(warningCodes(model).includes('task.name.unclosed'));
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
  testCurrentTaskPlanPopulatesCurrentTask();
  testProgressDiscoversRoadmapSlicesAndArtifacts();
  testArtifactOnlySlicesAreIncludedWhenRoadmapIsMissing();
  testAcceptanceCriteriaProgressUsesSummaryAndUnifyEvidence();
  testLiveAutoLockPopulatesAutomationState();
  testStaleAutoLockProducesTopAttentionItem();
  testApprovalRequestProducesTopAttentionItem();
  testAttentionItemsSortBySeverity();
  testRecoveryProducesTopAttentionItem();
  testBlockedAndFailedPhasesProduceAttentionItems();
  testApplyCompleteWithoutUnifyProducesTopAttentionItem();
  testEventJournalPopulatesRecentActivity();
  testMalformedEventJournalLinesProduceWarning();
  testMalformedCurrentTaskPlanProducesWarning();
  testRelativeProjectRootIsResolved();
}

run();
