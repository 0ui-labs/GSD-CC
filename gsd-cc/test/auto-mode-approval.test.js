const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
    HOME: makeTempDir('gsd-cc-auto-approval-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function setupBin() {
  const tempRoot = makeTempDir('gsd-cc-auto-approval-bin-');
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

if (prompt.includes('APPLY_PROMPT')) {
  fs.writeFileSync(path.join(gsdDir, 'apply-dispatched.marker'), 'marker\\n');
  setState('phase', 'apply-complete');
}

console.log(JSON.stringify({
  model: 'fake-claude',
  usage: { input_tokens: 1, output_tokens: 1 }
}));
`);
  return binDir;
}

function writeTaskPlan(projectDir, options = {}) {
  const riskLevel = options.riskLevel || 'low';
  const riskText = options.riskText || 'Isolated fixture change with focused verification.';
  const filePath = options.filePath || 'src/fixture.txt';
  const action = options.action || `1. Update ${filePath}`;

  writeFile(path.join(projectDir, '.gsd', 'S01-T01-PLAN.xml'), [
    '<task id="S01-T01" type="auto">',
    '  <name>Fixture task</name>',
    '  <files>',
    `    ${filePath}`,
    '  </files>',
    `  <risk level="${riskLevel}">`,
    `    ${riskText}`,
    '  </risk>',
    '  <acceptance_criteria>',
    '    <ac id="AC-1">',
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
    '  <verify>npm test (AC-1)</verify>',
    '  <done>The fixture task is complete.</done>',
    '</task>',
    ''
  ].join('\n'));
}

function createApplyProject(options = {}) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      auto_mode_scope: options.scope || 'slice'
    }
  });

  if (options.config) {
    writeFile(path.join(projectDir, '.gsd', 'CONFIG.md'), options.config);
  }
  writeTaskPlan(projectDir, options.plan || {});
  return projectDir;
}

function runProject(binDir, options = {}) {
  const projectDir = createApplyProject(options);
  const result = runAutoLoop(projectDir, makeEnv(binDir));
  return { projectDir, result };
}

function taskPlanFingerprint(projectDir) {
  return taskPlanFingerprintForPath(path.join(projectDir, '.gsd', 'S01-T01-PLAN.xml'));
}

function taskPlanFingerprintForPath(planPath) {
  const result = spawnSync('cksum', [planPath], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  const [sum, size] = result.stdout.trim().split(/\s+/);
  return `${sum}:${size}`;
}

function writeApproval(projectDir, fingerprint) {
  writeFile(path.join(projectDir, '.gsd', 'APPROVALS.jsonl'), JSON.stringify({
    slice: 'S01',
    task: 'T01',
    fingerprint,
    status: 'approved'
  }) + '\n');
}

function writeApprovalRecord(projectDir, record) {
  writeFile(path.join(projectDir, '.gsd', 'APPROVALS.jsonl'), `${JSON.stringify(record)}\n`);
}

function assertAutoLoopSucceeded(result) {
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function assertDispatched(projectDir, result) {
  assertAutoLoopSucceeded(result);
  assert.ok(fs.existsSync(path.join(projectDir, '.gsd', 'apply-dispatched.marker')));
  assert.ok(!fs.existsSync(path.join(projectDir, '.gsd', 'APPROVAL-REQUEST.json')));
}

function assertApprovalRequired(projectDir, result, pattern, expectedTask = 'T01') {
  assertAutoLoopSucceeded(result);
  assert.ok(!fs.existsSync(path.join(projectDir, '.gsd', 'apply-dispatched.marker')));
  assert.match(result.stdout, /Approval required/);
  const requestPath = path.join(projectDir, '.gsd', 'APPROVAL-REQUEST.json');
  assert.ok(fs.existsSync(requestPath), 'approval request should be written');
  const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  assert.strictEqual(request.slice, 'S01');
  assert.strictEqual(request.task, expectedTask);
  assert.ok(request.reasons.some((reason) => pattern.test(reason)));
}

function testLowRiskTaskDispatches(binDir) {
  const { projectDir, result } = runProject(binDir);
  assertDispatched(projectDir, result);
}

function testHighRiskTaskRequiresApproval(binDir) {
  const { projectDir, result } = runProject(binDir, {
    plan: {
      riskLevel: 'high',
      riskText: 'Touches shared deployment behavior.'
    }
  });
  assertApprovalRequired(projectDir, result, /risk high/);
}

function testPathRuleRequiresApproval(binDir) {
  const { projectDir, result } = runProject(binDir, {
    plan: {
      filePath: 'package.json'
    }
  });
  assertApprovalRequired(projectDir, result, /package\.json/);
}

function testTermRuleRequiresApproval(binDir) {
  const { projectDir, result } = runProject(binDir, {
    plan: {
      action: '1. Update the auth flow copy.'
    }
  });
  assertApprovalRequired(projectDir, result, /term auth/);
}

function testMatchingGrantAllowsDispatch(binDir) {
  const projectDir = createApplyProject({
    plan: {
      riskLevel: 'high',
      riskText: 'Touches shared deployment behavior.'
    }
  });
  writeApproval(projectDir, taskPlanFingerprint(projectDir));

  const result = runAutoLoop(projectDir, makeEnv(binDir));
  assertDispatched(projectDir, result);
}

function testStaleGrantDoesNotAllowDispatch(binDir) {
  const projectDir = createApplyProject({
    plan: {
      riskLevel: 'high',
      riskText: 'Touches shared deployment behavior.'
    }
  });
  writeApproval(projectDir, 'stale:fingerprint');

  const result = runAutoLoop(projectDir, makeEnv(binDir));
  assertApprovalRequired(projectDir, result, /risk high/);
}

function testRegexLikeTaskDoesNotMatchDifferentApproval(binDir) {
  const projectDir = createAutoModeProject({
    state: {
      phase: 'plan-complete',
      current_task: 'T.1',
      auto_mode_scope: 'slice'
    }
  });
  writeTaskPlan(projectDir, {
    riskLevel: 'high',
    riskText: 'Touches shared deployment behavior.'
  });
  fs.renameSync(
    path.join(projectDir, '.gsd', 'S01-T01-PLAN.xml'),
    path.join(projectDir, '.gsd', 'S01-T.1-PLAN.xml')
  );
  const planPath = path.join(projectDir, '.gsd', 'S01-T.1-PLAN.xml');
  fs.writeFileSync(
    planPath,
    fs.readFileSync(planPath, 'utf8').replace('id="S01-T01"', 'id="S01-T.1"')
  );
  writeApprovalRecord(projectDir, {
    slice: 'S01',
    task: 'T01',
    fingerprint: taskPlanFingerprintForPath(planPath),
    status: 'approved'
  });

  const result = runAutoLoop(projectDir, makeEnv(binDir));
  assertApprovalRequired(projectDir, result, /risk high/, 'T.1');
}

const binDir = setupBin();

testLowRiskTaskDispatches(binDir);
testHighRiskTaskRequiresApproval(binDir);
testPathRuleRequiresApproval(binDir);
testTermRuleRequiresApproval(binDir);
testMatchingGrantAllowsDispatch(binDir);
testStaleGrantDoesNotAllowDispatch(binDir);
testRegexLikeTaskDoesNotMatchDifferentApproval(binDir);
