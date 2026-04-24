const fs = require('fs');
const path = require('path');

function ensureFakeBin(tempRoot) {
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  return binDir;
}

function writeExecutable(binDir, name, content) {
  fs.mkdirSync(binDir, { recursive: true });
  const executablePath = path.join(binDir, name);
  fs.writeFileSync(executablePath, content, { mode: 0o755 });
  fs.chmodSync(executablePath, 0o755);
  return executablePath;
}

function writeFakeJq(binDir) {
  return writeExecutable(binDir, 'jq', `#!/usr/bin/env node
const fs = require('fs');

const args = process.argv.slice(2);

function readInput(fileArg) {
  if (fileArg) {
    return fs.existsSync(fileArg) ? fs.readFileSync(fileArg, 'utf8') : '';
  }
  return fs.readFileSync(0, 'utf8');
}

function getPath(data, expression) {
  const clean = expression
    .replace(/\\/\\/ empty/g, '')
    .replace(/^\\./, '')
    .trim();

  if (!clean) {
    return data;
  }

  return clean.split('.').reduce((value, key) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    return value[key];
  }, data);
}

if (args[0] === '-n') {
  console.log('{}');
  process.exit(0);
}

if (args[0] === '-c') {
  console.log('{}');
  process.exit(0);
}

const raw = readInput(args[0] === '-r' ? args[2] : args[1]);
const data = raw.trim() ? JSON.parse(raw) : {};
const expression = args[0] === '-r' ? args[1] : args[0];

if (expression && expression.includes('join("\\\\t")')) {
  const values = [
    data.tool_name,
    data.cwd,
    data.tool_input && data.tool_input.file_path || ''
  ];
  console.log(values.map((value) => value == null ? '' : value).join('\\t'));
  process.exit(0);
}

const value = getPath(data, expression || '');

if (value === undefined || value === null) {
  if (expression && expression.includes('// empty')) {
    process.exit(0);
  }
  console.log('null');
  process.exit(0);
}

if (typeof value === 'object') {
  console.log(JSON.stringify(value));
} else {
  console.log(value);
}
`);
}

function writeFakeClaude(binDir, content) {
  return writeExecutable(binDir, 'claude', content);
}

function writeFakeGit(binDir) {
  return writeExecutable(binDir, 'git', `#!/bin/sh
exit 0
`);
}

function writeFakeDate(binDir) {
  return writeExecutable(binDir, 'date', `#!/bin/sh
if [ "$1" = "-Iseconds" ]; then
  echo "2026-01-01T00:00:00+00:00"
else
  echo "2026-01-01"
fi
`);
}

module.exports = {
  ensureFakeBin,
  writeExecutable,
  writeFakeClaude,
  writeFakeDate,
  writeFakeGit,
  writeFakeJq
};
