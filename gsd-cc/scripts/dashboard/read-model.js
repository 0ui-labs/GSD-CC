const fs = require('fs');
const path = require('path');

const UNKNOWN = 'unknown';
const EMPTY_FIELD_VALUES = new Set([
  '',
  '-',
  '\u2014',
  '""',
  "''"
]);

function normalizeProjectRoot(projectRoot) {
  return path.resolve(projectRoot || process.cwd());
}

function hasDirectory(directoryPath) {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    return false;
  }
}

function readOptionalTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return '';
    }
    return '';
  }
}

function parseKeyValueFields(content) {
  const fields = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);

    if (match) {
      fields[match[1]] = match[2];
    }
  }

  return fields;
}

function parseProjectTypeFromConfig(content) {
  const match = content.match(/^#\s+(.+?)\s+(?:-|\u2013|\u2014)\s+Configuration\s*$/im);

  if (!match) {
    return null;
  }

  return match[1]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeFieldValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let normalized = String(value).trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (EMPTY_FIELD_VALUES.has(normalized)) {
    return null;
  }

  return normalized;
}

function firstKnownValue(...values) {
  for (const value of values) {
    const normalized = normalizeFieldValue(value);

    if (normalized) {
      return normalized;
    }
  }

  return UNKNOWN;
}

function isKnown(value) {
  return value !== UNKNOWN;
}

function describeCurrentUnit(current, includeTask = true) {
  const parts = [];

  if (isKnown(current.slice)) {
    parts.push(current.slice);
  }

  if (includeTask && isKnown(current.task)) {
    parts.push(current.task);
  }

  return parts.length > 0 ? parts.join('/') : 'the current work';
}

function resolveNextAction(model) {
  const { current, automation } = model;

  switch (current.phase) {
    case 'seed':
    case 'seed-complete':
      return 'Run /gsd-cc to continue project setup.';
    case 'stack-complete':
    case 'roadmap-complete':
    case 'discuss-complete':
      return 'Run /gsd-cc to choose the next project step.';
    case 'plan':
      return `Continue planning ${describeCurrentUnit(current, false)}.`;
    case 'plan-complete':
      return `Apply ${describeCurrentUnit(current)} or start auto-mode for ${automation.scope} scope.`;
    case 'applying':
      return `Wait for ${describeCurrentUnit(current)} to finish, then review the task summary.`;
    case 'apply-blocked':
      return `Resolve the blocker for ${describeCurrentUnit(current)} before continuing.`;
    case 'apply-complete':
      return `Run UNIFY for ${describeCurrentUnit(current, false)}.`;
    case 'unify-failed':
    case 'unify-blocked':
      return `Review the UNIFY report for ${describeCurrentUnit(current, false)} before merging.`;
    case 'unified':
      return 'Choose the next slice or milestone action.';
    case 'milestone-complete':
      return 'Choose the next milestone or finish the project.';
    default:
      return 'Add GSD-CC project state to show dashboard details.';
  }
}

function createNoProjectAttentionItem() {
  return {
    id: 'no-project',
    severity: 'info',
    title: 'No GSD-CC project found',
    message: 'No .gsd directory was found for this project.',
    source: null,
    recommended_action: 'Run /gsd-cc to initialize this project.'
  };
}

function createEmptyDashboardModel(projectRoot, options = {}) {
  const gsdExists = Boolean(options.gsdExists);

  return {
    project: {
      root: projectRoot,
      name: path.basename(projectRoot),
      gsd_dir: '.gsd',
      has_gsd: gsdExists,
      language: UNKNOWN,
      project_type: UNKNOWN,
      rigor: UNKNOWN,
      base_branch: UNKNOWN
    },
    current: {
      milestone: UNKNOWN,
      slice: UNKNOWN,
      task: UNKNOWN,
      phase: gsdExists ? UNKNOWN : 'no-project',
      task_name: UNKNOWN,
      next_action: gsdExists
        ? 'Add GSD-CC project state to show dashboard details.'
        : 'Run /gsd-cc to initialize this project.'
    },
    attention: gsdExists ? [] : [createNoProjectAttentionItem()],
    automation: {
      status: 'inactive',
      scope: UNKNOWN,
      unit: null,
      pid: null,
      started_at: null
    },
    progress: {
      slices: [],
      acceptance_criteria: {
        total: 0,
        passed: 0,
        partial: 0,
        failed: 0,
        pending: 0
      }
    },
    current_task: {
      risk: {
        level: UNKNOWN,
        reason: ''
      },
      files: [],
      boundaries: [],
      acceptance_criteria: [],
      action: [],
      verify: [],
      done: null,
      warnings: []
    },
    activity: [],
    evidence: {
      latest_unify: null,
      latest_recovery: null,
      approval_request: null,
      recent_decisions: []
    },
    costs: {
      available: false
    }
  };
}

function buildDashboardModel(projectRoot) {
  const normalizedProjectRoot = normalizeProjectRoot(projectRoot);
  const gsdDir = path.join(normalizedProjectRoot, '.gsd');
  const gsdExists = hasDirectory(gsdDir);
  const stateContent = gsdExists
    ? readOptionalTextFile(path.join(gsdDir, 'STATE.md'))
    : '';
  const configContent = gsdExists
    ? readOptionalTextFile(path.join(gsdDir, 'CONFIG.md'))
    : '';
  const stateFields = parseKeyValueFields(stateContent);
  const configFields = parseKeyValueFields(configContent);
  const configProjectType = parseProjectTypeFromConfig(configContent);
  const model = createEmptyDashboardModel(normalizedProjectRoot, {
    gsdExists
  });

  if (!gsdExists) {
    return model;
  }

  model.project.language = firstKnownValue(
    stateFields.language,
    configFields.language
  );
  model.project.project_type = firstKnownValue(
    stateFields.project_type,
    configFields.project_type,
    configFields.type,
    configProjectType
  );
  model.project.rigor = firstKnownValue(
    stateFields.rigor,
    configFields.rigor
  );
  model.project.base_branch = firstKnownValue(
    stateFields.base_branch,
    configFields.base_branch
  );

  model.current.milestone = firstKnownValue(stateFields.milestone);
  model.current.slice = firstKnownValue(
    stateFields.current_slice,
    stateFields.slice
  );
  model.current.task = firstKnownValue(
    stateFields.current_task,
    stateFields.task
  );
  model.current.phase = firstKnownValue(stateFields.phase);
  model.automation.scope = firstKnownValue(
    stateFields.auto_mode_scope,
    configFields.auto_mode_scope
  );
  model.current.next_action = resolveNextAction(model);

  return model;
}

module.exports = {
  buildDashboardModel
};
