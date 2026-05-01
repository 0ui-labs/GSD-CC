const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  diffGsdSnapshots,
  snapshotGsdDirectory,
  watchDashboardFiles
} = require('../scripts/dashboard/watch');
const {
  makeTempDir
} = require('./helpers/temp');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForCondition(label, condition, timeoutMs = 1000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      if (condition()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${label}.`));
        return;
      }

      setTimeout(check, 10);
    }

    check();
  });
}

function waitForUpdates(updates, count, timeoutMs = 1000) {
  return waitForCondition(
    `${count} dashboard watcher update(s)`,
    () => updates.length >= count,
    timeoutMs
  );
}

async function testSnapshotDiffReportsGsdFileChanges() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-watch-diff-');
  const missingSnapshot = snapshotGsdDirectory(projectRoot);

  assert.strictEqual(missingSnapshot.hasGsd, false);
  assert.deepStrictEqual(Array.from(missingSnapshot.entries.keys()), []);

  fs.mkdirSync(path.join(projectRoot, '.gsd'));
  fs.writeFileSync(path.join(projectRoot, '.gsd', 'STATE.md'), 'phase: plan\n');

  const nextSnapshot = snapshotGsdDirectory(projectRoot);
  const diff = diffGsdSnapshots(missingSnapshot, nextSnapshot);

  assert.strictEqual(nextSnapshot.hasGsd, true);
  assert.strictEqual(diff.changed, true);
  assert.ok(diff.paths.includes('.gsd'));
  assert.ok(diff.paths.includes('.gsd/STATE.md'));
}

async function testMissingGsdCreationEmitsDebouncedUpdate() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-watch-missing-');
  const updates = [];
  const watcher = watchDashboardFiles(projectRoot, (event) => {
    updates.push(event);
  }, {
    debounceMs: 40,
    forcePolling: true,
    pollIntervalMs: 10
  });

  try {
    assert.strictEqual(watcher.getMode(), 'polling');
    assert.strictEqual(watcher.getSnapshot().hasGsd, false);

    fs.mkdirSync(path.join(projectRoot, '.gsd'));

    await waitForUpdates(updates, 1);
    await sleep(80);

    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].hasGsd, true);
    assert.ok(updates[0].paths.includes('.gsd'));
    assert.deepStrictEqual(updates[0].reasons, ['poll']);
  } finally {
    watcher.close();
  }
}

async function testRapidFileChangesEmitOneDebouncedUpdate() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-watch-rapid-');
  const gsdDir = path.join(projectRoot, '.gsd');
  const statePath = path.join(gsdDir, 'STATE.md');
  const updates = [];

  fs.mkdirSync(gsdDir);

  const watcher = watchDashboardFiles(projectRoot, (event) => {
    updates.push(event);
  }, {
    debounceMs: 250,
    forcePolling: true,
    pollIntervalMs: 10
  });

  try {
    fs.writeFileSync(statePath, 'phase: plan\n');
    await waitForCondition(
      'watcher to observe created STATE.md',
      () => watcher.getSnapshot().entries.has('STATE.md')
    );

    fs.writeFileSync(statePath, 'phase: applying\n');
    await sleep(30);

    fs.unlinkSync(statePath);
    await waitForCondition(
      'watcher to observe deleted STATE.md',
      () => !watcher.getSnapshot().entries.has('STATE.md')
    );

    await waitForUpdates(updates, 1, 1500);
    await sleep(350);

    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].hasGsd, true);
    assert.ok(updates[0].paths.includes('.gsd/STATE.md'));
    assert.ok(updates[0].reasons.includes('poll'));
  } finally {
    watcher.close();
  }
}

async function testCloseStopsFutureUpdates() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-watch-close-');
  const updates = [];
  const watcher = watchDashboardFiles(projectRoot, (event) => {
    updates.push(event);
  }, {
    debounceMs: 20,
    forcePolling: true,
    pollIntervalMs: 10
  });

  watcher.close();
  fs.mkdirSync(path.join(projectRoot, '.gsd'));
  await sleep(80);

  assert.deepStrictEqual(updates, []);
}

async function run() {
  await testSnapshotDiffReportsGsdFileChanges();
  await testMissingGsdCreationEmitsDebouncedUpdate();
  await testRapidFileChangesEmitOneDebouncedUpdate();
  await testCloseStopsFutureUpdates();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
