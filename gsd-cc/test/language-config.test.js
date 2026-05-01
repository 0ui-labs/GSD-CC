const assert = require('assert');
const {
  DEFAULT_COMMIT_LANGUAGE,
  extractCommitLanguageFromConfig,
  extractLanguageFromConfig,
  replaceLanguageBlock,
  writeCommitLanguageConfig,
  writeLanguageConfig
} = require('../bin/install/language-config');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

function withTempHome(callback) {
  const previousHome = process.env.HOME;
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-cc-language-home-'));
  process.env.HOME = homeDir;

  try {
    callback(homeDir);
  } finally {
    process.env.HOME = previousHome;
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function testLanguageWritePreservesCommitLanguage() {
  withTempHome((homeDir) => {
    const claudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');
    fs.mkdirSync(path.dirname(claudeMd), { recursive: true });
    fs.writeFileSync(claudeMd, managedBlock('Deutsch', 'Deutsch'));

    writeLanguageConfig(true, 'English');

    const next = fs.readFileSync(claudeMd, 'utf8');
    assert.strictEqual(extractLanguageFromConfig(next), 'English');
    assert.strictEqual(extractCommitLanguageFromConfig(next), 'Deutsch');
  });
}

function testCommitLanguageWritePreservesUiLanguage() {
  withTempHome((homeDir) => {
    const claudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');
    fs.mkdirSync(path.dirname(claudeMd), { recursive: true });
    fs.writeFileSync(claudeMd, managedBlock('Deutsch', 'English'));

    writeCommitLanguageConfig(true, 'Deutsch');

    const next = fs.readFileSync(claudeMd, 'utf8');
    assert.strictEqual(extractLanguageFromConfig(next), 'Deutsch');
    assert.strictEqual(extractCommitLanguageFromConfig(next), 'Deutsch');
  });
}

function testCommitLanguageWriteCreatesManagedBlock() {
  withTempHome((homeDir) => {
    const claudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');

    writeCommitLanguageConfig(true, 'Deutsch');

    const next = fs.readFileSync(claudeMd, 'utf8');
    assert.strictEqual(extractLanguageFromConfig(next), 'English');
    assert.strictEqual(extractCommitLanguageFromConfig(next), 'Deutsch');
    assert.ok(next.includes('<!-- gsd-cc:config:start -->'));
    assert.ok(next.includes('<!-- gsd-cc:config:end -->'));
  });
}

testExtractsCommitLanguageFromManagedBlock();
testMissingCommitLanguageDefaultsWhenRewriting();
testLegacyBlockStaysCompatible();
testLanguageWritePreservesCommitLanguage();
testCommitLanguageWritePreservesUiLanguage();
testCommitLanguageWriteCreatesManagedBlock();
