const assert = require('assert');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  assertInstalledHookCommands
} = require('./helpers/assertions');
const {
  ensureFakeBin,
  writeFakeJq
} = require('./helpers/fake-bin');
const {
  copyPackageFixture,
  makeSourceHooksNonExecutable
} = require('./helpers/package-fixture');
const {
  makeIsolatedHome,
  makeTempDir
} = require('./helpers/temp');

function runInstaller(fixtureRoot, installArg, options) {
  const result = spawnSync(
    process.execPath,
    [path.join(fixtureRoot, 'bin', 'install.js'), installArg],
    {
      cwd: options.cwd,
      env: options.env,
      input: '\n',
      encoding: 'utf8'
    }
  );

  assert.strictEqual(
    result.status,
    0,
    `installer failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function assertInstalledHooks(settingsPath, env) {
  const commands = assertInstalledHookCommands(settingsPath);

  const boundaryHook = commands.find((command) => {
    return path.basename(command) === 'gsd-boundary-guard.sh';
  });
  assert.ok(boundaryHook, 'boundary guard should be configured');

  const result = spawnSync(boundaryHook, [], {
    env,
    input: JSON.stringify({
      tool_name: 'Read',
      cwd: os.tmpdir(),
      tool_input: {}
    }),
    encoding: 'utf8'
  });

  assert.strictEqual(
    result.status,
    0,
    `hook execution failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function smokeGlobalInstall(fixtureRoot, env) {
  const homeDir = makeIsolatedHome();
  const installEnv = { ...env, HOME: homeDir };
  runInstaller(fixtureRoot, '--global', { cwd: fixtureRoot, env: installEnv });
  assertInstalledHooks(path.join(homeDir, '.claude', 'settings.json'), installEnv);
}

function smokeLocalInstall(fixtureRoot, env) {
  const projectDir = makeTempDir('gsd-cc-project-');
  runInstaller(fixtureRoot, '--local', { cwd: projectDir, env });
  assertInstalledHooks(path.join(projectDir, '.claude', 'settings.local.json'), env);
}

const tempRoot = makeTempDir('gsd-cc-install-hooks-');
const fixtureRoot = copyPackageFixture(tempRoot);
makeSourceHooksNonExecutable(fixtureRoot);

const fakeBin = ensureFakeBin(tempRoot);
writeFakeJq(fakeBin);

const env = {
  ...process.env,
  HOME: makeIsolatedHome('gsd-cc-env-home-'),
  PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`
};

smokeGlobalInstall(fixtureRoot, env);
smokeLocalInstall(fixtureRoot, env);
