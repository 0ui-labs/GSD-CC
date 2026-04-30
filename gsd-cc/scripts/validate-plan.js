#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MAX_TASKS_PER_SLICE = 7;
const MAX_FILES_PER_TASK = 15;
const RISK_LEVELS = new Set(['low', 'medium', 'high']);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function displayPath(filePath) {
  const relative = path.relative(process.cwd(), filePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return toPosix(relative);
  }
  return toPosix(filePath);
}

function usage() {
  return [
    'Usage: node scripts/validate-plan.js [--json] <plan-file>',
    '',
    'Validates .gsd/Sxx-PLAN.md or .gsd/Sxx-Txx-PLAN.xml.'
  ].join('\n');
}

function createContext(targetPath) {
  return {
    targetPath,
    errors: [],
    warnings: []
  };
}

function addError(context, filePath, code, message) {
  context.errors.push({
    file: displayPath(filePath),
    code,
    message
  });
}

function addWarning(context, filePath, code, message) {
  context.warnings.push({
    file: displayPath(filePath),
    code,
    message
  });
}

function readText(context, filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    addError(context, filePath, 'file.read_failed', error.message);
    return '';
  }
}

function trimWhitespace(value) {
  return String(value || '').replace(/^\s+|\s+$/g, '');
}

function stripXmlComments(value) {
  return String(value || '').replace(/<!--[\s\S]*?-->/g, '');
}

function textHasMeaning(value) {
  return trimWhitespace(stripXmlComments(value).replace(/<[^>]+>/g, '')).length > 0;
}

function extractXmlBlock(content, tag) {
  const match = String(content || '').match(new RegExp(`<${tag}\\b[^>]*>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i'));
  return match ? match[1] : '';
}

function extractTagAttr(content, tag, attr) {
  const tagMatch = String(content || '').match(new RegExp(`<${tag}\\b[^>]*>`, 'i'));
  if (!tagMatch) {
    return '';
  }
  const attrMatch = tagMatch[0].match(new RegExp(`\\s${attr}=["']([^"']+)["']`, 'i'));
  return attrMatch ? attrMatch[1] : '';
}

function extractTaskAttr(content, attr) {
  const taskMatch = String(content || '').match(/<task\b[^>]*>/i);
  if (!taskMatch) {
    return '';
  }
  const attrMatch = taskMatch[0].match(new RegExp(`\\s${attr}=["']([^"']+)["']`, 'i'));
  return attrMatch ? attrMatch[1] : '';
}

function expectedTaskId(planPath) {
  return path.basename(planPath).replace(/-PLAN\.xml$/i, '');
}

function hasUnresolvedToken(value) {
  return /(^|[^A-Za-z0-9_])(TODO|TBD|later)([^A-Za-z0-9_]|$)/i.test(String(value || ''));
}

function stripTaskFileAnnotation(value) {
  return trimWhitespace(value)
    .replace(/\s+\([^)]*\)$/, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+#\s+.*$/, '')
    .replace(/\s+\/\/\s+.*$/, '')
    .replace(/^([^\s]+):\s+.*$/, '$1');
}

function normalizeRepoPath(value) {
  let repoPath = trimWhitespace(value);
  while (repoPath.startsWith('./')) {
    repoPath = repoPath.slice(2);
  }

  if (
    !repoPath ||
    repoPath === '.' ||
    repoPath === '..' ||
    repoPath.startsWith('/') ||
    repoPath.startsWith('~') ||
    repoPath.endsWith('/')
  ) {
    return null;
  }

  if (repoPath.split('/').includes('..')) {
    return null;
  }

  if (/[*?[\]]/.test(repoPath)) {
    return null;
  }

  return repoPath;
}

function parseTaskFiles(content) {
  const filesBlock = extractXmlBlock(content, 'files');
  const files = [];

  for (const rawLine of filesBlock.split(/\r?\n/)) {
    let line = rawLine.replace(/<!--.*?-->/g, '');
    line = trimWhitespace(line);

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

function parseAcceptanceCriteria(content) {
  const criteria = [];
  const acPattern = /<ac\b([^>]*)>([\s\S]*?)<\/ac>/gi;
  let match;

  while ((match = acPattern.exec(content)) !== null) {
    const idMatch = match[1].match(/\bid=["']([^"']+)["']/i);
    criteria.push({
      id: idMatch ? idMatch[1] : '',
      body: match[2]
    });
  }

  return criteria;
}

function extractVerifyAcReferences(verifyText) {
  return String(verifyText || '')
    .split(/[^A-Za-z0-9_-]+/)
    .filter((token) => /^AC-[0-9]+$/.test(token));
}

function extractFirstVerifyCommand(verifyText) {
  return trimWhitespace(String(verifyText || '').replace(/\s+\([^)]*AC-[^)]*\)\s*$/i, ''));
}

function safeCommandToken(value) {
  return /^[A-Za-z0-9_./@:+%=-]+$/.test(value || '');
}

function recognizedVerifyCommand(command) {
  if (!command || /&&|\|\||;|\|/.test(command)) {
    return false;
  }

  const parts = command.split(/\s+/);
  if (!parts.every((token) => safeCommandToken(token))) {
    return false;
  }

  const [first = '', second = '', third = ''] = parts;
  if (['npm', 'pnpm', 'yarn'].includes(first)) {
    return second === 'test' || (second === 'run' && Boolean(third));
  }
  if (['node', 'python3'].includes(first)) {
    return Boolean(second) && !second.startsWith('-');
  }
  if (first === 'pytest') {
    return true;
  }
  if (first === 'cargo' || first === 'go') {
    return second === 'test';
  }
  if (first === 'make') {
    return safeCommandToken(second);
  }

  return false;
}

function readConfigField(gsdDir, field) {
  const configPath = path.join(gsdDir, 'CONFIG.md');
  if (!fs.existsSync(configPath)) {
    return '';
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return match ? trimWhitespace(match[1]) : '';
}

function globPatternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function configAllowsCommand(gsdDir, command) {
  const raw = readConfigField(gsdDir, 'auto_apply_allowed_bash');
  if (!raw) {
    return false;
  }

  return raw.split(',').some((entry) => {
    const pattern = trimWhitespace(entry);
    if (!pattern || pattern.includes('Bash(') || pattern.includes(')')) {
      return false;
    }
    return globPatternToRegExp(pattern).test(command);
  });
}

function validateCriticalText(context, planPath, content, tag) {
  const block = tag === 'name'
    ? (String(content || '').match(/<name>\s*([\s\S]*?)\s*<\/name>/i) || [])[1] || ''
    : extractXmlBlock(content, tag);

  if (hasUnresolvedToken(block)) {
    addError(context, planPath, `task.unresolved.${tag}`, `${tag} contains TODO, TBD, or later`);
  }
}

function validateTaskPlan(context, planPath, options = {}) {
  const content = readText(context, planPath);
  const gsdDir = options.gsdDir || path.dirname(planPath);
  const sliceAcIds = options.sliceAcIds || new Set();
  const normalizedFiles = [];

  if (!content) {
    return { acIds: [], files: normalizedFiles, task: expectedTaskId(planPath) };
  }

  const taskId = extractTaskAttr(content, 'id');
  const taskType = extractTaskAttr(content, 'type');
  const expectedId = expectedTaskId(planPath);
  const taskName = (String(content).match(/<name>\s*([\s\S]*?)\s*<\/name>/i) || [])[1] || '';

  if (taskId !== expectedId) {
    addError(context, planPath, 'task.id_mismatch', `task id must match filename: expected ${expectedId}, got ${taskId || 'missing'}`);
  }

  if (taskType !== 'auto') {
    addError(context, planPath, 'task.type_invalid', `task type must be auto, got ${taskType || 'missing'}`);
  }

  for (const tag of ['name', 'files', 'risk', 'acceptance_criteria', 'action', 'boundaries', 'verify', 'done']) {
    const block = tag === 'name' ? taskName : extractXmlBlock(content, tag);
    if (!textHasMeaning(block)) {
      addError(context, planPath, `task.${tag}.missing`, `${tag} must exist and be non-empty`);
    }
  }

  const riskLevel = extractTagAttr(content, 'risk', 'level');
  if (!RISK_LEVELS.has(riskLevel)) {
    addError(context, planPath, 'task.risk.level_invalid', `risk level must be low, medium, or high: ${riskLevel || 'missing'}`);
  }

  for (const tag of ['name', 'files', 'risk', 'action', 'verify', 'done']) {
    validateCriticalText(context, planPath, content, tag);
  }

  const rawFiles = parseTaskFiles(content);
  if (rawFiles.length === 0) {
    addError(context, planPath, 'task.files.empty', 'files must list at least one concrete repo-relative path');
  }

  for (const rawFile of rawFiles) {
    if (rawFile.includes('{{') || rawFile.includes('}}')) {
      addError(context, planPath, 'task.files.placeholder', `files contains placeholder path: ${rawFile}`);
      continue;
    }

    if (hasUnresolvedToken(rawFile)) {
      addError(context, planPath, 'task.files.unresolved', `files contains unresolved placeholder: ${rawFile}`);
      continue;
    }

    const normalized = normalizeRepoPath(rawFile);
    if (!normalized) {
      addError(context, planPath, 'task.files.invalid_path', `files must use concrete repo-relative paths: ${rawFile}`);
      continue;
    }

    normalizedFiles.push(normalized);
  }

  if (normalizedFiles.length > MAX_FILES_PER_TASK) {
    addError(context, planPath, 'task.too_broad', `task owns ${normalizedFiles.length} files; split tasks above ${MAX_FILES_PER_TASK} files`);
  }

  const criteria = parseAcceptanceCriteria(content);
  if (criteria.length === 0) {
    addError(context, planPath, 'task.ac.missing', 'acceptance_criteria must contain at least one AC');
  }

  const taskAcIds = new Set();
  const acIds = [];
  for (const criterion of criteria) {
    if (!criterion.id) {
      addError(context, planPath, 'task.ac.id_missing', 'acceptance criterion missing id');
      continue;
    }

    if (!/^AC-[0-9]+$/.test(criterion.id)) {
      addError(context, planPath, 'task.ac.id_invalid', `acceptance criterion id must use AC-n format: ${criterion.id}`);
    }

    if (taskAcIds.has(criterion.id)) {
      addError(context, planPath, 'task.ac.duplicate_task', `duplicate AC id in task: ${criterion.id}`);
    }

    if (sliceAcIds.has(criterion.id)) {
      addError(context, planPath, 'task.ac.duplicate_slice', `duplicate AC id in slice: ${criterion.id}`);
    }

    taskAcIds.add(criterion.id);
    acIds.push(criterion.id);

    if (!/(^|\s)Given\s/.test(criterion.body) ||
        !/(^|\s)When\s/.test(criterion.body) ||
        !/(^|\s)Then\s/.test(criterion.body)) {
      addError(context, planPath, 'task.ac.bdd_missing', 'each AC must contain Given, When, and Then');
    }
  }

  const verifyText = extractXmlBlock(content, 'verify');
  const verifyRefs = [...new Set(extractVerifyAcReferences(verifyText))];
  if (verifyRefs.length === 0) {
    addError(context, planPath, 'task.verify.ac_missing', 'verify must reference at least one AC id');
  }

  for (const ref of verifyRefs) {
    if (!taskAcIds.has(ref)) {
      addError(context, planPath, 'task.verify.unknown_ac', `verify references unknown ${ref}`);
    }
  }

  const verifyCommand = extractFirstVerifyCommand(verifyText);
  if (!verifyCommand) {
    addError(context, planPath, 'task.verify.command_missing', 'verify must contain a command before AC references');
  } else if (!recognizedVerifyCommand(verifyCommand) && !configAllowsCommand(gsdDir, verifyCommand)) {
    addError(context, planPath, 'task.verify.command_disallowed', `verify command is not allowed for auto-mode: ${verifyCommand}`);
  }

  return {
    acIds,
    files: normalizedFiles,
    task: expectedId.replace(/^S[0-9]+-/, '')
  };
}

function extractDependenciesSection(content) {
  const lines = String(content || '').split(/\r?\n/);
  const collected = [];
  let inSection = false;

  for (const line of lines) {
    if (/^##\s+Dependencies\s*$/i.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && /^##\s+/.test(line)) {
      break;
    }

    if (inSection) {
      collected.push(line);
    }
  }

  return trimWhitespace(collected.join('\n'));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function dependenciesSequenceTasks(dependenciesText, leftTask, rightTask) {
  if (!dependenciesText) {
    return false;
  }

  const left = escapeRegExp(leftTask);
  const right = escapeRegExp(rightTask);
  const token = '(?:→|->|=>|\\bbefore\\b|\\bafter\\b|\\bdepends(?:\\s+on)?\\b|\\bthen\\b)';
  const leftBoundary = `(?:^|[^A-Za-z0-9_])${left}(?:[^A-Za-z0-9_]|$)`;
  const rightBoundary = `(?:^|[^A-Za-z0-9_])${right}(?:[^A-Za-z0-9_]|$)`;
  const linked = [
    new RegExp(`${leftBoundary}.*${token}.*${rightBoundary}`, 'i'),
    new RegExp(`${rightBoundary}.*${token}.*${leftBoundary}`, 'i')
  ];

  return String(dependenciesText)
    .split(/\r?\n/)
    .some((line) => linked.some((pattern) => pattern.test(line)));
}

function validateDuplicateOwnership(context, slicePlanPath, taskResults, dependenciesText) {
  const ownersByFile = new Map();

  for (const taskResult of taskResults) {
    for (const filePath of taskResult.files) {
      if (!ownersByFile.has(filePath)) {
        ownersByFile.set(filePath, []);
      }
      ownersByFile.get(filePath).push(taskResult.task);
    }
  }

  for (const [filePath, owners] of ownersByFile.entries()) {
    const uniqueOwners = [...new Set(owners)];
    if (uniqueOwners.length < 2) {
      continue;
    }

    let sequenced = true;
    for (let i = 0; i < uniqueOwners.length; i += 1) {
      for (let j = i + 1; j < uniqueOwners.length; j += 1) {
        if (!dependenciesSequenceTasks(dependenciesText, uniqueOwners[i], uniqueOwners[j])) {
          sequenced = false;
        }
      }
    }

    if (!sequenced) {
      addError(
        context,
        slicePlanPath,
        'slice.files.duplicate_ownership',
        `${filePath} is owned by multiple tasks (${uniqueOwners.join(', ')}) without explicit sequencing in ## Dependencies`
      );
    }
  }
}

function validateSlicePlan(context, slicePlanPath) {
  const sliceContent = readText(context, slicePlanPath);
  const gsdDir = path.dirname(slicePlanPath);
  const sliceMatch = path.basename(slicePlanPath).match(/^(S[0-9]+)-PLAN\.md$/);

  if (!sliceMatch) {
    addError(context, slicePlanPath, 'slice.name_invalid', 'slice plan must be named Sxx-PLAN.md');
    return;
  }

  const slice = sliceMatch[1];
  const entries = fs.existsSync(gsdDir) ? fs.readdirSync(gsdDir) : [];
  const legacyPlans = entries.filter((entry) => new RegExp(`^${slice}-T[0-9]+-PLAN\\.md$`).test(entry));
  const taskPlans = entries
    .filter((entry) => new RegExp(`^${slice}-T[0-9]+-PLAN\\.xml$`).test(entry))
    .sort();

  for (const legacyPlan of legacyPlans) {
    addError(
      context,
      path.join(gsdDir, legacyPlan),
      'slice.legacy_task_plan',
      'legacy Markdown task plans are not valid for auto-mode; regenerate XML task plans'
    );
  }

  if (taskPlans.length === 0) {
    addError(context, slicePlanPath, 'slice.taskPlans.missing', `missing task plans matching ${slice}-Txx-PLAN.xml`);
    return;
  }

  if (taskPlans.length > MAX_TASKS_PER_SLICE) {
    addError(context, slicePlanPath, 'slice.taskPlans.too_many', `slice has ${taskPlans.length} tasks; split slices above ${MAX_TASKS_PER_SLICE} tasks`);
  }

  const sliceAcIds = new Set();
  const taskResults = [];
  for (const taskPlan of taskPlans) {
    const result = validateTaskPlan(context, path.join(gsdDir, taskPlan), {
      gsdDir,
      sliceAcIds
    });

    for (const acId of result.acIds) {
      sliceAcIds.add(acId);
    }
    taskResults.push(result);
  }

  validateDuplicateOwnership(
    context,
    slicePlanPath,
    taskResults,
    extractDependenciesSection(sliceContent)
  );

  if (!extractDependenciesSection(sliceContent)) {
    addWarning(context, slicePlanPath, 'slice.dependencies.missing', 'slice plan has no ## Dependencies section');
  }
}

function validateTarget(targetPath) {
  const absoluteTarget = path.resolve(targetPath);
  const context = createContext(absoluteTarget);

  if (!fs.existsSync(absoluteTarget)) {
    addError(context, absoluteTarget, 'file.missing', 'plan file does not exist');
    return context;
  }

  if (/\.xml$/i.test(absoluteTarget)) {
    validateTaskPlan(context, absoluteTarget);
  } else if (/\.md$/i.test(absoluteTarget)) {
    validateSlicePlan(context, absoluteTarget);
  } else {
    addError(context, absoluteTarget, 'file.type_unsupported', 'expected a .md slice plan or .xml task plan');
  }

  return context;
}

function printHumanResult(context) {
  const target = displayPath(context.targetPath);
  if (context.errors.length === 0) {
    if (context.warnings.length > 0) {
      console.log(`Plan has warnings: ${target}`);
    } else {
      console.log(`Plan valid: ${target}`);
    }
  } else {
    console.log(`Plan validation failed: ${target}`);
    for (const error of context.errors) {
      console.log(`- [${error.code}] ${error.file}: ${error.message}`);
    }
  }

  for (const warning of context.warnings) {
    console.log(`- [${warning.code}] ${warning.file}: ${warning.message}`);
  }
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((arg) => arg !== '--json');

  if (args.length !== 1) {
    const context = createContext(process.cwd());
    addError(context, process.cwd(), 'cli.usage', usage());
    if (json) {
      console.log(JSON.stringify({ valid: false, errors: context.errors, warnings: context.warnings }, null, 2));
    } else {
      console.error(usage());
    }
    return 1;
  }

  const context = validateTarget(args[0]);
  const output = {
    valid: context.errors.length === 0,
    errors: context.errors,
    warnings: context.warnings
  };

  if (json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    printHumanResult(context);
  }

  return output.valid ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  validateTarget
};
