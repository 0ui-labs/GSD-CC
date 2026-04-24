const fs = require('fs');
const path = require('path');

const {
  packageRoot
} = require('./package-fixture');

function loadStateMachine(specPath = path.join(packageRoot, 'templates', 'STATE_MACHINE.json')) {
  return JSON.parse(fs.readFileSync(specPath, 'utf8'));
}

function parseState(content) {
  const state = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (line.trim() === '---') {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    state[match[1]] = match[2].trim();
  }

  return state;
}

function parseStateFile(projectDir) {
  return parseState(fs.readFileSync(path.join(projectDir, '.gsd', 'STATE.md'), 'utf8'));
}

function isEmptyValue(value, spec) {
  if (value === undefined || value === null) {
    return true;
  }

  return spec.emptyValues.includes(String(value).trim());
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(pattern) {
  const source = pattern
    .split('*')
    .map(escapeRegex)
    .join('[^/]*');
  return new RegExp(`^${source}$`);
}

function listFiles(rootDir) {
  const files = [];

  function visit(currentDir) {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(toPosixPath(path.relative(rootDir, entryPath)));
      }
    }
  }

  visit(rootDir);
  return files;
}

function expandArtifactTemplate(template, state) {
  return template.replace(/\{([^}]+)\}/g, (_, field) => state[field] || '');
}

function artifactExists(projectDir, pattern) {
  const normalizedPattern = toPosixPath(pattern);

  if (!normalizedPattern.includes('*')) {
    return fs.existsSync(path.join(projectDir, normalizedPattern));
  }

  const regex = globToRegex(normalizedPattern);
  return listFiles(projectDir).some((filePath) => regex.test(filePath));
}

function validateTransition(fromPhase, toPhase, spec = loadStateMachine()) {
  const errors = [];
  const phaseSpec = spec.phases[fromPhase];

  if (!phaseSpec) {
    errors.push(`Unknown previous phase: ${fromPhase}`);
    return errors;
  }

  if (!spec.phases[toPhase]) {
    errors.push(`Unknown next phase: ${toPhase}`);
    return errors;
  }

  if (!phaseSpec.next.includes(toPhase)) {
    errors.push(`Illegal phase transition: ${fromPhase} -> ${toPhase}`);
  }

  return errors;
}

function validateState(projectDir, options = {}) {
  const spec = options.spec || loadStateMachine();
  const state = options.state || parseStateFile(projectDir);
  const errors = [];
  const phase = state.phase;
  const phaseSpec = spec.phases[phase];

  if (!phaseSpec) {
    errors.push(`Unknown phase: ${phase || '(missing)'}`);
    return { ok: false, errors, state };
  }

  for (const field of phaseSpec.requiredFields || []) {
    if (isEmptyValue(state[field], spec)) {
      errors.push(`Phase ${phase} is missing required field: ${field}`);
    }
  }

  for (const template of phaseSpec.requiredArtifacts || []) {
    const artifactPattern = expandArtifactTemplate(template, state);
    if (!artifactExists(projectDir, artifactPattern)) {
      errors.push(`Phase ${phase} is missing required artifact: ${artifactPattern}`);
    }
  }

  if (options.previousPhase && options.previousPhase !== phase) {
    errors.push(...validateTransition(options.previousPhase, phase, spec));
  }

  return {
    ok: errors.length === 0,
    errors,
    state
  };
}

module.exports = {
  artifactExists,
  expandArtifactTemplate,
  isEmptyValue,
  loadStateMachine,
  parseState,
  parseStateFile,
  validateState,
  validateTransition
};
