const path = require('path');
const {
  countClosingTags,
  countOpeningTags,
  decodeXmlEntities,
  extractAttr,
  findTag,
  meaningfulText,
  normalizeDisplayLines,
  normalizeMultilineText,
  normalizeSingleLineText,
  parseRawAcceptanceCriteria,
  stripXmlComments,
  stripXmlTags,
  trimWhitespace
} = require('../task-plan-xml');

const UNKNOWN = 'unknown';
const RISK_LEVELS = new Set(['low', 'medium', 'high']);

function createEmptyTaskPlan() {
  return {
    id: UNKNOWN,
    type: UNKNOWN,
    name: UNKNOWN,
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
  };
}

function addWarning(warnings, code, message) {
  warnings.push({ code, message });
}

function expectedTaskIdFromPath(planPath) {
  if (!planPath) {
    return null;
  }

  const match = path.basename(planPath).match(/^(S[0-9]+-T[0-9]+)-PLAN\.xml$/i);
  return match ? match[1] : null;
}

function stripTaskFileAnnotation(value) {
  return trimWhitespace(value)
    .replace(/\s+\([^)]*\)$/, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+#\s+.*$/, '')
    .replace(/\s+\/\/\s+.*$/, '')
    .replace(/^([^\s]+):\s+.*$/, '$1');
}

function parseTaskFiles(filesBlock) {
  const files = [];

  for (const rawLine of stripXmlComments(filesBlock).split(/\r?\n/)) {
    let line = trimWhitespace(decodeXmlEntities(stripXmlTags(rawLine)));

    if (!line || line.startsWith('#') || line.startsWith('//') || line.endsWith(':')) {
      continue;
    }

    line = line.replace(/^[-*]\s+/, '').replace(/^[0-9]+[.)]\s+/, '');
    line = stripTaskFileAnnotation(line);

    if (line) {
      files.push(line);
    }
  }

  return files;
}

function parseAcceptanceCriteria(criteriaBlock, warnings) {
  const criteria = [];
  const seenIds = new Set();

  for (const rawCriterion of parseRawAcceptanceCriteria(criteriaBlock)) {
    const id = rawCriterion.id || UNKNOWN;
    const text = normalizeMultilineText(rawCriterion.body) || '';

    if (id === UNKNOWN) {
      addWarning(warnings, 'task.ac.id_missing', 'acceptance criterion is missing an id');
    } else {
      if (!/^AC-[0-9]+$/.test(id)) {
        addWarning(warnings, 'task.ac.id_invalid', `acceptance criterion id is invalid: ${id}`);
      }
      if (seenIds.has(id)) {
        addWarning(warnings, 'task.ac.duplicate', `duplicate acceptance criterion id: ${id}`);
      }
      seenIds.add(id);
    }

    if (!text) {
      addWarning(warnings, 'task.ac.text_missing', `acceptance criterion ${id} has no text`);
    } else if (
      !/(^|\s)Given\s/.test(text)
      || !/(^|\s)When\s/.test(text)
      || !/(^|\s)Then\s/.test(text)
    ) {
      addWarning(
        warnings,
        'task.ac.bdd_missing',
        `acceptance criterion ${id} should contain Given, When, and Then`
      );
    }

    criteria.push({ id, text });
  }

  const openCount = countOpeningTags(criteriaBlock, 'ac');
  const closeCount = countClosingTags(criteriaBlock, 'ac');
  if (openCount > closeCount) {
    addWarning(warnings, 'task.ac.malformed', 'acceptance criteria contain an unclosed ac tag');
  }

  if (openCount <= closeCount && /<ac\b/i.test(criteriaBlock) && criteria.length === 0) {
    addWarning(warnings, 'task.ac.malformed', 'acceptance criteria contain an unclosed ac tag');
  }

  return criteria;
}

function extractVerifyAcReferences(verifyText) {
  return String(verifyText || '')
    .split(/[^A-Za-z0-9_-]+/)
    .filter((token) => /^AC-[0-9]+$/.test(token));
}

function warnMissingText(warnings, tag) {
  addWarning(warnings, `task.${tag}.missing`, `${tag} is missing or empty`);
}

function readKnownBlock(content, tag, warnings) {
  const block = findTag(content, tag);

  if (!block) {
    warnMissingText(warnings, tag);
    return null;
  }

  if (!block.closed) {
    addWarning(warnings, `task.${tag}.unclosed`, `${tag} is missing a closing tag`);
    return null;
  }

  if (!meaningfulText(block.body)) {
    warnMissingText(warnings, tag);
  }

  return block;
}

function parseTaskPlanXml(content, options = {}) {
  const taskPlan = createEmptyTaskPlan();
  const warnings = taskPlan.warnings;
  const xml = String(content || '');
  const expectedTaskId = options.expectedTaskId || expectedTaskIdFromPath(options.planPath);

  if (!trimWhitespace(xml)) {
    addWarning(warnings, 'task.xml.empty', 'task plan XML is empty');
    return taskPlan;
  }

  const taskBlock = findTag(xml, 'task');
  const contentToParse = taskBlock && taskBlock.closed ? taskBlock.body : xml;

  if (!taskBlock) {
    addWarning(warnings, 'task.xml.root_missing', 'task plan is missing a task root');
  } else {
    if (!taskBlock.closed) {
      addWarning(warnings, 'task.xml.root_unclosed', 'task root is missing a closing tag');
    }

    taskPlan.id = extractAttr(taskBlock.openTag, 'id') || UNKNOWN;
    taskPlan.type = extractAttr(taskBlock.openTag, 'type') || UNKNOWN;
  }

  if (taskPlan.id === UNKNOWN) {
    addWarning(warnings, 'task.id.missing', 'task id is missing');
  } else if (expectedTaskId && taskPlan.id !== expectedTaskId) {
    addWarning(
      warnings,
      'task.id.mismatch',
      `task id should match filename: expected ${expectedTaskId}, got ${taskPlan.id}`
    );
  }

  if (taskPlan.type === UNKNOWN) {
    addWarning(warnings, 'task.type.missing', 'task type is missing');
  }

  const nameBlock = readKnownBlock(contentToParse, 'name', warnings);
  if (nameBlock) {
    taskPlan.name = normalizeSingleLineText(nameBlock.body) || UNKNOWN;
  }

  const filesBlock = readKnownBlock(contentToParse, 'files', warnings);
  if (filesBlock) {
    taskPlan.files = parseTaskFiles(filesBlock.body);
    if (taskPlan.files.length === 0) {
      addWarning(warnings, 'task.files.empty', 'files contains no concrete paths');
    }
  }

  const riskBlock = readKnownBlock(contentToParse, 'risk', warnings);
  if (riskBlock) {
    const riskLevel = extractAttr(riskBlock.openTag, 'level') || UNKNOWN;
    if (RISK_LEVELS.has(riskLevel)) {
      taskPlan.risk.level = riskLevel;
    } else {
      addWarning(
        warnings,
        'task.risk.level_invalid',
        `risk level should be low, medium, or high: ${riskLevel}`
      );
    }
    taskPlan.risk.reason = normalizeMultilineText(riskBlock.body) || '';
  }

  const criteriaBlock = readKnownBlock(contentToParse, 'acceptance_criteria', warnings);
  if (criteriaBlock) {
    taskPlan.acceptance_criteria = parseAcceptanceCriteria(criteriaBlock.body, warnings);
    if (taskPlan.acceptance_criteria.length === 0) {
      addWarning(
        warnings,
        'task.ac.missing',
        'acceptance_criteria contains no acceptance criteria'
      );
    }
  }

  const actionBlock = readKnownBlock(contentToParse, 'action', warnings);
  if (actionBlock) {
    taskPlan.action = normalizeDisplayLines(actionBlock.body);
  }

  const boundariesBlock = readKnownBlock(contentToParse, 'boundaries', warnings);
  if (boundariesBlock) {
    taskPlan.boundaries = normalizeDisplayLines(boundariesBlock.body);
  }

  const verifyBlock = readKnownBlock(contentToParse, 'verify', warnings);
  if (verifyBlock) {
    taskPlan.verify = normalizeDisplayLines(verifyBlock.body);
    const verifyRefs = new Set(extractVerifyAcReferences(taskPlan.verify.join('\n')));
    const knownAcIds = new Set(
      taskPlan.acceptance_criteria
        .map((criterion) => criterion.id)
        .filter((id) => id !== UNKNOWN)
    );

    if (verifyRefs.size === 0) {
      addWarning(warnings, 'task.verify.ac_missing', 'verify does not reference an AC id');
    }

    for (const ref of verifyRefs) {
      if (!knownAcIds.has(ref)) {
        addWarning(warnings, 'task.verify.unknown_ac', `verify references unknown ${ref}`);
      }
    }
  }

  const doneBlock = readKnownBlock(contentToParse, 'done', warnings);
  if (doneBlock) {
    taskPlan.done = normalizeMultilineText(doneBlock.body);
  }

  return taskPlan;
}

module.exports = {
  createEmptyTaskPlan,
  parseTaskPlanXml
};
