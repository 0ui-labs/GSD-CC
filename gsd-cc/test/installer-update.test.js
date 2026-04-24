const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  assertPathMissing
} = require('./helpers/assertions');
const {
  ensureFakeBin,
  writeFakeClaude,
  writeFakeGit,
  writeFakeJq
} = require('./helpers/fake-bin');
const {
  copyPackageFixture
} = require('./helpers/package-fixture');
const {
  runInstaller
} = require('./helpers/installer');
const {
  makeIsolatedHome,
  makeTempDir
} = require('./helpers/temp');

function writeReadyDependencies(binDir) {
  writeFakeJq(binDir);
  writeFakeGit(binDir);
  writeFakeClaude(binDir, `#!/bin/sh
exit 0
`);
}

function makeEnv(homeDir, binDir) {
  return {
    ...process.env,
    HOME: homeDir,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`
  };
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function managedLanguageBlock(language) {
  return [
    '<!-- gsd-cc:config:start -->',
    '# GSD-CC Config',
    `GSD-CC language: ${language}`,
    '<!-- gsd-cc:config:end -->',
    ''
  ].join('\n');
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertNoLanguagePrompt(result) {
  assert.ok(
    !result.stdout.includes('Which language should GSD-CC use?'),
    'installer should not prompt for language'
  );
}

function assertLanguage(filePath, language) {
  assert.ok(
    readFile(filePath).includes(`GSD-CC language: ${language}`),
    `${filePath} should configure ${language}`
  );
}

function testExistingGlobalLanguageIsPreserved(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-update-global-home-');
  const env = makeEnv(homeDir, binDir);
  const claudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');
  writeFile(claudeMd, managedLanguageBlock('Deutsch'));

  const result = runInstaller(fixtureRoot, ['--global', '--yes'], {
    cwd: fixtureRoot,
    env
  });

  assertNoLanguagePrompt(result);
  assertLanguage(claudeMd, 'Deutsch');
  assert.ok(result.stdout.includes('Language preserved: Deutsch'));
}

function testExistingLocalLanguageIsPreserved(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-update-local-home-');
  const projectDir = makeTempDir('gsd-cc-update-local-project-');
  const env = makeEnv(homeDir, binDir);
  const claudeMd = path.join(projectDir, 'CLAUDE.md');
  writeFile(claudeMd, managedLanguageBlock('Deutsch'));

  const result = runInstaller(fixtureRoot, ['--local', '--yes'], {
    cwd: projectDir,
    env
  });

  assertNoLanguagePrompt(result);
  assertLanguage(claudeMd, 'Deutsch');
  assertPathMissing(path.join(homeDir, '.claude', 'CLAUDE.md'));
  assert.ok(result.stdout.includes('Language preserved: Deutsch'));
}

function testLanguageFlagOverridesExistingLanguage(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-update-override-home-');
  const env = makeEnv(homeDir, binDir);
  const claudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');
  writeFile(claudeMd, managedLanguageBlock('Deutsch'));

  const result = runInstaller(
    fixtureRoot,
    ['--global', '--yes', '--language', 'English'],
    { cwd: fixtureRoot, env }
  );

  assertNoLanguagePrompt(result);
  assertLanguage(claudeMd, 'English');
  assert.ok(result.stdout.includes('Language set to English'));
  assert.ok(!result.stdout.includes('Language preserved:'));
}

function testLanguageEqualsSyntaxWorks(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-update-equals-home-');
  const projectDir = makeTempDir('gsd-cc-update-equals-project-');
  const env = makeEnv(homeDir, binDir);
  const claudeMd = path.join(projectDir, 'CLAUDE.md');

  const result = runInstaller(
    fixtureRoot,
    ['--local', '--language=Deutsch', '--yes'],
    { cwd: projectDir, env }
  );

  assertNoLanguagePrompt(result);
  assertLanguage(claudeMd, 'Deutsch');
}

function testFreshYesInstallDefaultsToEnglish(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-update-fresh-home-');
  const env = makeEnv(homeDir, binDir);
  const claudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');

  const result = runInstaller(fixtureRoot, ['--global', '--yes'], {
    cwd: fixtureRoot,
    env
  });

  assertNoLanguagePrompt(result);
  assertLanguage(claudeMd, 'English');
  assert.ok(result.stdout.includes('Language set to English'));
}

function testNonTtyInstallDoesNotPrompt(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-update-non-tty-home-');
  const env = makeEnv(homeDir, binDir);
  const claudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');

  const result = runInstaller(fixtureRoot, ['--global'], {
    cwd: fixtureRoot,
    env,
    input: ''
  });

  assertNoLanguagePrompt(result);
  assertLanguage(claudeMd, 'English');
}

function testYesWithoutScopeDefaultsToGlobal(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-update-default-home-');
  const projectDir = makeTempDir('gsd-cc-update-default-project-');
  const env = makeEnv(homeDir, binDir);

  const result = runInstaller(fixtureRoot, ['--yes'], {
    cwd: projectDir,
    env
  });

  assertNoLanguagePrompt(result);
  assertLanguage(path.join(homeDir, '.claude', 'CLAUDE.md'), 'English');
  assertPathMissing(path.join(projectDir, 'CLAUDE.md'));
  assert.ok(result.stdout.includes('defaulting to global install'));
}

function testRejectsUnknownFlags(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-update-unknown-home-');
  const env = makeEnv(homeDir, binDir);
  const result = runInstaller(fixtureRoot, ['--globall'], {
    cwd: fixtureRoot,
    env,
    expectFailure: true
  });

  assert.ok(result.stderr.includes('Unknown option: --globall'));
}

function testUpdateSkillUsesYesFlag(fixtureRoot) {
  const updateSkill = readFile(path.join(fixtureRoot, 'skills', 'update', 'SKILL.md'));
  const invocations = updateSkill.match(
    /npx -y gsd-cc@latest\s+--(?:global|local)(?:\s+--[a-z-]+)*/g
  ) || [];

  assert.ok(invocations.length > 0, 'update skill should document update commands');
  for (const invocation of invocations) {
    assert.ok(
      invocation.includes('--yes'),
      `${invocation} should pass --yes`
    );
  }
}

const tempRoot = makeTempDir('gsd-cc-installer-update-');
const fixtureRoot = copyPackageFixture(tempRoot);
const binDir = ensureFakeBin(tempRoot);
writeReadyDependencies(binDir);

testExistingGlobalLanguageIsPreserved(fixtureRoot, binDir);
testExistingLocalLanguageIsPreserved(fixtureRoot, binDir);
testLanguageFlagOverridesExistingLanguage(fixtureRoot, binDir);
testLanguageEqualsSyntaxWorks(fixtureRoot, binDir);
testFreshYesInstallDefaultsToEnglish(fixtureRoot, binDir);
testNonTtyInstallDoesNotPrompt(fixtureRoot, binDir);
testYesWithoutScopeDefaultsToGlobal(fixtureRoot, binDir);
testRejectsUnknownFlags(fixtureRoot, binDir);
testUpdateSkillUsesYesFlag(fixtureRoot);
