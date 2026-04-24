const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MANAGED_HOOK_NAMES = [
  'gsd-boundary-guard.sh',
  'gsd-context-monitor.sh',
  'gsd-prompt-guard.sh',
  'gsd-statusline.sh',
  'gsd-workflow-guard.sh'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertPathExists(targetPath, message) {
  assert.ok(fs.existsSync(targetPath), message || `${targetPath} should exist`);
}

function assertPathMissing(targetPath, message) {
  assert.ok(!fs.existsSync(targetPath), message || `${targetPath} should not exist`);
}

function assertExecutable(filePath) {
  assertPathExists(filePath);
  fs.accessSync(filePath, fs.constants.X_OK);
}

function collectHookCommands(settings) {
  if (!settings.hooks) {
    return [];
  }

  const commands = [];
  for (const entries of Object.values(settings.hooks)) {
    assert.ok(Array.isArray(entries), 'hook event entries should be arrays');
    for (const entry of entries) {
      for (const hook of entry.hooks || []) {
        commands.push(hook.command);
      }
    }
  }
  return [...new Set(commands)];
}

function assertManagedHookNames(commands) {
  const basenames = commands.map((command) => path.basename(command));

  for (const hookName of MANAGED_HOOK_NAMES) {
    assert.ok(
      basenames.includes(hookName),
      `${hookName} should be configured`
    );
  }
}

function assertInstalledHookCommands(settingsPath) {
  const settings = readJson(settingsPath);
  const commands = collectHookCommands(settings);

  assert.strictEqual(commands.length, 5, 'all managed hooks should be configured');
  assertManagedHookNames(commands);

  for (const command of commands) {
    assert.ok(command.endsWith('.sh'), `${command} should point at a shell hook`);
    assertExecutable(command);
  }

  return commands;
}

module.exports = {
  MANAGED_HOOK_NAMES,
  assertExecutable,
  assertInstalledHookCommands,
  assertManagedHookNames,
  assertPathExists,
  assertPathMissing,
  collectHookCommands,
  readJson
};
