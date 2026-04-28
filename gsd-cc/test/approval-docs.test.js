const assert = require('assert');
const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(packageRoot, relativePath), 'utf8');
}

function testRouterDocumentsApprovalRequest() {
  const router = read('skills/gsd-cc/SKILL.md');
  assert.match(router, /APPROVAL-REQUEST\.json/);
  assert.match(router, /APPROVALS\.jsonl/);
  assert.match(router, /Approve once/);
}

function testStatusDocumentsPendingApproval() {
  const status = read('skills/status/SKILL.md');
  assert.match(status, /Approval: pending/);
  assert.match(status, /Approval: none pending/);
}

function testUnifyDocumentsRiskAndApproval() {
  const unify = read('skills/unify/SKILL.md');
  const template = read('templates/UNIFY.md');
  const autoInstructions = read('skills/auto/unify-instructions.txt');

  assert.match(unify, /Risk and Approval/);
  assert.match(template, /Risk and Approval/);
  assert.match(autoInstructions, /<approvals>/);
}

testRouterDocumentsApprovalRequest();
testStatusDocumentsPendingApproval();
testUnifyDocumentsRiskAndApproval();
