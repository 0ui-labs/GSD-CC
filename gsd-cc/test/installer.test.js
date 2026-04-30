const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  assertInstalledHookCommands,
  assertPathExists,
  assertPathMissing,
  readJson
} = require('./helpers/assertions');
const {
  ensureFakeBin,
  writeFakeClaude,
  writeFakeGit,
  writeFakeJq
} = require('./helpers/fake-bin');
const {
  copyPackageFixture,
  packageRoot
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

const DASHBOARD_ASSET_PATHS = [
  path.join('dashboard', 'index.html'),
  path.join('dashboard', 'app.js'),
  path.join('dashboard', 'styles.css')
];

function toPackPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function assertDashboardAssetsInstalled(claudeBase) {
  for (const assetPath of DASHBOARD_ASSET_PATHS) {
    assertPathExists(path.join(claudeBase, assetPath));
  }
}

function assertDashboardManifestEntries(manifest) {
  for (const assetPath of DASHBOARD_ASSET_PATHS) {
    assert.ok(
      manifest.files.includes(assetPath),
      `${assetPath} should be tracked in the install manifest`
    );
  }
  assert.ok(manifest.directories.includes('dashboard'));
}

function assertPackageFilesIncludeDashboardAssets() {
  const pkg = readJson(path.join(packageRoot, 'package.json'));
  assert.ok(
    pkg.files.includes('dashboard/'),
    'package.json files should include dashboard assets'
  );

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(
    result.status,
    0,
    `npm pack dry run failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );

  const packInfo = JSON.parse(result.stdout);
  const packedFiles = new Set(packInfo[0].files.map((entry) => entry.path));
  for (const assetPath of DASHBOARD_ASSET_PATHS) {
    assert.ok(
      packedFiles.has(toPackPath(assetPath)),
      `${assetPath} should be included in npm package files`
    );
  }
}

function assertInstalledAssets(claudeBase) {
  assertPathExists(path.join(claudeBase, 'skills', 'gsd-cc', 'SKILL.md'));
  assertPathExists(path.join(claudeBase, 'skills', 'dashboard', 'SKILL.md'));
  assertPathExists(path.join(claudeBase, 'hooks', 'gsd-cc', 'gsd-boundary-guard.sh'));
  assertPathExists(path.join(claudeBase, 'templates', 'STATE.md'));
  assertPathExists(path.join(claudeBase, 'templates', 'STATE_MACHINE.json'));
  assertPathExists(path.join(claudeBase, 'checklists', 'planning-ready.md'));
  assertPathExists(path.join(claudeBase, 'scripts', 'validate-plan.js'));
  assertDashboardAssetsInstalled(claudeBase);
  assertPathExists(path.join(claudeBase, 'gsd-cc', 'install-manifest.json'));
}

function assertManifest(claudeBase, installMode) {
  const manifest = readJson(path.join(claudeBase, 'gsd-cc', 'install-manifest.json'));

  assert.strictEqual(manifest.source, 'gsd-cc');
  assert.strictEqual(manifest.installMode, installMode);
  assert.ok(manifest.files.includes(path.join('skills', 'gsd-cc', 'SKILL.md')));
  assert.ok(manifest.files.includes(path.join('skills', 'dashboard', 'SKILL.md')));
  assert.ok(manifest.files.includes(path.join('hooks', 'gsd-cc', 'gsd-boundary-guard.sh')));
  assert.ok(manifest.files.includes(path.join('scripts', 'validate-plan.js')));
  assert.ok(manifest.files.includes(path.join('templates', 'STATE.md')));
  assert.ok(manifest.files.includes(path.join('templates', 'STATE_MACHINE.json')));
  assertDashboardManifestEntries(manifest);
  assert.ok(manifest.directories.includes('gsd-cc'));
  assert.strictEqual(manifest.readiness.hooks.ready, true);
  assert.strictEqual(manifest.dependencies.jq.available, true);
  assert.ok(manifest.managedHooks.length > 0);
}

function testGlobalInstall(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-installer-home-');
  const env = makeEnv(homeDir, binDir);

  runInstaller(fixtureRoot, ['--global'], { cwd: fixtureRoot, env });

  const claudeBase = path.join(homeDir, '.claude');
  assertInstalledAssets(claudeBase);
  assertManifest(claudeBase, 'global');
  assertInstalledHookCommands(path.join(claudeBase, 'settings.json'));
  assertPathExists(path.join(claudeBase, 'CLAUDE.md'));
}

function testLocalInstall(fixtureRoot, binDir) {
  const homeDir = makeIsolatedHome('gsd-cc-installer-local-home-');
  const projectDir = makeTempDir('gsd-cc-installer-project-');
  const env = makeEnv(homeDir, binDir);

  runInstaller(fixtureRoot, ['--local'], { cwd: projectDir, env });

  const localClaudeBase = path.join(projectDir, '.claude');
  assertInstalledAssets(localClaudeBase);
  assertManifest(localClaudeBase, 'local');
  assertInstalledHookCommands(path.join(localClaudeBase, 'settings.local.json'));
  assertPathExists(path.join(projectDir, 'CLAUDE.md'));
  assertPathMissing(path.join(homeDir, '.claude', 'settings.json'));
}

const tempRoot = makeTempDir('gsd-cc-installer-');
const fixtureRoot = copyPackageFixture(tempRoot);
const binDir = ensureFakeBin(tempRoot);
writeReadyDependencies(binDir);

assertPackageFilesIncludeDashboardAssets();
testGlobalInstall(fixtureRoot, binDir);
testLocalInstall(fixtureRoot, binDir);
