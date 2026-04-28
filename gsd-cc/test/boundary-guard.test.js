const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  ensureFakeBin,
  writeFakeJq
} = require('./helpers/fake-bin');
const {
  packageRoot
} = require('./helpers/package-fixture');
const {
  makeTempDir
} = require('./helpers/temp');

function createProject(boundaries) {
  const projectDir = makeTempDir('gsd-cc-boundary-');
  const gsdDir = path.join(projectDir, '.gsd');
  fs.mkdirSync(gsdDir, { recursive: true });
  fs.writeFileSync(
    path.join(gsdDir, 'STATE.md'),
    [
      '---',
      'phase: applying',
      '---',
      '',
      '## Boundaries Active',
      '',
      ...boundaries.map((boundary) => `- ${boundary}`),
      '',
      '## Decisions This Slice',
      ''
    ].join('\n')
  );
  return projectDir;
}

function runBoundaryGuard(projectDir, filePath, options = {}) {
  const tempRoot = makeTempDir('gsd-cc-boundary-bin-');
  const fakeBin = ensureFakeBin(tempRoot);
  writeFakeJq(fakeBin);

  return spawnSync(
    'bash',
    [path.join(packageRoot, 'hooks', 'gsd-boundary-guard.sh')],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`
      },
      input: JSON.stringify({
        tool_name: options.toolName || 'Write',
        cwd: projectDir,
        tool_input: { file_path: filePath }
      }),
      encoding: 'utf8'
    }
  );
}

function assertAllowed(result) {
  assert.strictEqual(
    result.status,
    0,
    `hook failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.strictEqual(result.stdout, '');
}

function assertDenied(result) {
  assert.strictEqual(
    result.status,
    0,
    `hook failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.hookSpecificOutput.permissionDecision, 'deny');
}

function testExactBoundaryBlocksFile() {
  const projectDir = createProject(['src/locked.js (owned by T01)']);
  const result = runBoundaryGuard(projectDir, 'src/locked.js');
  assertDenied(result);
}

function testDirectoryBoundaryBlocksChildren() {
  const projectDir = createProject(['src/locked (owned by T01)']);
  const result = runBoundaryGuard(projectDir, 'src/locked/child.js');
  assertDenied(result);
}

function testDirectoryBoundaryHonorsSlashBoundary() {
  const projectDir = createProject(['src/locked (owned by T01)']);
  const result = runBoundaryGuard(projectDir, 'src/lockedness/child.js');
  assertAllowed(result);
}

function testTrailingSlashBoundaryBlocksChildren() {
  const projectDir = createProject(['src/locked/ (owned by T01)']);
  const result = runBoundaryGuard(
    projectDir,
    path.join(projectDir, 'src', 'locked', 'child.js')
  );
  assertDenied(result);
}

function testGlobBoundaryBlocksMatches() {
  const projectDir = createProject(['src/**/*.generated.js (generated)']);
  const result = runBoundaryGuard(projectDir, 'src/client/view.generated.js');
  assertDenied(result);
}

function testMultiEditUsesBoundaryGuard() {
  const projectDir = createProject(['src/locked (owned by T01)']);
  const result = runBoundaryGuard(projectDir, 'src/locked/child.js', {
    toolName: 'MultiEdit'
  });
  assertDenied(result);
}

testExactBoundaryBlocksFile();
testDirectoryBoundaryBlocksChildren();
testDirectoryBoundaryHonorsSlashBoundary();
testTrailingSlashBoundaryBlocksChildren();
testGlobBoundaryBlocksMatches();
testMultiEditUsesBoundaryGuard();
