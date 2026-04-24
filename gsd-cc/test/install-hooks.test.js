const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const packageRoot = path.resolve(__dirname, '..');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyPackageFixture(tempRoot) {
  const fixtureRoot = path.join(tempRoot, 'gsd-cc');
  fs.cpSync(packageRoot, fixtureRoot, {
    recursive: true,
    filter: (source) => {
      return !source.includes(`${path.sep}.git${path.sep}`);
    }
  });
  return fixtureRoot;
}

function makeSourceHooksNonExecutable(fixtureRoot) {
  const hooksDir = path.join(fixtureRoot, 'hooks');
  for (const entry of fs.readdirSync(hooksDir)) {
    if (entry.endsWith('.sh')) {
      fs.chmodSync(path.join(hooksDir, entry), 0o644);
    }
  }
}

function writeFakeJq(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const jqPath = path.join(binDir, 'jq');
  fs.writeFileSync(jqPath, `#!/usr/bin/env node
const fs = require('fs');

const args = process.argv.slice(2);

if (args[0] === '-n') {
  console.log('{}');
  process.exit(0);
}

const input = fs.readFileSync(0, 'utf8');
const data = input.trim() ? JSON.parse(input) : {};
const expression = args[0] === '-r' ? args[1] : args[0];

const values = {
  '.tool_name': data.tool_name,
  '.cwd': data.cwd,
  '.tool_input.file_path // empty': data.tool_input && data.tool_input.file_path
};

const value = Object.prototype.hasOwnProperty.call(values, expression)
  ? values[expression]
  : undefined;

if (value === undefined || value === null) {
  if (expression && expression.includes('// empty')) {
    process.exit(0);
  }
  console.log('null');
  process.exit(0);
}

console.log(value);
`, { mode: 0o755 });
  fs.chmodSync(jqPath, 0o755);
}

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectHookCommands(settings) {
  assert.ok(settings.hooks, 'settings should contain hooks');
  assert.ok(
    Array.isArray(settings.hooks.PreToolUse) && settings.hooks.PreToolUse.length > 0,
    'settings should contain PreToolUse hooks'
  );
  assert.ok(
    Array.isArray(settings.hooks.PostToolUse) && settings.hooks.PostToolUse.length > 0,
    'settings should contain PostToolUse hooks'
  );

  const commands = [];
  for (const entries of Object.values(settings.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks || []) {
        commands.push(hook.command);
      }
    }
  }
  return [...new Set(commands)];
}

function assertExecutable(filePath) {
  assert.ok(fs.existsSync(filePath), `${filePath} should exist`);
  fs.accessSync(filePath, fs.constants.X_OK);
}

function assertInstalledHooks(settingsPath, env) {
  const settings = readJson(settingsPath);
  const commands = collectHookCommands(settings);
  assert.strictEqual(commands.length, 5, 'all managed hooks should be configured');

  for (const command of commands) {
    assert.ok(command.endsWith('.sh'), `${command} should point directly at a shell hook`);
    assertExecutable(command);
  }

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
  const homeDir = makeTempDir('gsd-cc-home-');
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

const fakeBin = path.join(tempRoot, 'bin');
writeFakeJq(fakeBin);

const env = {
  ...process.env,
  HOME: makeTempDir('gsd-cc-env-home-'),
  PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`
};

smokeGlobalInstall(fixtureRoot, env);
smokeLocalInstall(fixtureRoot, env);
