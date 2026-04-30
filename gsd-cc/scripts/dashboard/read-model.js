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
const ATTENTION_SEVERITY_RANK = new Map([
  ['critical', 0],
  ['warning', 1],
  ['info', 2]
]);
const EVENT_SOURCE_PATH = '.gsd/events.jsonl';
const COST_SOURCE_PATH = '.gsd/COSTS.jsonl';
const DEFAULT_ACTIVITY_LIMIT = 50;
const COST_GROUP_LIMIT = 8;
const EVENT_CATEGORY_BY_TYPE = new Map([
  ['auto_started', 'lifecycle'],
  ['auto_finished', 'lifecycle'],
  ['slice_started', 'lifecycle'],
  ['phase_started', 'lifecycle'],
  ['phase_completed', 'lifecycle'],
  ['task_started', 'task'],
  ['task_completed', 'task'],
  ['verification_planned', 'task'],
  ['summary_missing_retry', 'task'],
  ['dispatch_started', 'dispatch'],
  ['dispatch_failed', 'dispatch'],
  ['approval_required', 'approval'],
  ['approval_found', 'approval'],
  ['recovery_written', 'recovery'],
  ['fallback_commit_started', 'commit'],
  ['fallback_commit_completed', 'commit'],
  ['budget_reached', 'budget'],
  ['state_validation_failed', 'error']
]);
const EVENT_WARNING_TYPES = new Set([
  'budget_reached',
  'dispatch_failed',
  'recovery_written',
  'state_validation_failed',
  'summary_missing_retry'
]);
const EVENT_CRITICAL_TYPES = new Set([
  'approval_required'
]);
const EVENT_ARTIFACT_KEYS = [
  'artifact',
  'task_plan',
  'summary',
  'request',
  'approval_log',
  'plan',
  'report',
  'log_file'
];
const EVENT_DETAIL_EXCLUDE_KEYS = new Set([
  'timestamp',
  'ts',
  'type',
  'milestone',
  'slice',
  'task',
  'phase',
  'dispatch_phase',
  'message',
  ...EVENT_ARTIFACT_KEYS
]);
const COST_TOKEN_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens'
];
const RISK_LEVELS = ['low', 'medium', 'high'];

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

function readOptionalJsonFile(filePath) {
  if (!hasFile(filePath)) {
    return {
      exists: false,
      data: null,
      error: null
    };
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        exists: true,
        data: null,
        error: 'Expected a JSON object.'
      };
    }

    return {
      exists: true,
      data,
      error: null
    };
  } catch (error) {
    return {
      exists: true,
      data: null,
      error: error && error.message ? error.message : 'Could not parse JSON.'
    };
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

function nullableKnownValue(value) {
  const normalized = normalizeFieldValue(value);
  return normalized || null;
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

function normalizePid(value) {
  const normalized = normalizeFieldValue(value);

  if (!normalized || !/^[1-9][0-9]*$/.test(normalized)) {
    return null;
  }

  const pid = Number(normalized);

  if (!Number.isSafeInteger(pid)) {
    return null;
  }

  return pid;
}

function isPidRunning(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === 'EPERM');
  }
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

function extractMarkdownSection(content, heading) {
  const target = normalizeMarkdownHeader(heading);
  const lines = String(content || '').split(/\r?\n/);
  const collected = [];
  let inSection = false;
  let sectionLevel = 0;

  for (const line of lines) {
    const match = line.match(/^\s{0,3}(#{2,6})\s+(.+?)\s*#*\s*$/);

    if (match) {
      const level = match[1].length;
      const title = normalizeMarkdownHeader(match[2]);

      if (inSection && level <= sectionLevel) {
        break;
      }

      if (!inSection && title === target) {
        inSection = true;
        sectionLevel = level;
        continue;
      }
    }

    if (inSection) {
      collected.push(line);
    }
  }

  return collected.join('\n').trim();
}

function cleanReportValue(value) {
  const cleaned = cleanMarkdownCell(value);

  if (!cleaned || /\{\{.*?\}\}/.test(cleaned)) {
    return '';
  }

  return cleaned;
}

function sectionHasNone(section) {
  return String(section || '')
    .split(/\r?\n/)
    .map((line) => cleanReportValue(line.replace(/^\s*[-*]\s*/, '')))
    .filter(Boolean)
    .some((line) => /^none\.?$/i.test(line));
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

function parseSectionTableRows(content, heading) {
  const section = extractMarkdownSection(content, heading);

  if (!section || sectionHasNone(section)) {
    return [];
  }

  return parseMarkdownTableRows(section);
}

function parseReportListItems(content, heading) {
  const section = extractMarkdownSection(content, heading);

  if (!section || sectionHasNone(section)) {
    return [];
  }

  return section
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*[-*]\s*(?:\[[ xX]\]\s*)?(.+?)\s*$/);
      return match ? cleanReportValue(match[1]) : '';
    })
    .filter((item) => (
      item
      && !/^no additional decisions made during execution\.?$/i.test(item)
      && !/^no high-risk tasks in this slice\.?$/i.test(item)
    ));
}

function parseUnifySummary(content) {
  const summary = {};
  const section = extractMarkdownSection(content, 'Summary');

  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s*([^:]+):\s*(.+?)\s*$/);

    if (!match) {
      continue;
    }

    summary[normalizeMarkdownHeader(match[1])] = cleanReportValue(match[2]);
  }

  return {
    status: summary.status || '',
    outcome: summary.outcome || '',
    acceptance_criteria: summary.acceptance_criteria || '',
    boundary_violations: summary.boundary_violations || '',
    recommendation: summary.recommendation || ''
  };
}

function parsePlanVsActual(content) {
  return parseSectionTableRows(content, 'Plan vs. Actual')
    .map((row) => ({
      task: cleanReportValue(firstMarkdownRowValue(row, ['task'])),
      planned: cleanReportValue(firstMarkdownRowValue(row, ['planned'])),
      actual: cleanReportValue(firstMarkdownRowValue(row, ['actual'])),
      status: cleanReportValue(firstMarkdownRowValue(row, ['status'])),
      notes: cleanReportValue(firstMarkdownRowValue(row, ['notes']))
    }))
    .filter((row) => row.task || row.planned || row.actual || row.status || row.notes);
}

function parseRisksIntroduced(content) {
  return parseSectionTableRows(content, 'Risks Introduced')
    .map((row) => ({
      risk: cleanReportValue(firstMarkdownRowValue(row, ['risk'])),
      source: cleanReportValue(firstMarkdownRowValue(row, ['source'])),
      impact: cleanReportValue(firstMarkdownRowValue(row, ['impact'])),
      mitigation: cleanReportValue(firstMarkdownRowValue(row, ['mitigation']))
    }))
    .filter((row) => row.risk || row.source || row.impact || row.mitigation);
}

function parseHighRiskApprovals(content) {
  return parseSectionTableRows(content, 'Risk and Approval')
    .map((row) => ({
      task: cleanReportValue(firstMarkdownRowValue(row, ['task'])),
      risk: cleanReportValue(firstMarkdownRowValue(row, ['risk'])),
      approval: cleanReportValue(firstMarkdownRowValue(row, ['approval'])),
      reason: cleanReportValue(firstMarkdownRowValue(row, ['reason']))
    }))
    .filter((row) => row.task || row.risk || row.approval || row.reason);
}

function sectionIncludesNoHighRisk(content) {
  return /no high-risk tasks in this slice\.?/i.test(
    extractMarkdownSection(content, 'Risk and Approval')
  );
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

function createRiskDistribution() {
  return {
    low: 0,
    medium: 0,
    high: 0,
    unknown: 0
  };
}

function normalizeRiskLevel(value) {
  const normalized = String(value || '').toLowerCase();

  return RISK_LEVELS.includes(normalized) ? normalized : UNKNOWN;
}

function summarizeTaskRisk(items) {
  const summary = createRiskDistribution();

  for (const item of items) {
    const level = normalizeRiskLevel(item && item.risk && item.risk.level);
    summary[level] += 1;
  }

  return summary;
}

function createAcceptanceCounts() {
  return {
    total: 0,
    passed: 0,
    partial: 0,
    failed: 0,
    pending: 0
  };
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
    const parsedPlan = plan ? parseTaskPlanFromArtifact(gsdDir, plan) : null;
    const summary = summariesByTask.get(task) || null;
    const summaryStatus = summary
      ? extractMarkdownStatus(readOptionalTextFile(path.join(gsdDir, summary.fileName)))
      : 'pending';

    return {
      id: task,
      task_id: plan ? plan.taskId : `${summary.slice}-${task}`,
      name: parsedPlan ? parsedPlan.name : UNKNOWN,
      status: summary ? summaryStatus : 'pending',
      risk: parsedPlan
        ? parsedPlan.risk
        : {
          level: UNKNOWN,
          reason: ''
        },
      files: parsedPlan ? parsedPlan.files : [],
      boundaries: parsedPlan ? parsedPlan.boundaries : [],
      acceptance_criteria: {
        total: parsedPlan ? parsedPlan.acceptance_criteria.length : 0,
        items: parsedPlan ? parsedPlan.acceptance_criteria : []
      },
      action: parsedPlan ? parsedPlan.action : [],
      verify: parsedPlan ? parsedPlan.verify : [],
      done: parsedPlan ? parsedPlan.done : null,
      warnings: parsedPlan ? parsedPlan.warnings : [],
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
    risk: summarizeTaskRisk(items),
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
    acceptance_criteria: createAcceptanceCounts(),
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

function countAcceptanceCriteria(criteria, evidenceByKey, predicate = null) {
  const counts = createAcceptanceCounts();

  for (const criterion of criteria) {
    if (predicate && !predicate(criterion)) {
      continue;
    }

    counts.total += 1;
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

function annotateSliceAcceptanceCriteriaProgress(model, criteria, evidenceByKey) {
  for (const slice of model.progress.slices) {
    slice.acceptance_criteria = countAcceptanceCriteria(
      criteria,
      evidenceByKey,
      (criterion) => sameIdentifier(criterion.slice, slice.id)
    );
  }
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
  annotateSliceAcceptanceCriteriaProgress(model, criteria, evidenceByKey);
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

function addAttentionItem(model, item) {
  model.attention.push({
    id: item.id,
    severity: item.severity,
    title: item.title,
    message: item.message,
    source: item.source || null,
    recommended_action: item.recommended_action
  });
}

function sortAttentionItems(model) {
  model.attention = model.attention
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftRank = ATTENTION_SEVERITY_RANK.has(left.item.severity)
        ? ATTENTION_SEVERITY_RANK.get(left.item.severity)
        : ATTENTION_SEVERITY_RANK.get('info');
      const rightRank = ATTENTION_SEVERITY_RANK.has(right.item.severity)
        ? ATTENTION_SEVERITY_RANK.get(right.item.severity)
        : ATTENTION_SEVERITY_RANK.get('info');

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

function eventStringValue(value) {
  const normalized = nullableKnownValue(value);

  if (!normalized || normalized === UNKNOWN) {
    return null;
  }

  return normalized;
}

function normalizeEventTimestamp(data) {
  return eventStringValue(data.timestamp) || eventStringValue(data.ts);
}

function eventTimestampMs(timestamp) {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);

  return Number.isNaN(parsed) ? null : parsed;
}

function eventCategory(type) {
  return EVENT_CATEGORY_BY_TYPE.get(type) || 'other';
}

function eventSeverity(type) {
  if (EVENT_CRITICAL_TYPES.has(type)) {
    return 'critical';
  }

  if (EVENT_WARNING_TYPES.has(type)) {
    return 'warning';
  }

  return 'info';
}

function eventUnit(data) {
  const slice = eventStringValue(data.slice);
  const task = eventStringValue(data.task);

  if (slice && task) {
    return `${slice}/${task}`;
  }

  return slice || task || null;
}

function collectEventArtifacts(data) {
  const artifacts = [];

  for (const key of EVENT_ARTIFACT_KEYS) {
    const value = eventStringValue(data[key]);

    if (value && !artifacts.includes(value)) {
      artifacts.push(value);
    }
  }

  return artifacts;
}

function normalizeEventDetailValue(value) {
  if (typeof value === 'string') {
    return eventStringValue(value);
  }

  if (value === null || value === undefined) {
    return null;
  }

  return value;
}

function collectEventDetails(data) {
  const details = {};

  for (const [key, value] of Object.entries(data)) {
    if (EVENT_DETAIL_EXCLUDE_KEYS.has(key)) {
      continue;
    }

    const normalized = normalizeEventDetailValue(value);

    if (normalized !== null) {
      details[key] = normalized;
    }
  }

  return details;
}

function fallbackEventMessage(type) {
  return type.replace(/_/g, ' ');
}

function normalizeEventRecord(data, lineNumber, order) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      warning: {
        line: lineNumber,
        reason: 'Expected a JSON object.'
      }
    };
  }

  const type = eventStringValue(data.type);

  if (!type) {
    return {
      warning: {
        line: lineNumber,
        reason: 'Missing event type.'
      }
    };
  }

  const timestamp = normalizeEventTimestamp(data);
  const artifacts = collectEventArtifacts(data);
  const event = {
    id: `events.jsonl:${lineNumber}`,
    timestamp,
    type,
    category: eventCategory(type),
    severity: eventSeverity(type),
    message: eventStringValue(data.message) || fallbackEventMessage(type),
    milestone: eventStringValue(data.milestone),
    slice: eventStringValue(data.slice),
    task: eventStringValue(data.task),
    unit: eventUnit(data),
    phase: eventStringValue(data.phase),
    dispatch_phase: eventStringValue(data.dispatch_phase),
    source: EVENT_SOURCE_PATH,
    line: lineNumber,
    artifact: artifacts[0] || null,
    artifacts,
    details: collectEventDetails(data)
  };

  return {
    entry: {
      event,
      order,
      sortTime: eventTimestampMs(timestamp)
    }
  };
}

function compareActivityEntries(left, right) {
  const leftTime = left.sortTime === null ? -Infinity : left.sortTime;
  const rightTime = right.sortTime === null ? -Infinity : right.sortTime;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.order - left.order;
}

function parseEventJournal(gsdDir, options = {}) {
  const limit = options.limit || DEFAULT_ACTIVITY_LIMIT;
  const eventsPath = path.join(gsdDir, 'events.jsonl');
  const warnings = [];
  const entries = [];

  if (!hasFile(eventsPath)) {
    return {
      events: [],
      warnings
    };
  }

  let content = '';

  try {
    content = fs.readFileSync(eventsPath, 'utf8');
  } catch (error) {
    return {
      events: [],
      warnings: [{
        line: null,
        reason: error && error.message ? error.message : 'Could not read event journal.'
      }]
    };
  }

  String(content).split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;

    if (!line.trim()) {
      return;
    }

    let data;

    try {
      data = JSON.parse(line);
    } catch (error) {
      warnings.push({
        line: lineNumber,
        reason: error && error.message ? error.message : 'Could not parse JSON.'
      });
      return;
    }

    const result = normalizeEventRecord(data, lineNumber, index);

    if (result.warning) {
      warnings.push(result.warning);
      return;
    }

    entries.push(result.entry);
  });

  return {
    events: entries
      .sort(compareActivityEntries)
      .slice(0, limit)
      .map((entry) => entry.event),
    warnings
  };
}

function deriveCurrentActivity(activity) {
  if (!activity || activity.length === 0) {
    return null;
  }

  const latest = activity[0];

  return {
    timestamp: latest.timestamp,
    type: latest.type,
    category: latest.category,
    severity: latest.severity,
    message: latest.message,
    unit: latest.unit,
    phase: latest.phase,
    dispatch_phase: latest.dispatch_phase,
    source: latest.source,
    line: latest.line,
    artifact: latest.artifact
  };
}

function createEventJournalAttention(warnings) {
  const count = warnings.length;
  const firstWarning = warnings[0] || {};
  const lineSuffix = firstWarning.line ? ` line ${firstWarning.line}` : '';
  const plural = count === 1 ? 'line' : 'lines';

  return {
    id: 'events-jsonl-invalid',
    severity: 'warning',
    title: 'Event journal has unreadable lines',
    message: `Ignored ${count} malformed event ${plural} in ${EVENT_SOURCE_PATH}.`,
    source: EVENT_SOURCE_PATH,
    recommended_action: [
      `Repair ${EVENT_SOURCE_PATH}${lineSuffix}:`,
      firstWarning.reason || 'invalid event data'
    ].join(' ')
  };
}

function createEmptyCostsModel() {
  return {
    available: false,
    source: null,
    entries: 0,
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    by_phase: [],
    by_unit: [],
    latest: null
  };
}

function normalizeTokenCount(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function costUsageTotals(usage) {
  const totals = {};

  for (const field of COST_TOKEN_FIELDS) {
    totals[field] = normalizeTokenCount(usage && usage[field]);
  }

  totals.total_tokens = totals.input_tokens + totals.output_tokens;

  return totals;
}

function addCostTotals(target, usage) {
  for (const field of COST_TOKEN_FIELDS) {
    target[field] += usage[field];
  }

  target.total_tokens += usage.total_tokens;
}

function normalizeCostRecord(data, lineNumber, order) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      warning: {
        line: lineNumber,
        reason: 'Expected a JSON object.'
      }
    };
  }

  const usage = costUsageTotals(data.usage || {});
  const record = {
    id: `COSTS.jsonl:${lineNumber}`,
    unit: eventStringValue(data.unit) || UNKNOWN,
    phase: eventStringValue(data.phase) || UNKNOWN,
    model: eventStringValue(data.model),
    timestamp: eventStringValue(data.ts) || eventStringValue(data.timestamp),
    line: lineNumber,
    source: COST_SOURCE_PATH,
    ...usage
  };

  return {
    entry: {
      record,
      order,
      sortTime: eventTimestampMs(record.timestamp)
    }
  };
}

function compareCostEntries(left, right) {
  const leftTime = left.sortTime === null ? -Infinity : left.sortTime;
  const rightTime = right.sortTime === null ? -Infinity : right.sortTime;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.order - left.order;
}

function ensureCostGroup(groups, key, label) {
  if (!groups.has(key)) {
    groups.set(key, {
      [label]: key,
      entries: 0,
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    });
  }

  return groups.get(key);
}

function sortedCostGroups(groups) {
  return [...groups.values()]
    .sort((left, right) => {
      if (left.total_tokens !== right.total_tokens) {
        return right.total_tokens - left.total_tokens;
      }

      return compareIds(left.phase || left.unit, right.phase || right.unit);
    })
    .slice(0, COST_GROUP_LIMIT);
}

function summarizeCostRecords(records) {
  const costs = createEmptyCostsModel();
  const phaseGroups = new Map();
  const unitGroups = new Map();

  if (records.length === 0) {
    return costs;
  }

  costs.available = true;
  costs.source = COST_SOURCE_PATH;
  costs.entries = records.length;

  for (const record of records) {
    addCostTotals(costs, record);

    const phase = ensureCostGroup(phaseGroups, record.phase, 'phase');
    phase.entries += 1;
    addCostTotals(phase, record);

    const unit = ensureCostGroup(unitGroups, record.unit, 'unit');
    unit.entries += 1;
    addCostTotals(unit, record);
  }

  costs.by_phase = sortedCostGroups(phaseGroups);
  costs.by_unit = sortedCostGroups(unitGroups);
  costs.latest = records
    .map((record, order) => ({
      record,
      order,
      sortTime: eventTimestampMs(record.timestamp)
    }))
    .sort(compareCostEntries)[0].record;

  return costs;
}

function parseCostJournal(gsdDir) {
  const costsPath = path.join(gsdDir, 'COSTS.jsonl');
  const warnings = [];
  const entries = [];

  if (!hasFile(costsPath)) {
    return {
      costs: createEmptyCostsModel(),
      warnings
    };
  }

  let content = '';

  try {
    content = fs.readFileSync(costsPath, 'utf8');
  } catch (error) {
    return {
      costs: createEmptyCostsModel(),
      warnings: [{
        line: null,
        reason: error && error.message ? error.message : 'Could not read costs journal.'
      }]
    };
  }

  String(content).split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;

    if (!line.trim()) {
      return;
    }

    let data;

    try {
      data = JSON.parse(line);
    } catch (error) {
      warnings.push({
        line: lineNumber,
        reason: error && error.message ? error.message : 'Could not parse JSON.'
      });
      return;
    }

    const result = normalizeCostRecord(data, lineNumber, index);

    if (result.warning) {
      warnings.push(result.warning);
      return;
    }

    entries.push(result.entry);
  });

  return {
    costs: summarizeCostRecords(entries.map((entry) => entry.record)),
    warnings
  };
}

function createCostJournalAttention(warnings) {
  const count = warnings.length;
  const firstWarning = warnings[0] || {};
  const lineSuffix = firstWarning.line ? ` line ${firstWarning.line}` : '';
  const plural = count === 1 ? 'line' : 'lines';

  return {
    id: 'costs-jsonl-invalid',
    severity: 'warning',
    title: 'Cost journal has unreadable lines',
    message: `Ignored ${count} malformed cost ${plural} in ${COST_SOURCE_PATH}.`,
    source: COST_SOURCE_PATH,
    recommended_action: [
      `Repair ${COST_SOURCE_PATH}${lineSuffix}:`,
      firstWarning.reason || 'invalid cost data'
    ].join(' ')
  };
}

function populateActivity(model, gsdDir) {
  const journal = parseEventJournal(gsdDir);

  model.activity = journal.events;
  model.current.activity = deriveCurrentActivity(journal.events);

  if (journal.warnings.length > 0) {
    addAttentionItem(model, createEventJournalAttention(journal.warnings));
  }
}

function populateCosts(model, gsdDir) {
  const journal = parseCostJournal(gsdDir);

  model.costs = journal.costs;

  if (journal.warnings.length > 0) {
    addAttentionItem(model, createCostJournalAttention(journal.warnings));
  }
}

function fileUpdatedAt(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch (error) {
    return null;
  }
}

function compareUnifyArtifacts(gsdDir, left, right) {
  const leftTime = fileUpdatedAt(path.join(gsdDir, left.fileName)) || '';
  const rightTime = fileUpdatedAt(path.join(gsdDir, right.fileName)) || '';

  if (leftTime !== rightTime) {
    return rightTime.localeCompare(leftTime);
  }

  return compareIds(right.slice, left.slice);
}

function selectLatestUnifyArtifact(model, gsdDir, artifacts) {
  if (isKnown(model.current.slice)) {
    const currentUnify = artifacts.unifiesBySlice.get(model.current.slice);

    if (currentUnify) {
      return currentUnify;
    }
  }

  return [...artifacts.unifiesBySlice.values()]
    .sort((left, right) => compareUnifyArtifacts(gsdDir, left, right))[0]
    || null;
}

function parseUnifyReport(gsdDir, artifact) {
  const filePath = path.join(gsdDir, artifact.fileName);
  const content = readOptionalTextFile(filePath);
  const summary = parseUnifySummary(content);
  const summaryStatus = normalizeStatusToken(summary.status);
  const reportStatus = extractMarkdownStatus(content);

  return {
    slice: artifact.slice,
    status: summaryStatus !== UNKNOWN ? summaryStatus : reportStatus,
    source: artifact.displayPath,
    updated_at: fileUpdatedAt(filePath),
    summary,
    plan_vs_actual: parsePlanVsActual(content),
    risks_introduced: parseRisksIntroduced(content),
    high_risk_approvals: parseHighRiskApprovals(content),
    no_high_risk_tasks: sectionIncludesNoHighRisk(content),
    decisions: parseReportListItems(content, 'Decisions Made'),
    deferred: parseReportListItems(content, 'Deferred')
  };
}

function populateLatestUnify(model, gsdDir) {
  const artifacts = discoverGsdArtifacts(gsdDir);
  const artifact = selectLatestUnifyArtifact(model, gsdDir, artifacts);

  if (!artifact) {
    return;
  }

  const latestUnify = parseUnifyReport(gsdDir, artifact);

  model.evidence.latest_unify = latestUnify;
  model.evidence.recent_decisions = latestUnify.decisions;
}

function createJsonParseAttention(fileName, error) {
  return {
    id: `${fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-invalid`,
    severity: 'warning',
    title: 'Dashboard artifact could not be read',
    message: `${toDisplayPath(fileName)} is not valid JSON: ${error}`,
    source: toDisplayPath(fileName),
    recommended_action: `Repair or remove ${toDisplayPath(fileName)}.`
  };
}

function normalizeApprovalRequest(data) {
  const slice = nullableKnownValue(data.slice);
  const task = nullableKnownValue(data.task);
  const reasons = Array.isArray(data.reasons)
    ? data.reasons.map((reason) => String(reason))
    : [];

  return {
    slice,
    task,
    unit: slice && task ? `${slice}/${task}` : null,
    plan: nullableKnownValue(data.plan),
    risk_level: nullableKnownValue(data.risk_level) || UNKNOWN,
    risk_reason: nullableKnownValue(data.risk_reason) || '',
    fingerprint: nullableKnownValue(data.fingerprint),
    reasons,
    created_at: nullableKnownValue(data.created_at),
    source: toDisplayPath('APPROVAL-REQUEST.json')
  };
}

function normalizeRecovery(data, gsdDir) {
  return {
    status: nullableKnownValue(data.status) || UNKNOWN,
    reason: nullableKnownValue(data.reason) || UNKNOWN,
    message: nullableKnownValue(data.message) || '',
    scope: nullableKnownValue(data.scope) || UNKNOWN,
    unit: nullableKnownValue(data.unit),
    phase: nullableKnownValue(data.phase) || UNKNOWN,
    dispatch_phase: nullableKnownValue(data.dispatch_phase) || null,
    started_at: nullableKnownValue(data.started_at),
    stopped_at: nullableKnownValue(data.stopped_at),
    start_branch: nullableKnownValue(data.start_branch),
    current_branch: nullableKnownValue(data.current_branch),
    start_head: nullableKnownValue(data.start_head),
    current_head: nullableKnownValue(data.current_head),
    commits_since_start: Array.isArray(data.commits_since_start)
      ? data.commits_since_start.map((entry) => String(entry))
      : [],
    uncommitted_files: Array.isArray(data.uncommitted_files)
      ? data.uncommitted_files.map((entry) => String(entry))
      : [],
    log_file: nullableKnownValue(data.log_file),
    safe_next_action: nullableKnownValue(data.safe_next_action)
      || 'Inspect .gsd/AUTO-RECOVERY.md before continuing.',
    source: toDisplayPath('auto-recovery.json'),
    report: hasFile(path.join(gsdDir, 'AUTO-RECOVERY.md'))
      ? toDisplayPath('AUTO-RECOVERY.md')
      : null
  };
}

function applyLockAutomationState(model, lock) {
  const pid = lock.data ? normalizePid(lock.data.pid) : null;
  const live = Boolean(lock.data && isPidRunning(pid));

  model.automation.status = live ? 'active' : 'stale';
  model.automation.state = live ? 'active' : 'stale';
  model.automation.unit = lock.data
    ? nullableKnownValue(lock.data.unit)
    : null;
  model.automation.pid = pid;
  model.automation.started_at = lock.data
    ? nullableKnownValue(lock.data.started_at) || nullableKnownValue(lock.data.started)
    : null;

  if (!live) {
    addAttentionItem(model, {
      id: 'auto-lock-stale',
      severity: 'critical',
      title: 'Auto-mode lock is stale',
      message: 'An auto-mode lock exists, but its PID is not running.',
      source: toDisplayPath('auto.lock'),
      recommended_action: 'Review the last task state, then remove .gsd/auto.lock before resuming.'
    });
  }
}

function applyApprovalAutomationState(model, approvalRequest, hasLock) {
  model.evidence.approval_request = approvalRequest;

  if (!hasLock) {
    model.automation.status = 'approval-required';
    model.automation.state = 'stopped';
    model.automation.unit = approvalRequest.unit;
  }

  addAttentionItem(model, {
    id: 'approval-required',
    severity: 'critical',
    title: 'Approval required',
    message: approvalRequest.unit
      ? `${approvalRequest.unit} needs approval before auto-mode can continue.`
      : 'A task needs approval before auto-mode can continue.',
    source: approvalRequest.source,
    recommended_action: approvalRequest.reasons[0]
      || approvalRequest.risk_reason
      || 'Review the approval request before resuming auto-mode.'
  });
}

function applyRecoveryAutomationState(model, recovery, hasLiveLock, hasLock, hasApproval) {
  model.evidence.latest_recovery = recovery;
  model.automation.last_stopped_at = recovery.stopped_at;
  model.automation.last_stop_reason = recovery.reason;

  if (!hasLock && !hasApproval) {
    model.automation.status = 'recovery-needed';
    model.automation.state = 'stopped';
    model.automation.unit = recovery.unit;
    model.automation.started_at = recovery.started_at;
  }

  if (!hasLiveLock) {
    addAttentionItem(model, {
      id: 'auto-recovery',
      severity: 'critical',
      title: 'Auto-mode stopped early',
      message: recovery.reason === UNKNOWN
        ? 'Auto-mode wrote a recovery report.'
        : `Auto-mode stopped: ${recovery.reason}.`,
      source: recovery.source,
      recommended_action: recovery.safe_next_action
    });
  }
}

function populateAutomationAndEvidence(model, gsdDir) {
  const lock = readOptionalJsonFile(path.join(gsdDir, 'auto.lock'));
  const hasLock = lock.exists;
  let hasLiveLock = false;

  if (lock.exists) {
    if (lock.error) {
      model.automation.status = 'stale';
      model.automation.state = 'stale';
      addAttentionItem(model, createJsonParseAttention('auto.lock', lock.error));
    } else {
      applyLockAutomationState(model, lock);
      hasLiveLock = model.automation.status === 'active';
    }
  }

  const approval = readOptionalJsonFile(path.join(gsdDir, 'APPROVAL-REQUEST.json'));
  const hasApproval = Boolean(approval.exists && approval.data && !approval.error);

  if (approval.exists) {
    if (approval.error) {
      addAttentionItem(
        model,
        createJsonParseAttention('APPROVAL-REQUEST.json', approval.error)
      );
    } else {
      applyApprovalAutomationState(
        model,
        normalizeApprovalRequest(approval.data),
        hasLock
      );
    }
  }

  const recovery = readOptionalJsonFile(path.join(gsdDir, 'auto-recovery.json'));

  if (recovery.exists) {
    if (recovery.error) {
      addAttentionItem(
        model,
        createJsonParseAttention('auto-recovery.json', recovery.error)
      );
    } else {
      applyRecoveryAutomationState(
        model,
        normalizeRecovery(recovery.data, gsdDir),
        hasLiveLock,
        hasLock,
        hasApproval
      );
    }
  }
}

function populatePhaseAttention(model, stateFields) {
  const phase = String(model.current.phase || '').toLowerCase();
  const isBlocked = phase === 'apply-blocked' || phase === 'unify-blocked';
  const isFailed = phase === 'apply-failed' || phase === 'unify-failed';

  if (!isBlocked && !isFailed) {
    return;
  }

  const reason = nullableKnownValue(stateFields.blocked_reason);
  addAttentionItem(model, {
    id: `phase-${phase}`,
    severity: isFailed ? 'critical' : 'warning',
    title: isFailed ? 'Phase failed' : 'Phase blocked',
    message: `${phase} requires attention for ${describeCurrentUnit(model.current)}.`,
    source: toDisplayPath('STATE.md'),
    recommended_action: reason
      ? `Resolve the recorded blocker: ${reason}`
      : 'Review .gsd/STATE.md and the related artifact before continuing.'
  });
}

function populateUnifyRequiredAttention(model, gsdDir) {
  if (
    String(model.current.phase || '').toLowerCase() !== 'apply-complete'
    || !isKnown(model.current.slice)
  ) {
    return;
  }

  const unifyFileName = `${model.current.slice}-UNIFY.md`;

  if (hasFile(path.join(gsdDir, unifyFileName))) {
    return;
  }

  addAttentionItem(model, {
    id: 'unify-required',
    severity: 'warning',
    title: 'UNIFY required',
    message: `${model.current.slice} is apply-complete but has no UNIFY report yet.`,
    source: toDisplayPath(unifyFileName),
    recommended_action: `Run UNIFY for ${model.current.slice} before moving on.`
  });
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
      activity: null,
      next_action: gsdExists
        ? 'Add GSD-CC project state to show dashboard details.'
        : 'Run /gsd-cc to initialize this project.'
    },
    attention: gsdExists ? [] : [createNoProjectAttentionItem()],
    automation: {
      status: 'inactive',
      state: 'inactive',
      scope: UNKNOWN,
      unit: null,
      pid: null,
      started_at: null,
      last_stopped_at: null,
      last_stop_reason: null
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
    costs: createEmptyCostsModel()
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
  populateAutomationAndEvidence(model, gsdDir);
  populateActivity(model, gsdDir);
  populateCosts(model, gsdDir);
  model.current.next_action = resolveNextAction(model);
  buildSliceProgress(model, gsdDir);
  populateLatestUnify(model, gsdDir);
  populateCurrentTaskFromPlan(model, gsdDir);
  populateAcceptanceCriteriaProgress(model, gsdDir);
  populatePhaseAttention(model, stateFields);
  populateUnifyRequiredAttention(model, gsdDir);
  sortAttentionItems(model);

  return model;
}

module.exports = {
  buildDashboardModel
};
