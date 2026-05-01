const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  packageRoot
} = require('./helpers/package-fixture');

function read(relativePath) {
  return fs.readFileSync(path.join(packageRoot, relativePath), 'utf8');
}

function testApplySeparatesUiAndCommitLanguage() {
  const applySkill = read(path.join('skills', 'apply', 'SKILL.md'));

  assert.match(applySkill, /## Commit Language/);
  assert.match(applySkill, /Do not infer\s+commit language from the UI language/);
  assert.doesNotMatch(
    applySkill,
    /messages,\s*summaries,\s*commit messages\s+—\s+must use the resolved language/
  );
}

function testAutoPromptsResolveCommitLanguage() {
  const autoApply = read(path.join('skills', 'auto', 'apply-instructions.txt'));
  const autoUnify = read(path.join('skills', 'auto', 'unify-instructions.txt'));

  for (const content of [autoApply, autoUnify]) {
    assert.match(content, /commit_language/);
    assert.match(content, /GSD-CC commit language:/);
    assert.match(content, /Do not infer commit language/);
  }
}

function testUnifySeparatesUiAndCommitLanguage() {
  const unifySkill = read(path.join('skills', 'unify', 'SKILL.md'));

  assert.match(unifySkill, /## Commit Language/);
  assert.match(unifySkill, /Do not infer\s+commit language from the UI language/);
}

testApplySeparatesUiAndCommitLanguage();
testAutoPromptsResolveCommitLanguage();
testUnifySeparatesUiAndCommitLanguage();
