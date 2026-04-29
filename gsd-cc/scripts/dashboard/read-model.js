const fs = require('fs');
const path = require('path');

const {
  createEmptyTaskPlan,
  parseTaskPlanXml
} = require('./task-plan-parser');

const UNKNOWN = 'unknown';
const EMPTY_FIELD_VALUES = new Set([
  '',
  '-',
  '\u2014',
  '""',
  "''"
]);
const DASHBOARD_PHASE_STATUS = new Map([
  ['apply-blocked', 'blocked'],
  ['unify-blocked', 'blocked'],
  ['apply-failed', 'failed'],
  ['unify-failed', 'failed'],
  ['apply-complete', 'apply-complete'],
  ['applying', 'running'],
  ['plan', 'running'],
  ['plan-complete', 'planned'],
  ['unified', 'unified']
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

function hasFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    return false;
  }
}

function readDirectoryEntries(directoryPath) {
  try {
    return fs.readdirSync(directoryPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    return [];
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

function sameIdentifier(left, right) {
  const normalizedLeft = normalizeFieldValue(left);
  const normalizedRight = normalizeFieldValue(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft.toUpperCase() === normalizedRight.toUpperCase();
}

function toDisplayPath(fileName) {
  return `.gsd/${fileName}`;
}

function compareIds(left, right) {
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function sortById(items, key = 'id') {
  return items.sort((left, right) => compareIds(left[key], right[key]));
}

function ensureArrayMapEntry(map, key) {
  if (!map.has(key)) {
    map.set(key, []);
  }

  return map.get(key);
}

function cleanHeadingName(value) {
  const normalized = normalizeFieldValue(
    String(value || '').replace(/\s+#+\s*$/, '')
  );

  return normalized || UNKNOWN;
}

function parseMilestoneName(content, milestoneId) {
  const headingPattern = new RegExp(
    `^\\s{0,3}#\\s+${milestoneId}\\b(?:\\s*(?:[-\\u2013\\u2014:]\\s*)?(.+?))?\\s*$`,
    'im'
  );
  const match = String(content || '').match(headingPattern);

  if (!match) {
    return UNKNOWN;
  }

  return cleanHeadingName(match[1]);
}

function parseRoadmapSlices(roadmap, content) {
  const slices = [];
  const lines = String(content || '').split(/\r?\n/);
  const headingPattern = /^\s{0,3}#{2,6}\s+(S[0-9]+)\b(?:\s*(?:[-\u2013\u2014:]\s*)?(.+?))?\s*$/i;

  for (const line of lines) {
    const match = line.match(headingPattern);

    if (!match) {
      continue;
    }

    slices.push({
      id: match[1].toUpperCase(),
      name: cleanHeadingName(match[2]),
      milestone: roadmap.id,
      milestone_name: parseMilestoneName(content, roadmap.id),
      roadmap: roadmap.displayPath
    });
  }

  return slices;
}

function createArtifact(fileName, extra = {}) {
  return {
    ...extra,
    fileName,
    displayPath: toDisplayPath(fileName)
  };
}

function discoverGsdArtifacts(gsdDir) {
  const artifacts = {
    roadmaps: [],
    slicePlans: new Map(),
    taskPlansBySlice: new Map(),
    summariesBySlice: new Map(),
    unifiesBySlice: new Map(),
    sliceIds: new Set()
  };

  for (const entry of readDirectoryEntries(gsdDir)) {
    let match = entry.match(/^(M[0-9]+)-ROADMAP\.md$/i);

    if (match) {
      artifacts.roadmaps.push(createArtifact(entry, {
        id: match[1].toUpperCase()
      }));
      continue;
    }

    match = entry.match(/^(S[0-9]+)-PLAN\.md$/i);
    if (match) {
      const slice = match[1].toUpperCase();
      artifacts.sliceIds.add(slice);
      artifacts.slicePlans.set(slice, createArtifact(entry, { slice }));
      continue;
    }

    match = entry.match(/^(S[0-9]+)-(T[0-9]+)-PLAN\.xml$/i);
    if (match) {
      const slice = match[1].toUpperCase();
      const task = match[2].toUpperCase();
      artifacts.sliceIds.add(slice);
      ensureArrayMapEntry(artifacts.taskPlansBySlice, slice).push(
        createArtifact(entry, {
          slice,
          task,
          taskId: `${slice}-${task}`
        })
      );
      continue;
    }

    match = entry.match(/^(S[0-9]+)-(T[0-9]+)-SUMMARY\.md$/i);
    if (match) {
      const slice = match[1].toUpperCase();
      const task = match[2].toUpperCase();
      artifacts.sliceIds.add(slice);
      ensureArrayMapEntry(artifacts.summariesBySlice, slice).push(
        createArtifact(entry, {
          slice,
          task,
          taskId: `${slice}-${task}`
        })
      );
      continue;
    }

    match = entry.match(/^(S[0-9]+)-UNIFY\.md$/i);
    if (match) {
      const slice = match[1].toUpperCase();
      artifacts.sliceIds.add(slice);
      artifacts.unifiesBySlice.set(slice, createArtifact(entry, { slice }));
    }
  }

  sortById(artifacts.roadmaps);

  for (const taskPlans of artifacts.taskPlansBySlice.values()) {
    sortById(taskPlans, 'task');
  }

  for (const summaries of artifacts.summariesBySlice.values()) {
    sortById(summaries, 'task');
  }

  return artifacts;
}

function extractMarkdownStatus(content) {
  const statusField = String(content || '').match(/^status:\s*(.+?)\s*$/im);

  if (statusField) {
    return normalizeStatusToken(statusField[1]);
  }

  const statusSection = [];
  let inStatusSection = false;

  for (const line of String(content || '').split(/\r?\n/)) {
    if (/^\s{0,3}##\s+Status\s*$/i.test(line)) {
      inStatusSection = true;
      continue;
    }

    if (inStatusSection && /^\s{0,3}##\s+/.test(line)) {
      break;
    }

    if (inStatusSection) {
      statusSection.push(line);
    }
  }

  for (const line of statusSection) {
    const normalized = normalizeStatusToken(line);

    if (normalized !== UNKNOWN) {
      return normalized;
    }
  }

  return UNKNOWN;
}

function normalizeStatusToken(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[-*]\s+/, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/g, '');

  if (!normalized) {
    return UNKNOWN;
  }

  const firstToken = normalized.split(/\s+/)[0];
  if (['complete', 'partial', 'blocked', 'failed'].includes(firstToken)) {
    return firstToken;
  }

  if (firstToken === 'pass' || firstToken === 'passed') {
    return 'complete';
  }

  if (firstToken === 'fail') {
    return 'failed';
  }

  return UNKNOWN;
}

function summarizeTaskStatus(statuses) {
  const summary = {
    complete: 0,
    partial: 0,
    blocked: 0,
    failed: 0,
    unknown: 0
  };

  for (const status of statuses) {
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    } else {
      summary.unknown += 1;
    }
  }

  return summary;
}

function taskNameFromPlan(gsdDir, taskPlan) {
  const parsed = parseTaskPlanXml(
    readOptionalTextFile(path.join(gsdDir, taskPlan.fileName)),
    {
      expectedTaskId: taskPlan.taskId,
      planPath: path.join(gsdDir, taskPlan.fileName)
    }
  );

  return parsed.name;
}

function buildTaskProgress(gsdDir, taskPlans, summaries) {
  const summariesByTask = new Map();

  for (const summary of summaries) {
    summariesByTask.set(summary.task, summary);
  }

  const knownTaskIds = new Set([
    ...taskPlans.map((taskPlan) => taskPlan.task),
    ...summaries.map((summary) => summary.task)
  ]);
  const items = sortById([...knownTaskIds].map((task) => {
    const plan = taskPlans.find((taskPlan) => taskPlan.task === task) || null;
    const summary = summariesByTask.get(task) || null;
    const summaryStatus = summary
      ? extractMarkdownStatus(readOptionalTextFile(path.join(gsdDir, summary.fileName)))
      : 'pending';

    return {
      id: task,
      task_id: plan ? plan.taskId : `${summary.slice}-${task}`,
      name: plan ? taskNameFromPlan(gsdDir, plan) : UNKNOWN,
      status: summary ? summaryStatus : 'pending',
      artifacts: {
        plan: plan ? plan.displayPath : null,
        summary: summary ? summary.displayPath : null
      }
    };
  }));
  const completed = items.filter((item) => item.artifacts.summary).length;
  const statusCounts = summarizeTaskStatus(
    items
      .filter((item) => item.artifacts.summary)
      .map((item) => item.status)
  );

  return {
    total: taskPlans.length,
    planned: taskPlans.length,
    completed,
    pending: Math.max(taskPlans.length - completed, 0),
    ...statusCounts,
    items
  };
}

function statusFromCurrentPhase(current, sliceId) {
  if (!sameIdentifier(current.slice, sliceId)) {
    return null;
  }

  return DASHBOARD_PHASE_STATUS.get(String(current.phase || '').toLowerCase()) || null;
}

function computeSliceStatus(slice, current, tasks, unify, gsdDir) {
  const currentPhaseStatus = statusFromCurrentPhase(current, slice.id);

  if (currentPhaseStatus === 'blocked' || currentPhaseStatus === 'failed') {
    return currentPhaseStatus;
  }

  if (unify) {
    const unifyStatus = extractMarkdownStatus(
      readOptionalTextFile(path.join(gsdDir, unify.fileName))
    );

    if (unifyStatus === 'failed') {
      return 'failed';
    }

    if (unifyStatus === 'blocked') {
      return 'blocked';
    }

    return 'unified';
  }

  if (currentPhaseStatus) {
    return currentPhaseStatus;
  }

  if (tasks.blocked > 0) {
    return 'blocked';
  }

  if (tasks.failed > 0) {
    return 'failed';
  }

  if (tasks.total > 0 && tasks.completed >= tasks.total) {
    return 'apply-complete';
  }

  if (tasks.completed > 0) {
    return 'running';
  }

  if (slice.artifacts.plan || tasks.total > 0) {
    return 'planned';
  }

  if (slice.artifacts.roadmap) {
    return 'pending';
  }

  return UNKNOWN;
}

function createEmptyTaskProgress() {
  return {
    total: 0,
    planned: 0,
    completed: 0,
    pending: 0,
    complete: 0,
    partial: 0,
    blocked: 0,
    failed: 0,
    unknown: 0,
    items: []
  };
}

function createSliceProgress(options) {
  return {
    id: options.id,
    name: options.name || UNKNOWN,
    milestone: options.milestone || UNKNOWN,
    milestone_name: options.milestone_name || UNKNOWN,
    current: sameIdentifier(options.currentSlice, options.id),
    status: UNKNOWN,
    artifacts: {
      roadmap: options.roadmap || null,
      plan: null,
      unify: null,
      task_plans: [],
      summaries: []
    },
    tasks: createEmptyTaskProgress()
  };
}

function buildSliceProgress(model, gsdDir) {
  const artifacts = discoverGsdArtifacts(gsdDir);
  const slices = new Map();

  for (const roadmap of artifacts.roadmaps) {
    const content = readOptionalTextFile(path.join(gsdDir, roadmap.fileName));

    for (const roadmapSlice of parseRoadmapSlices(roadmap, content)) {
      artifacts.sliceIds.add(roadmapSlice.id);
      slices.set(roadmapSlice.id, createSliceProgress({
        id: roadmapSlice.id,
        name: roadmapSlice.name,
        milestone: roadmapSlice.milestone,
        milestone_name: roadmapSlice.milestone_name,
        currentSlice: model.current.slice,
        roadmap: roadmapSlice.roadmap
      }));
    }
  }

  for (const sliceId of artifacts.sliceIds) {
    if (!slices.has(sliceId)) {
      slices.set(sliceId, createSliceProgress({
        id: sliceId,
        currentSlice: model.current.slice
      }));
    }
  }

  for (const slice of slices.values()) {
    const slicePlan = artifacts.slicePlans.get(slice.id) || null;
    const taskPlans = artifacts.taskPlansBySlice.get(slice.id) || [];
    const summaries = artifacts.summariesBySlice.get(slice.id) || [];
    const unify = artifacts.unifiesBySlice.get(slice.id) || null;

    slice.artifacts.plan = slicePlan ? slicePlan.displayPath : null;
    slice.artifacts.unify = unify ? unify.displayPath : null;
    slice.artifacts.task_plans = taskPlans.map((taskPlan) => taskPlan.displayPath);
    slice.artifacts.summaries = summaries.map((summary) => summary.displayPath);
    slice.tasks = buildTaskProgress(gsdDir, taskPlans, summaries);
    slice.status = computeSliceStatus(slice, model.current, slice.tasks, unify, gsdDir);
  }

  model.progress.slices = sortById([...slices.values()]);
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

function resolveCurrentTaskPlanId(current) {
  if (isKnown(current.task) && /^S[0-9]+-T[0-9]+$/i.test(current.task)) {
    return current.task;
  }

  if (!isKnown(current.slice) || !isKnown(current.task)) {
    return null;
  }

  return `${current.slice}-${current.task}`;
}

function addCurrentTaskWarning(model, code, message) {
  model.current_task.warnings.push({ code, message });
}

function populateCurrentTaskFromPlan(model, gsdDir) {
  const taskPlanId = resolveCurrentTaskPlanId(model.current);

  if (!taskPlanId) {
    return;
  }

  const planFileName = `${taskPlanId}-PLAN.xml`;
  const planPath = path.join(gsdDir, planFileName);

  if (!hasFile(planPath)) {
    addCurrentTaskWarning(
      model,
      'task_plan.missing',
      `current task plan was not found: .gsd/${planFileName}`
    );
    return;
  }

  try {
    model.current_task = parseTaskPlanXml(fs.readFileSync(planPath, 'utf8'), {
      expectedTaskId: taskPlanId,
      planPath
    });
  } catch (error) {
    addCurrentTaskWarning(
      model,
      'task_plan.read_failed',
      error && error.message ? error.message : 'current task plan could not be read'
    );
    return;
  }

  if (isKnown(model.current_task.name)) {
    model.current.task_name = model.current_task.name;
  }
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
    current_task: createEmptyTaskPlan(),
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
  buildSliceProgress(model, gsdDir);
  populateCurrentTaskFromPlan(model, gsdDir);

  return model;
}

module.exports = {
  buildDashboardModel
};
