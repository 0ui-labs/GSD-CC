const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

function runInstaller(fixtureRoot, args, options) {
  const result = spawnSync(
    process.execPath,
    [path.join(fixtureRoot, 'bin', 'install.js'), ...args],
    {
      cwd: options.cwd,
      env: options.env,
      input: options.input === undefined ? '\n' : options.input,
      encoding: 'utf8'
    }
  );

  if (options.expectFailure) {
    assert.notStrictEqual(result.status, 0, 'installer should fail');
    return result;
  }

  assert.strictEqual(
    result.status,
    0,
    `installer failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );

  return result;
}

module.exports = {
  runInstaller
};
