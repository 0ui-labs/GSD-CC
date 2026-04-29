const fs = require('fs');
const path = require('path');

const UNKNOWN = 'unknown';

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
      rigor: UNKNOWN
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

  return createEmptyDashboardModel(normalizedProjectRoot, {
    gsdExists: hasDirectory(gsdDir)
  });
}

module.exports = {
  buildDashboardModel
};
