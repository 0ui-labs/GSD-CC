const assert = require('assert');

const {
  createEmptyTaskPlan,
  parseTaskPlanXml
} = require('../scripts/dashboard/task-plan-parser');

function warningCodes(taskPlan) {
  return taskPlan.warnings.map((warning) => warning.code);
}

function validTaskPlanXml() {
  return [
    '<task id="S01-T02" type="auto">',
    '  <name>Build parser &amp; read model</name>',
    '  <files>',
    '    - scripts/dashboard/task-plan-parser.js (new parser)',
    '    2. test/dashboard-task-plan-parser.test.js # parser coverage',
    '  </files>',
    '  <risk level="medium">',
    '    Regex parsing must stay conservative.',
    '  </risk>',
    '  <acceptance_criteria>',
    '    <ac id="AC-1">',
    '      Given a valid task plan exists',
    '      When the dashboard reads it',
    '      Then current task details are populated',
    '    </ac>',
    '    <ac id="AC-2">',
    '      Given comments exist in the XML',
    '      When text is normalized',
    '      Then comments are omitted',
    '    </ac>',
    '  </acceptance_criteria>',
    '  <action>',
    '    <!-- implementation notes should not render -->',
    '    1. Add the parser',
    '    2. Wire the read model',
    '  </action>',
    '  <boundaries>',
    '    DO NOT CHANGE:',
    '    - dashboard/app.js',
    '  </boundaries>',
    '  <verify>',
    '    node test/dashboard-task-plan-parser.test.js (AC-1, AC-2)',
    '  </verify>',
    '  <done>',
    '    Parser tests pass.',
    '  </done>',
    '</task>',
    ''
  ].join('\n');
}

function testEmptyTaskPlanShape() {
  assert.deepStrictEqual(createEmptyTaskPlan(), {
    id: 'unknown',
    type: 'unknown',
    name: 'unknown',
    risk: {
      level: 'unknown',
      reason: ''
    },
    files: [],
    boundaries: [],
    acceptance_criteria: [],
    action: [],
    verify: [],
    done: null,
    warnings: []
  });
}

function testValidXmlExtractsTaskDetails() {
  const taskPlan = parseTaskPlanXml(validTaskPlanXml(), {
    expectedTaskId: 'S01-T02'
  });

  assert.strictEqual(taskPlan.id, 'S01-T02');
  assert.strictEqual(taskPlan.type, 'auto');
  assert.strictEqual(taskPlan.name, 'Build parser & read model');
  assert.deepStrictEqual(taskPlan.files, [
    'scripts/dashboard/task-plan-parser.js',
    'test/dashboard-task-plan-parser.test.js'
  ]);
  assert.deepStrictEqual(taskPlan.risk, {
    level: 'medium',
    reason: 'Regex parsing must stay conservative.'
  });
  assert.deepStrictEqual(taskPlan.acceptance_criteria, [
    {
      id: 'AC-1',
      text: [
        'Given a valid task plan exists',
        'When the dashboard reads it',
        'Then current task details are populated'
      ].join('\n')
    },
    {
      id: 'AC-2',
      text: [
        'Given comments exist in the XML',
        'When text is normalized',
        'Then comments are omitted'
      ].join('\n')
    }
  ]);
  assert.deepStrictEqual(taskPlan.action, [
    '1. Add the parser',
    '2. Wire the read model'
  ]);
  assert.deepStrictEqual(taskPlan.boundaries, [
    'DO NOT CHANGE:',
    '- dashboard/app.js'
  ]);
  assert.deepStrictEqual(taskPlan.verify, [
    'node test/dashboard-task-plan-parser.test.js (AC-1, AC-2)'
  ]);
  assert.strictEqual(taskPlan.done, 'Parser tests pass.');
  assert.deepStrictEqual(taskPlan.warnings, []);
}

function testIncompleteXmlProducesWarnings() {
  const taskPlan = parseTaskPlanXml([
    '<task id="S01-T03" type="auto">',
    '  <name></name>',
    '  <files>',
    '    <!-- no concrete files -->',
    '  </files>',
    '  <risk level="severe"></risk>',
    '  <acceptance_criteria>',
    '    <ac id="AC-one">',
    '      Given a plan exists',
    '      When it is incomplete',
    '    </ac>',
    '  </acceptance_criteria>',
    '  <verify>node test/dashboard-task-plan-parser.test.js (AC-2)</verify>',
    '</task>',
    ''
  ].join('\n'), {
    expectedTaskId: 'S01-T03'
  });

  assert.strictEqual(taskPlan.id, 'S01-T03');
  assert.strictEqual(taskPlan.name, 'unknown');
  assert.deepStrictEqual(taskPlan.files, []);
  assert.strictEqual(taskPlan.risk.level, 'unknown');

  const codes = warningCodes(taskPlan);
  assert.ok(codes.includes('task.name.missing'));
  assert.ok(codes.includes('task.files.empty'));
  assert.ok(codes.includes('task.risk.level_invalid'));
  assert.ok(codes.includes('task.ac.id_invalid'));
  assert.ok(codes.includes('task.ac.bdd_missing'));
  assert.ok(codes.includes('task.verify.unknown_ac'));
  assert.ok(codes.includes('task.action.missing'));
  assert.ok(codes.includes('task.boundaries.missing'));
  assert.ok(codes.includes('task.done.missing'));
}

function testMalformedXmlWarnsInsteadOfThrowing() {
  const taskPlan = parseTaskPlanXml(
    '<task id="S01-T04" type="auto"><name>Broken task',
    { expectedTaskId: 'S01-T04' }
  );

  assert.strictEqual(taskPlan.id, 'S01-T04');
  assert.strictEqual(taskPlan.type, 'auto');
  assert.strictEqual(taskPlan.name, 'unknown');

  const codes = warningCodes(taskPlan);
  assert.ok(codes.includes('task.xml.root_unclosed'));
  assert.ok(codes.includes('task.name.unclosed'));
}

function testPartiallyMalformedAcceptanceCriteriaWarns() {
  const taskPlan = parseTaskPlanXml([
    '<task id="S01-T05" type="auto">',
    '  <name>Partially malformed AC</name>',
    '  <files>src/fixture.txt</files>',
    '  <risk level="low">Small parser fixture.</risk>',
    '  <acceptance_criteria>',
    '    <ac id="AC-1">',
    '      Given a valid criterion exists',
    '      When it is parsed',
    '      Then it is shown',
    '    </ac>',
    '    <ac id="AC-2">',
    '      Given a second criterion starts',
    '  </acceptance_criteria>',
    '  <action>1. Update parser</action>',
    '  <boundaries>No extra files.</boundaries>',
    '  <verify>node test/dashboard-task-plan-parser.test.js (AC-1)</verify>',
    '  <done>Parser warns.</done>',
    '</task>',
    ''
  ].join('\n'), {
    expectedTaskId: 'S01-T05'
  });

  const codes = warningCodes(taskPlan);
  assert.deepStrictEqual(taskPlan.acceptance_criteria.map((criterion) => criterion.id), ['AC-1']);
  assert.ok(codes.includes('task.ac.malformed'));
}

function run() {
  testEmptyTaskPlanShape();
  testValidXmlExtractsTaskDetails();
  testIncompleteXmlProducesWarnings();
  testMalformedXmlWarnsInsteadOfThrowing();
  testPartiallyMalformedAcceptanceCriteriaWarns();
}

run();
