const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const { parseArgs } = require('../bin/install/args');
const {
  packageRoot
} = require('./helpers/package-fixture');

function runCli(args) {
  return spawnSync(
    process.execPath,
    [path.join(packageRoot, 'bin', 'install.js'), ...args],
    {
      cwd: packageRoot,
      env: process.env,
      encoding: 'utf8'
    }
  );
}

function testDashboardSubcommandRoutesToLauncher() {
  const result = runCli([
    'dashboard',
    '--host',
    '127.0.0.1',
    '--port',
    '4321',
    '--no-open'
  ]);

  assert.strictEqual(
    result.status,
    0,
    `dashboard launcher failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(result.stdout, /Dashboard launcher ready/);
  assert.match(result.stdout, /host=127\.0\.0\.1/);
  assert.match(result.stdout, /port=4321/);
  assert.match(result.stdout, /open=false/);
  assert.doesNotMatch(result.stdout, /Installing to/);
}

function testDashboardEqualsOptionsParse() {
  const options = parseArgs([
    'dashboard',
    '--host=localhost',
    '--port=5173'
  ]);

  assert.strictEqual(options.command, 'dashboard');
  assert.strictEqual(options.dashboard.host, 'localhost');
  assert.strictEqual(options.dashboard.port, 5173);
  assert.strictEqual(options.dashboard.open, true);
}

function testDashboardRejectsInvalidPort() {
  assert.throws(
    () => parseArgs(['dashboard', '--port', 'abc']),
    /--port requires a number between 1 and 65535/
  );
  assert.throws(
    () => parseArgs(['dashboard', '--port=70000']),
    /--port requires a number between 1 and 65535/
  );
}

function testInstallArgumentsStillParseAsBefore() {
  const globalOptions = parseArgs(['--global', '--yes', '--language', 'Deutsch']);
  assert.strictEqual(globalOptions.command, 'install');
  assert.strictEqual(globalOptions.global, true);
  assert.strictEqual(globalOptions.local, false);
  assert.strictEqual(globalOptions.yes, true);
  assert.strictEqual(globalOptions.language, 'Deutsch');
  assert.strictEqual(globalOptions.dashboard, null);

  const localOptions = parseArgs(['--local', '--language=English']);
  assert.strictEqual(localOptions.command, 'install');
  assert.strictEqual(localOptions.global, false);
  assert.strictEqual(localOptions.local, true);
  assert.strictEqual(localOptions.language, 'English');
  assert.strictEqual(localOptions.dashboard, null);

  const uninstallOptions = parseArgs(['--uninstall', '--global']);
  assert.strictEqual(uninstallOptions.command, 'install');
  assert.strictEqual(uninstallOptions.uninstall, true);
  assert.strictEqual(uninstallOptions.global, true);
  assert.strictEqual(uninstallOptions.dashboard, null);
}

function testInstallModeStillRejectsUnexpectedArguments() {
  assert.throws(
    () => parseArgs(['--globall']),
    /Unknown option: --globall/
  );
  assert.throws(
    () => parseArgs(['dashboard', '--global']),
    /Unknown dashboard option: --global/
  );
}

testDashboardSubcommandRoutesToLauncher();
testDashboardEqualsOptionsParse();
testDashboardRejectsInvalidPort();
testInstallArgumentsStillParseAsBefore();
testInstallModeStillRejectsUnexpectedArguments();
