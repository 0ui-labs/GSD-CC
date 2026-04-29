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

function normalizeMarkdownHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanMarkdownCell(value) {
  return String(value || '')
    .trim()
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\\|/g, '|')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMarkdownTableLine(line) {
  const trimmed = String(line || '').trim();

  if (!trimmed.includes('|')) {
    return null;
  }

  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

  return cells.length > 1 ? cells : null;
}

function isMarkdownTableSeparator(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function parseMarkdownTableRows(content) {
  const rows = [];
  let headers = null;

  for (const line of String(content || '').split(/\r?\n/)) {
    const cells = parseMarkdownTableLine(line);

    if (!cells) {
      headers = null;
      continue;
    }

    if (isMarkdownTableSeparator(cells)) {
      continue;
    }

    if (!headers) {
      headers = cells.map(normalizeMarkdownHeader);
      continue;
    }

    const row = {};

    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = cleanMarkdownCell(cells[index] || '');
    }

    rows.push(row);
  }

  return rows;
}

function firstMarkdownRowValue(row, candidates) {
  for (const candidate of candidates) {
    const key = normalizeMarkdownHeader(candidate);

    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  return null;
}

function normalizeAcceptanceId(value) {
  const match = String(value || '').toUpperCase().match(/\bAC-[0-9]+\b/);
  return match ? match[0] : null;
}

function normalizeTaskId(value) {
  const match = String(value || '').toUpperCase().match(/\b(?:S[0-9]+[-/])?(T[0-9]+)\b/);
  return match ? match[1] : null;
}

function normalizeAcceptanceStatus(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[✓✔✅]/g, ' pass ')
    .replace(/[✗✕❌]/g, ' fail ')
    .replace(/[`*_~{}]/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return UNKNOWN;
  }

  const hasPass = /\b(pass|passed|complete|completed|success|successful)\b/.test(normalized);
  const hasPartial = /\b(partial|partially)\b/.test(normalized);
  const hasFail = /\b(fail|failed|failure|blocked)\b/.test(normalized);
  const matchedKinds = [hasPass, hasPartial, hasFail].filter(Boolean).length;

  if (matchedKinds !== 1) {
    return UNKNOWN;
  }

  if (hasFail) {
    return 'failed';
  }

  if (hasPartial) {
    return 'partial';
  }

  return 'passed';
}

function createAcceptanceEvidenceEntry(options) {
  return {
    ac: options.ac,
    task: options.task,
    status: options.status,
    evidence: options.evidence || '',
    source: options.source,
    source_type: options.sourceType
  };
}

function parseAcceptanceEvidenceRows(content, options = {}) {
  const entries = [];

  for (const row of parseMarkdownTableRows(content)) {
    const ac = normalizeAcceptanceId(firstMarkdownRowValue(row, [
      'ac',
      'acceptance criterion',
      'acceptance criteria',
      'criterion'
    ]));
    const status = normalizeAcceptanceStatus(firstMarkdownRowValue(row, [
      'status',
      'result'
    ]));

    if (!ac || status === UNKNOWN) {
      continue;
    }

    const task = normalizeTaskId(firstMarkdownRowValue(row, [
      'task',
      'task id'
    ])) || normalizeTaskId(options.defaultTask);

    if (!task) {
      continue;
    }

    entries.push(createAcceptanceEvidenceEntry({
      ac,
      task,
      status,
      evidence: firstMarkdownRowValue(row, [
        'evidence',
        'notes',
        'details'
      ]) || '',
      source: options.source,
      sourceType: options.sourceType
    }));
  }

  return entries;
}

function parseAcceptanceEvidenceLines(content, options = {}) {
  const entries = [];

  for (const line of String(content || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?(AC-[0-9]+)\s*[:|-]\s*(.+?)\s*$/i);

    if (!match) {
      continue;
    }

    const status = normalizeAcceptanceStatus(match[2]);

    if (status === UNKNOWN) {
      continue;
    }

    const task = normalizeTaskId(options.defaultTask);

    if (!task) {
      continue;
    }

    entries.push(createAcceptanceEvidenceEntry({
      ac: match[1].toUpperCase(),
      task,
      status,
      evidence: cleanMarkdownCell(match[2]),
      source: options.source,
      sourceType: options.sourceType
    }));
  }

  return entries;
}

function parseAcceptanceEvidence(content, options = {}) {
  return [
    ...parseAcceptanceEvidenceRows(content, options),
    ...parseAcceptanceEvidenceLines(content, options)
  ];
}

function acceptanceEvidenceKey(slice, task, ac) {
  return [
    String(slice || '').toUpperCase(),
    String(task || '').toUpperCase(),
    String(ac || '').toUpperCase()
  ].join(':');
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

function parseTaskPlanFromArtifact(gsdDir, taskPlan) {
  return parseTaskPlanXml(
    readOptionalTextFile(path.join(gsdDir, taskPlan.fileName)),
    {
      expectedTaskId: taskPlan.taskId,
      planPath: path.join(gsdDir, taskPlan.fileName)
    }
  );
}

function buildAcceptanceEvidenceMap(gsdDir, artifacts) {
  const evidenceByKey = new Map();

  for (const summaries of artifacts.summariesBySlice.values()) {
    for (const summary of summaries) {
      const entries = parseAcceptanceEvidence(
        readOptionalTextFile(path.join(gsdDir, summary.fileName)),
        {
          defaultTask: summary.task,
          source: summary.displayPath,
          sourceType: 'summary'
        }
      );

      for (const entry of entries) {
        evidenceByKey.set(
          acceptanceEvidenceKey(summary.slice, entry.task, entry.ac),
          entry
        );
      }
    }
  }

  for (const [slice, unify] of artifacts.unifiesBySlice.entries()) {
    const entries = parseAcceptanceEvidence(
      readOptionalTextFile(path.join(gsdDir, unify.fileName)),
      {
        source: unify.displayPath,
        sourceType: 'unify'
      }
    );

    for (const entry of entries) {
      evidenceByKey.set(
        acceptanceEvidenceKey(slice, entry.task, entry.ac),
        entry
      );
    }
  }

  return evidenceByKey;
}

function collectAcceptanceCriteria(gsdDir, artifacts) {
  const criteria = [];
  const sliceIds = sortById([...artifacts.taskPlansBySlice.keys()].map((id) => ({ id })))
    .map((item) => item.id);

  for (const slice of sliceIds) {
    const taskPlans = artifacts.taskPlansBySlice.get(slice) || [];

    for (const taskPlan of taskPlans) {
      const parsed = parseTaskPlanFromArtifact(gsdDir, taskPlan);

      parsed.acceptance_criteria.forEach((criterion, index) => {
        criteria.push({
          slice,
          task: taskPlan.task,
          ac: criterion.id,
          text: criterion.text,
          index,
          plan: taskPlan.displayPath
        });
      });
    }
  }

  return criteria;
}

function evidenceForCriterion(evidenceByKey, criterion) {
  return evidenceByKey.get(
    acceptanceEvidenceKey(criterion.slice, criterion.task, criterion.ac)
  ) || null;
}

function countAcceptanceCriteria(criteria, evidenceByKey) {
  const counts = {
    total: criteria.length,
    passed: 0,
    partial: 0,
    failed: 0,
    pending: 0
  };

  for (const criterion of criteria) {
    const evidence = evidenceForCriterion(evidenceByKey, criterion);
    const status = evidence ? evidence.status : 'pending';

    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    } else {
      counts.pending += 1;
    }
  }

  return counts;
}

function resolveCurrentTaskContext(current) {
  const taskPlanId = resolveCurrentTaskPlanId(current);
  const match = String(taskPlanId || '').toUpperCase().match(/^(S[0-9]+)-(T[0-9]+)$/);

  if (!match) {
    return null;
  }

  return {
    slice: match[1],
    task: match[2]
  };
}

function annotateCurrentTaskAcceptanceCriteria(model, evidenceByKey) {
  const context = resolveCurrentTaskContext(model.current);

  if (!context) {
    return;
  }

  model.current_task.acceptance_criteria = model.current_task.acceptance_criteria
    .map((criterion) => {
      const evidence = evidenceForCriterion(evidenceByKey, {
        slice: context.slice,
        task: context.task,
        ac: criterion.id
      });

      return {
        ...criterion,
        status: evidence ? evidence.status : 'pending',
        evidence: evidence ? evidence.evidence : '',
        source: evidence ? evidence.source : null,
        source_type: evidence ? evidence.source_type : null
      };
    });
}

function populateAcceptanceCriteriaProgress(model, gsdDir) {
  const artifacts = discoverGsdArtifacts(gsdDir);
  const evidenceByKey = buildAcceptanceEvidenceMap(gsdDir, artifacts);
  const criteria = collectAcceptanceCriteria(gsdDir, artifacts);

  model.progress.acceptance_criteria = countAcceptanceCriteria(criteria, evidenceByKey);
  annotateCurrentTaskAcceptanceCriteria(model, evidenceByKey);
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
  populateAcceptanceCriteriaProgress(model, gsdDir);

  return model;
}

module.exports = {
  buildDashboardModel
};
