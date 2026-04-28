const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  createAutoModeProject,
  runAutoLoop
} = require('./helpers/auto-mode');
const {
  ensureFakeBin,
  writeExecutable,
  writeFakeClaude,
  writeFakeGit,
  writeFakeJq
} = require('./helpers/fake-bin');
const {
  packageRoot
} = require('./helpers/package-fixture');
const {
  makeTempDir
} = require('./helpers/temp');

function findRealCommand(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not find real ${name}`);
}

function makeEnv(binDir, extra = {}) {
  return {
    ...process.env,
    GSD_CC_DISABLE_TEE: '1',
    HOME: makeTempDir('gsd-cc-portable-home-'),
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    ...extra
  };
}

function writeDateWithoutIsoSeconds(binDir) {
  return writeExecutable(binDir, 'date', `#!/bin/sh
if [ "$1" = "-Iseconds" ]; then
  echo "date: illegal option -- Iseconds" >&2
  exit 1
fi

if [ "$1" = "+%Y-%m-%dT%H:%M:%S%z" ]; then
  echo "2026-01-01T00:00:00+0000"
else
  echo "2026-01-01"
fi
`);
}

function writeSedThatRejectsInPlace(binDir) {
  const realSed = findRealCommand('sed');
  return writeExecutable(binDir, 'sed', `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    -i|-i*)
      echo "sed -i is not portable in this test" >&2
      exit 64
      ;;
  esac
done

exec ${JSON.stringify(realSed)} "$@"
	`);
}

function writeJqThatFailsBridgeWrites(binDir) {
  return writeExecutable(binDir, 'jq', `#!/usr/bin/env node
const fs = require('fs');

const args = process.argv.slice(2);
if (args.includes('-n')) {
  process.exit(42);
}

const positional = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '-r' || arg === '-e' || arg === '-c' || arg === '-s') {
    continue;
  }
  if (arg === '--arg') {
    index += 2;
    continue;
  }
  positional.push(arg);
}

const expression = positional[0] || '';
const raw = fs.readFileSync(0, 'utf8');
const data = raw.trim() ? JSON.parse(raw) : {};

if (expression === '.cwd') {
  console.log(data.cwd || '');
  process.exit(0);
}

if (expression.includes('// empty')) {
  process.exit(0);
}

console.log('null');
`);
}

function setupBin() {
  const tempRoot = makeTempDir('gsd-cc-portable-bin-');
  const binDir = ensureFakeBin(tempRoot);
  writeFakeClaude(binDir, `#!/bin/sh
echo '{"model":"fake-claude","usage":{"input_tokens":1,"output_tokens":1}}'
`);
  writeFakeGit(binDir);
  writeFakeJq(binDir);
  writeDateWithoutIsoSeconds(binDir);
  writeSedThatRejectsInPlace(binDir);
  return binDir;
}

function runHook(hookName, input, env) {
  return spawnSync('bash', [path.join(packageRoot, 'hooks', hookName)], {
    input: JSON.stringify(input),
    env,
    encoding: 'utf8'
  });
}

function runStatuslineTenTimes(projectDir, env) {
  for (let index = 0; index < 10; index += 1) {
    const result = runHook('gsd-statusline.sh', { cwd: projectDir }, env);
    assert.strictEqual(
      result.status,
      0,
      `statusline hook failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(result.stderr, '');
  }
}

function findBridgeFile(tmpDir) {
  const bridgeEntry = fs.readdirSync(tmpDir).find((entry) => {
    return entry.startsWith('gsd-cc-bridge-') && entry.endsWith('.json');
  });
  assert.ok(bridgeEntry, 'statusline bridge file should exist');
  return path.join(tmpDir, bridgeEntry);
}

function shellRuntimeFiles() {
  const hooksDir = path.join(packageRoot, 'hooks');
  return [
    path.join(packageRoot, 'skills', 'auto', 'auto-loop.sh'),
    ...fs.readdirSync(hooksDir)
      .filter((entry) => entry.endsWith('.sh'))
      .map((entry) => path.join(hooksDir, entry))
  ];
}

function testAutoLoopDoesNotRequireBsdOrGnuDate(binDir) {
  const projectDir = createAutoModeProject({
    unified: true,
    state: {
      phase: 'unified',
      auto_mode_scope: 'slice'
    }
  });
  const result = runAutoLoop(projectDir, makeEnv(binDir));

  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `auto-loop failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(result.stdout, /\[2026-01-01T00:00:00\+0000\]/);
  assert.match(result.stdout, /Auto \(this slice\) complete/);
}

function testHooksUseConfiguredTmpdir(binDir) {
  const projectDir = createAutoModeProject();
  const tmpDir = makeTempDir('gsd-cc-portable-tmp-');
  const env = makeEnv(binDir, { TMPDIR: tmpDir });

  runStatuslineTenTimes(projectDir, env);

  const transcript = path.join(projectDir, 'transcript.jsonl');
  fs.writeFileSync(transcript, `${'{}\n'.repeat(1001)}`);
  const contextResult = runHook(
    'gsd-context-monitor.sh',
    { cwd: projectDir, transcript_path: transcript },
    env
  );

  assert.strictEqual(
    contextResult.status,
    0,
    `context hook failed\nstdout:\n${contextResult.stdout}\nstderr:\n${contextResult.stderr}`
  );

  const tmpEntries = fs.readdirSync(tmpDir);
  assert.ok(tmpEntries.some((entry) => entry.startsWith('gsd-cc-statusline-')));
  assert.ok(tmpEntries.some((entry) => entry.startsWith('gsd-cc-bridge-')));
  assert.ok(tmpEntries.some((entry) => entry.startsWith('gsd-cc-ctx-monitor-')));

  const bridge = JSON.parse(fs.readFileSync(findBridgeFile(tmpDir), 'utf8'));
  assert.strictEqual(bridge.total_slices, 0);
  assert.strictEqual(bridge.done_slices, 0);
}

function testStatuslineKeepsBridgeOnWriteFailure(binDir) {
  const projectDir = createAutoModeProject();
  const tmpDir = makeTempDir('gsd-cc-portable-tmp-');
  const env = makeEnv(binDir, { TMPDIR: tmpDir });

  runStatuslineTenTimes(projectDir, env);

  const bridgePath = findBridgeFile(tmpDir);
  const bridgeEntry = path.basename(bridgePath);
  const previousBridge = {
    phase: 'previous',
    position: 'previous',
    total_slices: 99,
    done_slices: 98
  };
  fs.writeFileSync(bridgePath, JSON.stringify(previousBridge));

  writeJqThatFailsBridgeWrites(binDir);
  runStatuslineTenTimes(projectDir, env);

  const bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));
  assert.deepStrictEqual(bridge, previousBridge);
  assert.ok(!fs.readdirSync(tmpDir).some((entry) => {
    return entry.startsWith(`${bridgeEntry}.`) && entry.endsWith('.tmp');
  }));
}

function testShellSourcesAvoidNonPortableInlineCommands() {
  for (const filePath of shellRuntimeFiles()) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(!/\bsed\s+-i\b/.test(content), `${filePath} uses sed -i`);
    assert.ok(
      !/\$\(\s*date\s+-Iseconds\s*\)/.test(content),
      `${filePath} calls date -Iseconds inline`
    );
    assert.ok(!/\/tmp\/gsd/.test(content), `${filePath} hardcodes /tmp/gsd`);
  }
}

const binDir = setupBin();

testAutoLoopDoesNotRequireBsdOrGnuDate(binDir);
testHooksUseConfiguredTmpdir(binDir);
testStatuslineKeepsBridgeOnWriteFailure(binDir);
testShellSourcesAvoidNonPortableInlineCommands();
