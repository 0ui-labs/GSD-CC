const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  assertPathExists,
  assertPathMissing,
  collectHookCommands,
  readJson
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

function updateJson(filePath, updater) {
  const value = readJson(filePath);
  updater(value);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
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

function addUnrelatedSettingsHook(settingsPath, hookPath) {
  const settings = readJson(settingsPath);
  settings.hooks = settings.hooks || {};
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  settings.hooks.PreToolUse.push({
    matcher: 'Read',
    hooks: [{
      type: 'command',
      command: hookPath,
      timeout: 1000
    }]
  });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

function assertOnlyUnrelatedHookRemains(settingsPath, hookPath) {
  const commands = collectHookCommands(readJson(settingsPath));
  assert.deepStrictEqual(commands, [hookPath]);
}

function assertDashboardAssetsRemoved(claudeBase) {
  assertPathMissing(path.join(claudeBase, 'dashboard', 'index.html'));
  assertPathMissing(path.join(claudeBase, 'dashboard', 'app.js'));
  assertPathMissing(path.join(claudeBase, 'dashboard', 'styles.css'));
  assertPathMissing(path.join(claudeBase, 'dashboard'));
}

function testGlobalUninstallKeepsUserFiles(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-uninstall-home-');
  const env = makeEnv(homeDir, binDir);
  const claudeBase = path.join(homeDir, '.claude');
  const settingsPath = path.join(claudeBase, 'settings.json');
  const unrelatedHook = path.join(claudeBase, 'hooks', 'user-hook.sh');
  const managedDirUserHook = path.join(claudeBase, 'hooks', 'gsd-cc', 'user-hook.sh');
  const unrelatedSkill = path.join(claudeBase, 'skills', 'user-skill', 'SKILL.md');
  const legacyLookingSkill = path.join(claudeBase, 'skills', 'gsd-cc-private', 'SKILL.md');

  runInstaller(fixtureRoot, ['--global'], { cwd: fixtureRoot, env });
  writeFile(unrelatedHook, '#!/bin/sh\nexit 0\n');
  writeFile(managedDirUserHook, '#!/bin/sh\nexit 0\n');
  writeFile(unrelatedSkill, '# User skill\n');
  writeFile(legacyLookingSkill, '# Legacy-looking user skill\n');
  addUnrelatedSettingsHook(settingsPath, unrelatedHook);

  runInstaller(fixtureRoot, ['--uninstall', '--global'], { cwd: fixtureRoot, env });
  runInstaller(fixtureRoot, ['--uninstall', '--global'], { cwd: fixtureRoot, env });

  assertPathMissing(path.join(claudeBase, 'gsd-cc', 'install-manifest.json'));
  assertPathMissing(path.join(claudeBase, 'skills', 'gsd-cc', 'SKILL.md'));
  assertPathMissing(path.join(claudeBase, 'hooks', 'gsd-cc', 'gsd-boundary-guard.sh'));
  assertDashboardAssetsRemoved(claudeBase);
  assertPathExists(unrelatedHook);
  assertPathExists(managedDirUserHook);
  assertPathExists(unrelatedSkill);
  assertPathExists(legacyLookingSkill);
  assertOnlyUnrelatedHookRemains(settingsPath, unrelatedHook);
}

function testLocalUninstallDoesNotTouchGlobal(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-uninstall-scope-home-');
  const projectDir = makeTempDir('gsd-cc-uninstall-project-');
  const env = makeEnv(homeDir, binDir);
  const globalBase = path.join(homeDir, '.claude');
  const localBase = path.join(projectDir, '.claude');

  runInstaller(fixtureRoot, ['--global'], { cwd: fixtureRoot, env });
  runInstaller(fixtureRoot, ['--local'], { cwd: projectDir, env });
  runInstaller(fixtureRoot, ['--uninstall', '--local'], { cwd: projectDir, env });

  assertPathExists(path.join(globalBase, 'gsd-cc', 'install-manifest.json'));
  assertPathExists(path.join(globalBase, 'skills', 'gsd-cc', 'SKILL.md'));
  assertPathMissing(path.join(localBase, 'gsd-cc', 'install-manifest.json'));
  assertPathMissing(path.join(localBase, 'skills', 'gsd-cc', 'SKILL.md'));
}

function testUnsafeManifestFilePathBlocksGlobalUninstall(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-uninstall-unsafe-home-');
  const env = makeEnv(homeDir, binDir);
  const claudeBase = path.join(homeDir, '.claude');
  const manifestPath = path.join(claudeBase, 'gsd-cc', 'install-manifest.json');
  const outsidePath = path.join(homeDir, 'outside.txt');

  runInstaller(fixtureRoot, ['--global'], { cwd: fixtureRoot, env });
  writeFile(outsidePath, 'do not delete\n');
  updateJson(manifestPath, (manifest) => {
    manifest.files = ['../outside.txt'];
  });

  const result = runInstaller(fixtureRoot, ['--uninstall', '--global'], {
    cwd: fixtureRoot,
    env
  });

  assertPathExists(outsidePath);
  assertPathExists(manifestPath);
  assertPathExists(path.join(claudeBase, 'skills', 'gsd-cc', 'SKILL.md'));
  assert.match(result.stdout, /invalid|unsafe/i);
  assert.doesNotMatch(result.stdout, /Removed GSD-CC from/);
}

function testUnsafeConfigBlockPathBlocksLocalUninstall(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-uninstall-config-home-');
  const projectDir = makeTempDir('gsd-cc-uninstall-config-project-');
  const env = makeEnv(homeDir, binDir);
  const localBase = path.join(projectDir, '.claude');
  const manifestPath = path.join(localBase, 'gsd-cc', 'install-manifest.json');
  const outsidePath = path.resolve(localBase, '..', '..', 'outside.md');
  const outsideContent = `outside before\n\n${managedLanguageBlock('Deutsch')}`;

  runInstaller(fixtureRoot, ['--local'], { cwd: projectDir, env });
  writeFile(outsidePath, outsideContent);
  updateJson(manifestPath, (manifest) => {
    manifest.managedConfigBlocks[0].file = '../../outside.md';
  });

  const result = runInstaller(fixtureRoot, ['--uninstall', '--local'], {
    cwd: projectDir,
    env
  });

  assert.strictEqual(fs.readFileSync(outsidePath, 'utf8'), outsideContent);
  assertPathExists(manifestPath);
  assertPathExists(path.join(localBase, 'skills', 'gsd-cc', 'SKILL.md'));
  assert.match(result.stdout, /invalid|unsafe/i);
  assert.doesNotMatch(result.stdout, /Removed GSD-CC from/);
}

function testInvalidManifestDoesNotFallBackToLegacyCleanup(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-uninstall-invalid-home-');
  const env = makeEnv(homeDir, binDir);
  const claudeBase = path.join(homeDir, '.claude');
  const manifestPath = path.join(claudeBase, 'gsd-cc', 'install-manifest.json');
  const legacyHook = path.join(claudeBase, 'hooks', 'gsd-boundary-guard.sh');

  writeFile(manifestPath, JSON.stringify({
    source: 'gsd-cc',
    files: '../outside.txt',
    directories: [],
    managedHooks: [],
    managedConfigBlocks: []
  }, null, 2) + '\n');
  writeFile(legacyHook, '#!/bin/sh\nexit 0\n');

  const result = runInstaller(fixtureRoot, ['--uninstall', '--global'], {
    cwd: fixtureRoot,
    env
  });

  assertPathExists(manifestPath);
  assertPathExists(legacyHook);
  assert.match(result.stdout, /manifest/i);
  assert.doesNotMatch(result.stdout, /Removed legacy GSD-CC assets/);
  assert.doesNotMatch(result.stdout, /No GSD-CC installation found/);
}

const tempRoot = makeTempDir('gsd-cc-uninstall-');
const fixtureRoot = copyPackageFixture(tempRoot);
const binDir = ensureFakeBin(tempRoot);
writeReadyDependencies(binDir);

testGlobalUninstallKeepsUserFiles(fixtureRoot, binDir);
testLocalUninstallDoesNotTouchGlobal(fixtureRoot, binDir);
testUnsafeManifestFilePathBlocksGlobalUninstall(fixtureRoot, binDir);
testUnsafeConfigBlockPathBlocksLocalUninstall(fixtureRoot, binDir);
testInvalidManifestDoesNotFallBackToLegacyCleanup(fixtureRoot, binDir);
