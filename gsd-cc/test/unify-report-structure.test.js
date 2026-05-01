const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { packageRoot } = require('./helpers/package-fixture');

const REQUIRED_REPORT_SECTIONS = [
  'Summary',
  'Plan vs. Actual',
  'Acceptance Criteria',
  'Implemented Work',
  'Not Implemented',
  'Extra Work Added',
  'Deviations',
  'Risks Introduced',
  'Tests and Evidence',
  'Decisions Made',
  'Boundary Violations',
  'Deferred',
  'Reassessment',
  'Vision Alignment',
  'Recommendation for Next Slice'
];

function read(relativePath) {
  return fs.readFileSync(path.join(packageRoot, relativePath), 'utf8');
}

function assertSectionsInOrder(content, sections) {
  let previousIndex = -1;

  for (const section of sections) {
    const marker = `## ${section}`;
    const index = content.indexOf(marker);

    assert.notStrictEqual(index, -1, `${marker} should be present`);
    assert.ok(index > previousIndex, `${marker} should appear in report order`);

    previousIndex = index;
  }
}

function assertPromptMentionsStrongerReport(content, label) {
  for (const phrase of [
    'Risks Introduced',
    'Tests and Evidence',
    'Extra Work Added',
    'Recommendation for Next Slice'
  ]) {
    assert.match(content, new RegExp(phrase), `${label} should mention ${phrase}`);
  }

  assert.match(
    content,
    /Do not modify roadmap files during UNIFY/,
    `${label} should keep roadmap changes out of UNIFY`
  );
  assert.match(
    content,
    /REASSESS/,
    `${label} should leave roadmap mutation to REASSESS`
  );
}

function testTemplateSectionsAndFrontmatter() {
  const template = read(path.join('templates', 'UNIFY.md'));

  assert.match(template, /^---\nslice: \{\{SLICE_ID\}\}\ndate: \{\{ISO_DATE\}\}\nstatus: \{\{complete\|partial\|failed\}\}\n---/);
  assertSectionsInOrder(template, REQUIRED_REPORT_SECTIONS);
  assert.match(template, /Use "None\." when all planned work was completed/);
  assert.match(template, /Use "None\." when nothing was deferred/);
}

function testManualAndAutoPromptsUseStrongerReport() {
  const manualSkill = read(path.join('skills', 'unify', 'SKILL.md'));
  const autoPrompt = read(path.join('skills', 'auto', 'unify-instructions.txt'));

  assertPromptMentionsStrongerReport(manualSkill, 'manual UNIFY skill');
  assertPromptMentionsStrongerReport(autoPrompt, 'auto UNIFY prompt');
}

function testChecklistRequiresStrongerReport() {
  const checklist = read(path.join('checklists', 'unify-complete.md'));

  assertSectionsInOrder(checklist, [
    'Summary',
    'Plan vs. Actual',
    'Acceptance Criteria',
    'Work Classification',
    'Tests and Evidence',
    'Decisions',
    'Boundary Violations',
    'Deferred Issues',
    'Commit Status',
    'Reassessment',
    'Vision Alignment',
    'Recommendation for Next Slice'
  ]);
  assert.match(checklist, /Risks Introduced says "None\."/);
  assert.match(checklist, /Deferred says "None\."/);
  assert.match(checklist, /UNIFY does not modify roadmap files/);
}

testTemplateSectionsAndFrontmatter();
testManualAndAutoPromptsUseStrongerReport();
testChecklistRequiresStrongerReport();
