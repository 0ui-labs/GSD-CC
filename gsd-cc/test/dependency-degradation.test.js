const assert = require('assert');
const path = require('path');

const {
  assertInstalledHookCommands,
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

function makeEnv(homeDir, binDir) {
  return {
    ...process.env,
    HOME: homeDir,
    PATH: binDir
  };
}

const tempRoot = makeTempDir('gsd-cc-deps-');
const fixtureRoot = copyPackageFixture(tempRoot);
const binDir = ensureFakeBin(tempRoot);
const homeDir = makeIsolatedHome('gsd-cc-deps-home-');
const env = makeEnv(homeDir, binDir);
const claudeBase = path.join(homeDir, '.claude');
const settingsPath = path.join(claudeBase, 'settings.json');
const manifestPath = path.join(claudeBase, 'gsd-cc', 'install-manifest.json');

writeFakeGit(binDir);
writeFakeClaude(binDir, `#!/bin/sh
exit 0
`);

const degradedResult = runInstaller(fixtureRoot, ['--global'], {
  cwd: fixtureRoot,
  env
});

assert.match(degradedResult.stdout, /Hooks were left disabled/);
assert.match(degradedResult.stdout, /Hooks.*disabled.*jq not found/s);
assert.match(degradedResult.stdout, /Auto-mode.*unavailable.*jq not found/s);

let settings = readJson(settingsPath);
assert.deepStrictEqual(collectHookCommands(settings), []);

let manifest = readJson(manifestPath);
assert.strictEqual(manifest.dependencies.jq.available, false);
assert.strictEqual(manifest.readiness.hooks.ready, false);
assert.deepStrictEqual(manifest.managedHooks, []);

writeFakeJq(binDir);

const readyResult = runInstaller(fixtureRoot, ['--global'], {
  cwd: fixtureRoot,
  env
});

assert.match(readyResult.stdout, /Hooks configured/);
assertInstalledHookCommands(settingsPath);

manifest = readJson(manifestPath);
assert.strictEqual(manifest.dependencies.jq.available, true);
assert.strictEqual(manifest.readiness.hooks.ready, true);
assert.ok(manifest.managedHooks.length > 0);
