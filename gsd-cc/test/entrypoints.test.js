const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  packageRoot
} = require('./helpers/package-fixture');

function testInstallerEntrypointLoadsCliModule() {
  const result = spawnSync(
    process.execPath,
    [path.join(packageRoot, 'bin', 'install.js'), '--help'],
    {
      cwd: packageRoot,
      env: process.env,
      encoding: 'utf8'
    }
  );

  assert.strictEqual(
    result.status,
    0,
    `installer help failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--uninstall/);
}

function testAutoLoopAndLibrariesParseAsBash() {
  const autoDir = path.join(packageRoot, 'skills', 'auto');
  const shellFiles = [
    path.join(autoDir, 'auto-loop.sh'),
    ...fs.readdirSync(path.join(autoDir, 'lib'))
      .filter((entry) => entry.endsWith('.sh'))
      .map((entry) => path.join(autoDir, 'lib', entry))
  ];

  for (const shellFile of shellFiles) {
    const result = spawnSync('bash', ['-n', shellFile], {
      cwd: packageRoot,
      env: process.env,
      encoding: 'utf8'
    });

    assert.strictEqual(
      result.status,
      0,
      `${shellFile} failed bash -n\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
}

function testConfigSkillDocumentsManagedBlock() {
  const configSkill = fs.readFileSync(
    path.join(packageRoot, 'skills', 'config', 'SKILL.md'),
    'utf8'
  );

  assert.match(configSkill, /<!-- gsd-cc:config:start -->/);
  assert.match(configSkill, /<!-- gsd-cc:config:end -->/);
  assert.match(configSkill, /GSD-CC commit language:/);
  assert.match(configSkill, /Preserve any existing `GSD-CC commit language:` value/);
  assert.match(configSkill, /Preserve any existing `GSD-CC language:` value/);
  assert.match(configSkill, /legacy unmarked `# GSD-CC Config` section/);
}

testInstallerEntrypointLoadsCliModule();
testAutoLoopAndLibrariesParseAsBash();
testConfigSkillDocumentsManagedBlock();
