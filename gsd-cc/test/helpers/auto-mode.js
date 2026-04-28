const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  packageRoot
} = require('./package-fixture');
const {
  makeTempDir
} = require('./temp');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeState(projectDir, fields = {}) {
  const defaults = {
    milestone: 'M001',
    current_slice: 'S01',
    current_task: 'T01',
    phase: 'apply-complete',
    rigor: 'standard',
    auto_mode_scope: 'slice'
  };
  const state = {
    ...defaults,
    ...fields
  };
  const lines = [
    `milestone: ${state.milestone}`,
    `current_slice: ${state.current_slice}`,
    `current_task: ${state.current_task}`,
    `phase: ${state.phase}`,
    `rigor: ${state.rigor}`
  ];

  for (const field of ['state_schema_version', 'project_type', 'language', 'blocked_reason']) {
    if (state[field] !== undefined) {
      lines.push(`${field}: ${state[field]}`);
    }
  }

  if (state.base_branch !== undefined) {
    lines.push(`base_branch: ${state.base_branch}`);
  }

  if (state.auto_mode_scope !== undefined) {
    lines.push(`auto_mode_scope: ${state.auto_mode_scope}`);
  }

  lines.push('last_updated: 2026-01-01T00:00:00+00:00');
  writeFile(path.join(projectDir, '.gsd', 'STATE.md'), `${lines.join('\n')}\n`);
}

function writePromptFiles(projectDir) {
  const promptDir = path.join(projectDir, '.claude', 'skills', 'auto');
  writeFile(path.join(promptDir, 'unify-instructions.txt'), 'UNIFY_PROMPT\n');
  writeFile(path.join(promptDir, 'reassess-instructions.txt'), 'REASSESS_PROMPT\n');
  writeFile(path.join(promptDir, 'plan-instructions.txt'), 'PLAN_PROMPT\n');
  writeFile(path.join(promptDir, 'apply-instructions.txt'), 'APPLY_PROMPT\n');
}

function writeRoadmap(projectDir) {
  writeFile(path.join(projectDir, '.gsd', 'M001-ROADMAP.md'), [
    '# M001',
    '',
    '### S01',
    'First slice.',
    '',
    '### S02',
    'Second slice.',
    ''
  ].join('\n'));
}

function writeApplyCompleteArtifacts(projectDir, slice = 'S01', task = 'T01') {
  const taskNumber = Number(task.replace(/^T/, '')) || 1;
  const acId = `AC-${taskNumber}`;

  writeFile(path.join(projectDir, '.gsd', `${slice}-PLAN.md`), `# ${slice}\n`);
  writeFile(path.join(projectDir, '.gsd', `${slice}-${task}-PLAN.xml`), [
    `<task id="${slice}-${task}" type="auto">`,
    '  <name>Fixture task</name>',
    '  <files>',
    '    src/fixture.txt',
    '  </files>',
    '  <risk level="low">',
    '    Isolated fixture change with focused verification.',
    '  </risk>',
    '  <acceptance_criteria>',
    `    <ac id="${acId}">`,
    '      Given the fixture baseline exists',
    '      When the task runs',
    '      Then the fixture is updated',
    '    </ac>',
    '  </acceptance_criteria>',
    '  <action>',
    '    1. Update src/fixture.txt',
    `    2. Verify ${acId}`,
    '  </action>',
    '  <boundaries>',
    '    No boundary restrictions for this task.',
    '  </boundaries>',
    `  <verify>npm test (${acId})</verify>`,
    '  <done>The fixture task is complete.</done>',
    '</task>',
    ''
  ].join('\n'));
  writeFile(path.join(projectDir, '.gsd', `${slice}-${task}-SUMMARY.md`), [
    '## Status',
    'complete',
    ''
  ].join('\n'));
}

function createAutoModeProject(options = {}) {
  const projectDir = makeTempDir('gsd-cc-auto-project-');

  writeState(projectDir, options.state);
  writePromptFiles(projectDir);
  writeRoadmap(projectDir);
  writeApplyCompleteArtifacts(projectDir);

  if (options.unified) {
    writeFile(path.join(projectDir, '.gsd', 'S01-UNIFY.md'), '# Unified\n');
  }

  return projectDir;
}

function runAutoLoop(projectDir, env) {
  return spawnSync(
    'bash',
    [path.join(packageRoot, 'skills', 'auto', 'auto-loop.sh')],
    {
      cwd: projectDir,
      env,
      encoding: 'utf8',
      timeout: 30000
    }
  );
}

function readStateField(projectDir, field) {
  const content = fs.readFileSync(path.join(projectDir, '.gsd', 'STATE.md'), 'utf8');
  const match = content.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1] : '';
}

module.exports = {
  createAutoModeProject,
  readStateField,
  runAutoLoop,
  writeApplyCompleteArtifacts,
  writeFile,
  writePromptFiles,
  writeState
};
