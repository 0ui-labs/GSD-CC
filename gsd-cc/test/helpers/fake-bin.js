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
const vars = {};
const jsonVars = {};
const positional = [];
let rawOutput = false;
let exitStatus = false;
let compactOutput = false;
let nullInput = false;
let slurpInput = false;
let rawInput = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === '-r') {
    rawOutput = true;
    continue;
  }

  if (arg === '-e') {
    exitStatus = true;
    continue;
  }

  if (arg === '-c') {
    compactOutput = true;
    continue;
  }

  if (arg === '-R') {
    rawInput = true;
    continue;
  }

  if (arg === '-n') {
    nullInput = true;
    continue;
  }

  if (arg === '-s') {
    slurpInput = true;
    continue;
  }

  if (arg === '--arg') {
    vars[args[index + 1]] = args[index + 2];
    index += 2;
    continue;
  }

  if (arg === '--argjson') {
    try {
      jsonVars[args[index + 1]] = JSON.parse(args[index + 2]);
    } catch (error) {
      jsonVars[args[index + 1]] = null;
    }
    index += 2;
    continue;
  }

  positional.push(arg);
}

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

function evaluate(data, expression) {
  if (expression === '.emptyValues[]') {
    return { values: data.emptyValues || [] };
  }

  if (expression === '.phases[$phase] // empty') {
    return data.phases && data.phases[vars.phase] !== undefined
      ? data.phases[vars.phase]
      : { missing: true };
  }

  if (expression === '.phases[$phase].requiredFields[]?') {
    const phase = data.phases && data.phases[vars.phase];
    return { values: phase && phase.requiredFields || [] };
  }

  if (expression === '.phases[$phase].requiredArtifacts[]?') {
    const phase = data.phases && data.phases[vars.phase];
    return { values: phase && phase.requiredArtifacts || [] };
  }

  if (expression === '.phases[$from].next | index($to)') {
    const phase = data.phases && data.phases[vars.from];
    const index = phase && Array.isArray(phase.next) ? phase.next.indexOf(vars.to) : -1;
    return index >= 0 ? index : null;
  }

  return getPath(data, expression || '');
}

function printValue(value) {
  if (value && value.values) {
    for (const entry of value.values) {
      console.log(entry);
    }
    process.exit(0);
  }

  if (value && value.missing) {
    process.exit(exitStatus ? 1 : 0);
  }

  if (value === undefined || value === null) {
    if (exitStatus) {
      console.log('null');
      process.exit(1);
    }
    console.log('null');
    process.exit(0);
  }

  if (typeof value === 'object') {
    console.log(JSON.stringify(value));
  } else {
    console.log(value);
  }
}

if (compactOutput) {
  console.log('{}');
  process.exit(0);
}

const expression = positional[0] || '';

if (rawInput && slurpInput) {
  const raw = readInput(positional[1]);
  console.log(JSON.stringify(raw.split('\\n').filter((line) => line.length > 0)));
  process.exit(0);
}

if (nullInput) {
  if (expression.includes('total_slices') && expression.includes('done_slices')) {
    if (!/^[0-9]+$/.test(vars.total || '') || !/^[0-9]+$/.test(vars.done || '')) {
      console.error('jq: invalid numeric input');
      process.exit(5);
    }

    console.log(JSON.stringify({
      phase: vars.phase || '',
      position: vars.position || '',
      total_slices: Number(vars.total),
      done_slices: Number(vars.done)
    }));
    process.exit(0);
  }

  if (expression.includes('BOUNDARY VIOLATION')) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: \`BOUNDARY VIOLATION: \${vars.file} is in the DO NOT CHANGE list for this task.\`
      }
    }));
    process.exit(0);
  }

  if (expression.includes('PROMPT INJECTION BLOCKED')) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: \`PROMPT INJECTION BLOCKED: \${vars.reason} in \${vars.file}.\`
      }
    }));
    process.exit(0);
  }

  if (expression.includes('commits_since_start')) {
    console.log(JSON.stringify({
      status: vars.status || '',
      reason: vars.reason || '',
      message: vars.message || '',
      scope: vars.scope || '',
      unit: vars.unit || '',
      phase: vars.phase || '',
      dispatch_phase: vars.dispatch_phase || '',
      started_at: vars.started_at || '',
      stopped_at: vars.stopped_at || '',
      start_branch: vars.start_branch || '',
      current_branch: vars.current_branch || '',
      start_head: vars.start_head || '',
      current_head: vars.current_head || '',
      commits_since_start: jsonVars.commits_since_start || [],
      uncommitted_files: jsonVars.uncommitted_files || [],
      log_file: vars.log_file || '',
      safe_next_action: vars.safe_next_action || ''
    }));
    process.exit(0);
  }

  console.log('{}');
  process.exit(0);
}

if (slurpInput) {
  const raw = readInput(positional[1]);
  const total = raw
    .split('\\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {};
      }
    })
    .reduce((sum, entry) => {
      const usage = entry.usage || {};
      return sum + (usage.input_tokens || 0) + (usage.output_tokens || 0);
    }, 0);
  console.log(String(total));
  process.exit(0);
}

const raw = readInput(positional[1]);
const data = raw.trim() ? JSON.parse(raw) : {};

if (expression && expression.includes('join("\\\\t")')) {
  const values = [
    data.tool_name,
    data.cwd,
    data.tool_input && data.tool_input.file_path || ''
  ];
  console.log(values.map((value) => value == null ? '' : value).join('\\t'));
  process.exit(0);
}

const value = evaluate(data, expression);
if ((value === undefined || value === null) && expression.includes('// empty')) {
  process.exit(0);
}
printValue(value);
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
