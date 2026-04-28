const assert = require('assert');
const {
  DEFAULT_COMMIT_LANGUAGE,
  extractCommitLanguageFromConfig,
  extractLanguageFromConfig,
  replaceLanguageBlock
} = require('../bin/install/language-config');

function managedBlock(language, commitLanguage) {
  const lines = [
    '<!-- gsd-cc:config:start -->',
    '# GSD-CC Config',
    `GSD-CC language: ${language}`
  ];

  if (commitLanguage) {
    lines.push(`GSD-CC commit language: ${commitLanguage}`);
  }

  lines.push('<!-- gsd-cc:config:end -->');
  return lines.join('\n');
}

function testExtractsCommitLanguageFromManagedBlock() {
  const content = managedBlock('Deutsch', 'English');

  assert.strictEqual(extractLanguageFromConfig(content), 'Deutsch');
  assert.strictEqual(extractCommitLanguageFromConfig(content), 'English');
}

function testMissingCommitLanguageDefaultsWhenRewriting() {
  const content = managedBlock('Deutsch');
  const next = replaceLanguageBlock(content, 'Deutsch');

  assert.strictEqual(extractLanguageFromConfig(next), 'Deutsch');
  assert.strictEqual(
    extractCommitLanguageFromConfig(next),
    DEFAULT_COMMIT_LANGUAGE
  );
}

function testLegacyBlockStaysCompatible() {
  const content = [
    'before',
    '',
    '# GSD-CC Config',
    'GSD-CC language: Deutsch',
    '',
    'after'
  ].join('\n');
  const next = replaceLanguageBlock(content, 'Deutsch');

  assert.strictEqual(extractLanguageFromConfig(next), 'Deutsch');
  assert.strictEqual(
    extractCommitLanguageFromConfig(next),
    DEFAULT_COMMIT_LANGUAGE
  );
  assert.ok(next.includes('before'));
  assert.ok(next.includes('after'));
}

testExtractsCommitLanguageFromManagedBlock();
testMissingCommitLanguageDefaultsWhenRewriting();
testLegacyBlockStaysCompatible();
