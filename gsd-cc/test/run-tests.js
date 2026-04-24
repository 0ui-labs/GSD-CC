#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testDir = __dirname;
const tests = fs.readdirSync(testDir)
  .filter((entry) => entry.endsWith('.test.js'))
  .sort();

let failed = false;

for (const testFile of tests) {
  const testPath = path.join(testDir, testFile);
  const result = spawnSync(process.execPath, [testPath], {
    cwd: path.resolve(testDir, '..'),
    env: {
      ...process.env,
      GSD_CC_TEST_RUNNER: '1'
    },
    encoding: 'utf8'
  });

  if (result.status === 0) {
    console.log(`✓ ${testFile}`);
    continue;
  }

  failed = true;
  console.error(`✗ ${testFile}`);
  if (result.stdout) {
    console.error(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`\n${tests.length} test file(s) passed.`);
