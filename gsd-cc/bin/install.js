#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

const pkg = require('../package.json');

const banner = `
${cyan}   ██████╗ ███████╗██████╗        ██████╗ ██████╗
  ██╔════╝ ██╔════╝██╔══██╗      ██╔════╝██╔════╝
  ██║  ███╗███████╗██║  ██║█████╗██║     ██║
  ██║   ██║╚════██║██║  ██║╚════╝██║     ██║
  ╚██████╔╝███████║██████╔╝      ╚██████╗╚██████╗
   ╚═════╝ ╚══════╝╚═════╝        ╚═════╝ ╚═════╝${reset}

  Get Shit Done on Claude Code ${dim}v${pkg.version}${reset}
`;

const MANAGED_BY = 'gsd-cc';
const MANIFEST_VERSION = 1;
const MANIFEST_DIR = 'gsd-cc';
const MANIFEST_FILENAME = 'install-manifest.json';
const CURRENT_HOOK_DIR = path.join('hooks', 'gsd-cc');
const LEGACY_HOOK_DIR = 'hooks';
const CLAUDE_CONFIG_BLOCK_START = '<!-- gsd-cc:config:start -->';
const CLAUDE_CONFIG_BLOCK_END = '<!-- gsd-cc:config:end -->';
const LEGACY_CLAUDE_CONFIG_REGEX = /\n?# GSD-CC Config\nGSD-CC language: .+\n?/;

const INSTALL_LAYOUT = [
  { sourceDir: 'skills', targetDir: 'skills' },
  { sourceDir: 'hooks', targetDir: CURRENT_HOOK_DIR },
  { sourceDir: 'checklists', targetDir: 'checklists' },
  { sourceDir: 'templates', targetDir: 'templates' },
];

const HOOK_SPECS = [
  {
    event: 'PreToolUse',
    matcher: 'Edit|Write',
    hooks: [
      { file: 'gsd-boundary-guard.sh', timeout: 5000 },
      { file: 'gsd-prompt-guard.sh', timeout: 5000 }
    ]
  },
  {
    event: 'PostToolUse',
    matcher: null,
    hooks: [
      { file: 'gsd-context-monitor.sh', timeout: 5000 },
      { file: 'gsd-statusline.sh', timeout: 3000 }
    ]
  },
  {
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    hooks: [{ file: 'gsd-workflow-guard.sh', timeout: 5000 }]
  }
];

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasUninstall = args.includes('--uninstall');
const hasHelp = args.includes('--help') || args.includes('-h');

console.log(banner);

if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx gsd-cc [options]

  ${yellow}Options:${reset}
    ${cyan}-g, --global${reset}      Install globally to ~/.claude/skills/ ${dim}(default)${reset}
    ${cyan}-l, --local${reset}       Install locally to ./.claude/skills/
    ${cyan}--uninstall${reset}       Remove GSD-CC safely from detected installs
    ${cyan}-h, --help${reset}        Show this help message

  ${yellow}Examples:${reset}
    ${dim}# Install globally (default)${reset}
    npx gsd-cc

    ${dim}# Install to current project only${reset}
    npx gsd-cc --local

    ${dim}# Remove GSD-CC${reset}
    npx gsd-cc --uninstall
`);
  process.exit(0);
}

function getClaudeBase(isGlobal) {
  if (isGlobal) {
    return path.join(os.homedir(), '.claude');
  }
  return path.join(process.cwd(), '.claude');
}

function getSettingsPath(isGlobal) {
  return path.join(
    getClaudeBase(isGlobal),
    isGlobal ? 'settings.json' : 'settings.local.json'
  );
}

function getClaudeMdPath(isGlobal) {
  if (isGlobal) {
    return path.join(getClaudeBase(true), 'CLAUDE.md');
  }
  return path.join(process.cwd(), 'CLAUDE.md');
}

function getClaudeConfigRelativePath(isGlobal) {
  return isGlobal ? 'CLAUDE.md' : path.join('..', 'CLAUDE.md');
}

function getManifestPath(claudeBase) {
  return path.join(claudeBase, MANIFEST_DIR, MANIFEST_FILENAME);
}

function formatPath(targetPath) {
  return targetPath.replace(os.homedir(), '~').replace(process.cwd(), '.');
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFileAtomic(filePath, content, mode) {
  ensureDirectory(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const options = mode === undefined ? undefined : { mode };
  fs.writeFileSync(tempPath, content, options);
  if (mode !== undefined) {
    fs.chmodSync(tempPath, mode);
  }
  fs.renameSync(tempPath, filePath);
}

function writeJsonAtomic(jsonPath, value) {
  writeFileAtomic(jsonPath, JSON.stringify(value, null, 2) + '\n');
}

function loadJsonFile(jsonPath, label) {
  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${label} at ${formatPath(jsonPath)} contains invalid JSON. ` +
      `GSD-CC left it untouched.`
    );
  }
}

function validateSettingsStructure(settings, settingsPath) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error(
      `Claude settings at ${formatPath(settingsPath)} must be a JSON object.`
    );
  }

  if (
    settings.hooks !== undefined &&
    (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks))
  ) {
    throw new Error(
      `Claude settings at ${formatPath(settingsPath)} contain an invalid ` +
      '"hooks" value. Expected an object.'
    );
  }

  if (settings.hooks) {
    for (const [event, entries] of Object.entries(settings.hooks)) {
      if (!Array.isArray(entries)) {
        throw new Error(
          `Claude settings at ${formatPath(settingsPath)} contain an invalid ` +
          `hook list for "${event}". Expected an array.`
        );
      }
    }
  }
}

function loadJsonFileForCleanup(jsonPath, label, warnings) {
  try {
    return loadJsonFile(jsonPath, label);
  } catch (error) {
    warnings.push(error.message);
    return null;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceLanguageBlock(content, language) {
  const block = [
    CLAUDE_CONFIG_BLOCK_START,
    '# GSD-CC Config',
    `GSD-CC language: ${language}`,
    CLAUDE_CONFIG_BLOCK_END
  ].join('\n');
  const markerRegex = new RegExp(
    `${escapeRegExp(CLAUDE_CONFIG_BLOCK_START)}[\\s\\S]*?${escapeRegExp(CLAUDE_CONFIG_BLOCK_END)}`
  );

  if (markerRegex.test(content)) {
    return content.replace(markerRegex, block);
  }

  if (LEGACY_CLAUDE_CONFIG_REGEX.test(content)) {
    return content.replace(LEGACY_CLAUDE_CONFIG_REGEX, `\n${block}\n`);
  }

  if (!content.trim()) {
    return `${block}\n`;
  }

  const suffix = content.endsWith('\n') ? '' : '\n';
  return `${content}${suffix}\n${block}\n`;
}

function cleanLanguageBlockRemoval(content) {
  return content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '\n');
}

function removeLanguageConfigBlock(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const markerRegex = new RegExp(
    `\\n?${escapeRegExp(CLAUDE_CONFIG_BLOCK_START)}[\\s\\S]*?${escapeRegExp(CLAUDE_CONFIG_BLOCK_END)}\\n?`
  );

  let next = original;
  next = next.replace(markerRegex, '\n');
  next = next.replace(LEGACY_CLAUDE_CONFIG_REGEX, '\n');

  if (next === original) {
    return false;
  }

  writeFileAtomic(filePath, cleanLanguageBlockRemoval(next));
  return true;
}

function writeLanguageConfig(isGlobal, language) {
  const claudeMdPath = getClaudeMdPath(isGlobal);
  const existingContent = fs.existsSync(claudeMdPath)
    ? fs.readFileSync(claudeMdPath, 'utf8')
    : '';
  const nextContent = replaceLanguageBlock(existingContent, language);

  if (nextContent !== existingContent) {
    writeFileAtomic(claudeMdPath, nextContent);
  }
}

function collectRelativeFiles(rootDir, currentDir, files) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      collectRelativeFiles(rootDir, absolutePath, files);
      continue;
    }

    files.push(path.relative(rootDir, absolutePath));
  }
}

function collectAssets(srcBase, claudeBase) {
  const assets = [];

  for (const layout of INSTALL_LAYOUT) {
    const sourceRoot = path.join(srcBase, layout.sourceDir);
    if (!fs.existsSync(sourceRoot)) {
      continue;
    }

    const relativeFiles = [];
    collectRelativeFiles(sourceRoot, sourceRoot, relativeFiles);

    for (const relativePath of relativeFiles) {
      const targetRelativePath = path.join(layout.targetDir, relativePath);
      assets.push({
        sourcePath: path.join(sourceRoot, relativePath),
        targetPath: path.join(claudeBase, targetRelativePath),
        targetRelativePath,
      });
    }
  }

  return assets.sort((left, right) => {
    return left.targetRelativePath.localeCompare(right.targetRelativePath);
  });
}

function compareFileContents(sourcePath, targetPath) {
  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.statSync(targetPath);

  if (!sourceStat.isFile() || !targetStat.isFile()) {
    return false;
  }

  if (sourceStat.size !== targetStat.size) {
    return false;
  }

  return fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath));
}

function countSegments(relativePath) {
  return relativePath.split(path.sep).length;
}

function sortPathsDeepFirst(paths) {
  return [...paths].sort((left, right) => {
    const depth = countSegments(right) - countSegments(left);
    if (depth !== 0) {
      return depth;
    }
    return right.localeCompare(left);
  });
}

function collectManagedDirectories(relativeFilePaths) {
  const directories = new Set([MANIFEST_DIR]);

  for (const relativeFilePath of relativeFilePaths) {
    let currentDir = path.dirname(relativeFilePath);

    while (currentDir && currentDir !== '.') {
      directories.add(currentDir);
      currentDir = path.dirname(currentDir);
    }
  }

  return sortPathsDeepFirst([...directories]);
}

function findExecutable(command) {
  const searchPath = process.env.PATH || '';

  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    const candidate = path.join(directory, command);

    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (error) {
      continue;
    }
  }

  return null;
}

function buildReadinessState(reasons) {
  return {
    ready: reasons.length === 0,
    reasons
  };
}

function probeDependencies() {
  const dependencies = {
    jq: {
      label: 'jq',
      path: findExecutable('jq')
    },
    git: {
      label: 'git',
      path: findExecutable('git')
    },
    claude: {
      label: 'claude CLI',
      path: findExecutable('claude')
    }
  };

  for (const dependency of Object.values(dependencies)) {
    dependency.available = Boolean(dependency.path);
  }

  const hookReasons = [];
  if (!dependencies.jq.available) {
    hookReasons.push('jq not found');
  }

  const autoReasons = [];
  if (!dependencies.jq.available) {
    autoReasons.push('jq not found');
  }
  if (!dependencies.git.available) {
    autoReasons.push('git not found');
  }
  if (!dependencies.claude.available) {
    autoReasons.push('claude CLI not found');
  }

  return {
    dependencies,
    readiness: {
      install: buildReadinessState([]),
      hooks: buildReadinessState(hookReasons),
      auto: buildReadinessState(autoReasons)
    }
  };
}

function getReadinessStatusLabel(name, readiness) {
  if (readiness.ready) {
    return `${green}ready${reset}`;
  }

  return name === 'hooks'
    ? `${yellow}disabled${reset}`
    : `${yellow}unavailable${reset}`;
}

function formatReadinessLine(name, label, readiness) {
  const suffix = readiness.ready
    ? ''
    : ` (${readiness.reasons.join(', ')})`;

  return `  ${label}: ${getReadinessStatusLabel(name, readiness)}${suffix}`;
}

function getRecoverySteps(probe, isGlobal) {
  const steps = [];
  const reinstallCommand = isGlobal ? 'npx gsd-cc' : 'npx gsd-cc --local';

  if (!probe.dependencies.jq.available) {
    steps.push('Install jq: brew install jq');
    steps.push(`Rerun ${reinstallCommand} to enable hooks after jq is available`);
  }

  if (!probe.dependencies.git.available) {
    steps.push('Install Git and ensure `git` is available in your PATH');
  }

  if (!probe.dependencies.claude.available) {
    steps.push('Install Claude Code and ensure `claude` is available in your PATH');
  }

  return steps;
}

function printReadinessSummary(probe, isGlobal) {
  console.log('\n  Readiness summary:');
  console.log(formatReadinessLine('install', 'Installation', probe.readiness.install));
  console.log(formatReadinessLine('hooks', 'Hooks', probe.readiness.hooks));
  console.log(formatReadinessLine('auto', 'Auto-mode', probe.readiness.auto));

  const steps = getRecoverySteps(probe, isGlobal);
  for (const step of steps) {
    console.log(`  Next step: ${step}`);
  }
}

function buildHookSpecs(claudeBase, relativeHookDir) {
  return HOOK_SPECS.map((group) => {
    const commands = group.hooks.map((hook) => path.join(relativeHookDir, hook.file));
    return {
      event: group.event,
      matcher: group.matcher,
      commands,
      hooks: group.hooks.map((hook) => ({
        type: 'command',
        command: path.join(claudeBase, relativeHookDir, hook.file),
        timeout: hook.timeout
      }))
    };
  });
}

function normalizeMatcher(value) {
  return value || null;
}

function hookEntryMatchesSpec(entry, spec) {
  if (normalizeMatcher(entry.matcher) !== normalizeMatcher(spec.matcher)) {
    return false;
  }

  if (!Array.isArray(entry.hooks) || entry.hooks.length !== spec.hooks.length) {
    return false;
  }

  return entry.hooks.every((hook, index) => {
    const expected = spec.hooks[index];
    return hook &&
      hook.type === 'command' &&
      typeof hook.command === 'string' &&
      path.normalize(hook.command) === path.normalize(expected.command);
  });
}

function normalizeHookCommand(command) {
  return path.normalize(command);
}

function collectManagedHookCommands(specs) {
  const commands = new Set();

  for (const spec of specs) {
    for (const hook of spec.hooks) {
      if (hook && hook.type === 'command' && typeof hook.command === 'string') {
        commands.add(normalizeHookCommand(hook.command));
      }
    }
  }

  return commands;
}

function hookEntryOwnedByCommands(entry, managedCommands) {
  if (!Array.isArray(entry.hooks) || entry.hooks.length === 0) {
    return false;
  }

  return entry.hooks.every((hook) => {
    return hook &&
      hook.type === 'command' &&
      typeof hook.command === 'string' &&
      managedCommands.has(normalizeHookCommand(hook.command));
  });
}

function removeHookEntries(settings, specs) {
  if (!settings.hooks) {
    return false;
  }

  if (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    throw new Error(
      'Claude settings contain an invalid "hooks" value. ' +
      'Expected an object of hook arrays.'
    );
  }

  let changed = false;
  const managedCommands = collectManagedHookCommands(specs);

  for (const [event, entries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(entries)) {
      throw new Error(
        `Claude settings contain an invalid hook list for "${event}". ` +
        'Expected an array.'
      );
    }

    const eventSpecs = specs.filter((spec) => spec.event === event);
    if (eventSpecs.length === 0) {
      continue;
    }

    const nextEntries = entries.filter((entry) => {
      const exactMatch = eventSpecs.some((spec) => hookEntryMatchesSpec(entry, spec));
      return !(exactMatch || hookEntryOwnedByCommands(entry, managedCommands));
    });

    if (nextEntries.length !== entries.length) {
      changed = true;
    }

    if (nextEntries.length === 0) {
      delete settings.hooks[event];
    } else {
      settings.hooks[event] = nextEntries;
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return changed;
}

function addHookEntries(settings, specs) {
  if (specs.length === 0) {
    return;
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const spec of specs) {
    if (!settings.hooks[spec.event]) {
      settings.hooks[spec.event] = [];
    }

    const entry = { hooks: spec.hooks };
    if (spec.matcher) {
      entry.matcher = spec.matcher;
    }

    settings.hooks[spec.event].push(entry);
  }
}

function fileContains(filePath, snippet) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  return fs.readFileSync(filePath, 'utf8').includes(snippet);
}

function detectLegacyInstallation(claudeBase) {
  const reasons = [];
  const skillsRoot = path.join(claudeBase, 'skills');
  const routerSkill = path.join(skillsRoot, 'gsd-cc', 'SKILL.md');

  if (fileContains(routerSkill, 'name: gsd-cc')) {
    reasons.push('skills/gsd-cc/SKILL.md');
  }

  if (fs.existsSync(skillsRoot)) {
    const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === 'gsd' || entry.name.startsWith('gsd-cc-')) {
        reasons.push(path.join('skills', entry.name));
      }
    }
  }

  for (const spec of buildHookSpecs(claudeBase, LEGACY_HOOK_DIR)) {
    for (const hook of spec.hooks) {
      if (fs.existsSync(hook.command)) {
        reasons.push(path.relative(claudeBase, hook.command));
      }
    }
  }

  return {
    detected: reasons.length > 0,
    reasons: [...new Set(reasons)].sort()
  };
}

function collectLegacyPaths(claudeBase, assets) {
  const detection = detectLegacyInstallation(claudeBase);
  const legacyFiles = new Set();
  const legacyDirectories = new Set();
  const warnings = [];

  if (!detection.detected) {
    return {
      detected: false,
      reasons: [],
      files: [],
      directories: [],
      warnings
    };
  }

  for (const asset of assets) {
    if (fs.existsSync(asset.targetPath)) {
      legacyFiles.add(asset.targetRelativePath);
    }
  }

  for (const spec of buildHookSpecs(claudeBase, LEGACY_HOOK_DIR)) {
    for (const command of spec.commands) {
      const absolutePath = path.join(claudeBase, command);
      if (fs.existsSync(absolutePath)) {
        legacyFiles.add(command);
      }
    }
  }

  const skillsRoot = path.join(claudeBase, 'skills');
  if (fs.existsSync(skillsRoot)) {
    const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === 'gsd' || entry.name.startsWith('gsd-cc-')) {
        legacyDirectories.add(path.join('skills', entry.name));
      }
    }
  }

  const promptsDir = path.join(claudeBase, 'prompts');
  if (fs.existsSync(promptsDir)) {
    warnings.push(
      `${formatPath(promptsDir)} was left in place because GSD-CC can no ` +
      'longer prove it owns that directory.'
    );
  }

  return {
    detected: true,
    reasons: detection.reasons,
    files: [...legacyFiles].sort(),
    directories: sortPathsDeepFirst([...legacyDirectories]),
    warnings
  };
}

function validateManifest(manifest, manifestPath) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`Install manifest at ${formatPath(manifestPath)} is invalid.`);
  }

  if (manifest.source !== MANAGED_BY) {
    throw new Error(
      `Install manifest at ${formatPath(manifestPath)} is not owned by GSD-CC.`
    );
  }

  const requiredArrayFields = ['files', 'directories', 'managedHooks', 'managedConfigBlocks'];
  for (const field of requiredArrayFields) {
    if (!Array.isArray(manifest[field])) {
      throw new Error(
        `Install manifest at ${formatPath(manifestPath)} is missing "${field}".`
      );
    }
  }
}

function loadManifest(claudeBase) {
  const manifestPath = getManifestPath(claudeBase);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const manifest = loadJsonFile(manifestPath, 'Install manifest');
  validateManifest(manifest, manifestPath);
  return manifest;
}

function resolveManifestPath(claudeBase, relativePath) {
  return path.resolve(claudeBase, relativePath);
}

function manifestHookSpecsToRuntime(claudeBase, managedHooks) {
  return managedHooks.map((hook) => ({
    event: hook.event,
    matcher: hook.matcher,
    hooks: hook.commands.map((command) => ({
      type: 'command',
      command: resolveManifestPath(claudeBase, command)
    }))
  }));
}

function removeTrackedFiles(claudeBase, relativePaths, warnings) {
  let removed = 0;

  for (const relativePath of relativePaths) {
    const absolutePath = resolveManifestPath(claudeBase, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      warnings.push(
        `Skipped ${formatPath(absolutePath)} because it is no longer a file.`
      );
      continue;
    }

    fs.rmSync(absolutePath, { force: true });
    removed += 1;
  }

  return removed;
}

function removeTrackedDirectories(claudeBase, relativePaths, warnings) {
  let removed = 0;

  for (const relativePath of sortPathsDeepFirst(relativePaths)) {
    const absolutePath = resolveManifestPath(claudeBase, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      continue;
    }

    if (!stat.isDirectory()) {
      warnings.push(
        `Skipped ${formatPath(absolutePath)} because it is no longer a directory.`
      );
      continue;
    }

    try {
      fs.rmdirSync(absolutePath);
      removed += 1;
    } catch (error) {
      if (error.code !== 'ENOTEMPTY') {
        warnings.push(`Could not remove ${formatPath(absolutePath)}: ${error.message}`);
      }
    }
  }

  return removed;
}

function ensureNoConflicts(assets, ownedRelativePaths) {
  const conflicts = [];

  for (const asset of assets) {
    if (!fs.existsSync(asset.targetPath)) {
      continue;
    }

    if (ownedRelativePaths.has(asset.targetRelativePath)) {
      continue;
    }

    const targetStat = fs.lstatSync(asset.targetPath);
    if (!targetStat.isFile()) {
      conflicts.push(asset.targetRelativePath);
      continue;
    }

    if (compareFileContents(asset.sourcePath, asset.targetPath)) {
      continue;
    }

    conflicts.push(asset.targetRelativePath);
  }

  if (conflicts.length === 0) {
    return;
  }

  const rendered = conflicts.map((relativePath) => {
    const asset = assets.find((candidate) => {
      return candidate.targetRelativePath === relativePath;
    });
    return `  - ${formatPath(asset ? asset.targetPath : relativePath)}`;
  }).join('\n');

  throw new Error(
    'Refusing to overwrite files that are not proven to be owned by GSD-CC:\n' +
    `${rendered}\n` +
    'Remove the conflicting files manually or uninstall the existing tool first.'
  );
}

function createManifest(isGlobal, assets, migratedLegacyPaths, managedHookSpecs, probe) {
  return {
    source: MANAGED_BY,
    manifestVersion: MANIFEST_VERSION,
    installMode: isGlobal ? 'global' : 'local',
    installedVersion: pkg.version,
    installedAt: new Date().toISOString(),
    files: assets.map((asset) => asset.targetRelativePath),
    directories: collectManagedDirectories(
      assets.map((asset) => asset.targetRelativePath)
    ),
    managedHooks: managedHookSpecs.map((spec) => ({
      event: spec.event,
      matcher: spec.matcher,
      commands: spec.commands
    })),
    managedConfigBlocks: [{
      kind: 'claude-md-language',
      file: getClaudeConfigRelativePath(isGlobal),
      startMarker: CLAUDE_CONFIG_BLOCK_START,
      endMarker: CLAUDE_CONFIG_BLOCK_END
    }],
    dependencies: Object.fromEntries(
      Object.entries(probe.dependencies).map(([name, dependency]) => {
        return [name, {
          available: dependency.available,
          path: dependency.path
        }];
      })
    ),
    readiness: probe.readiness,
    migratedLegacyPaths: [...new Set(migratedLegacyPaths)].sort()
  };
}

function copyAsset(asset) {
  ensureDirectory(path.dirname(asset.targetPath));
  fs.copyFileSync(asset.sourcePath, asset.targetPath);
  const sourceMode = fs.statSync(asset.sourcePath).mode & 0o777;
  fs.chmodSync(asset.targetPath, sourceMode);
}

function cleanupTrackedConfigBlocks(claudeBase, manifest, warnings) {
  let clean = true;

  for (const block of manifest.managedConfigBlocks) {
    const filePath = resolveManifestPath(claudeBase, block.file);
    try {
      removeLanguageConfigBlock(filePath);
    } catch (error) {
      clean = false;
      warnings.push(`Could not update ${formatPath(filePath)}: ${error.message}`);
    }
  }

  return clean;
}

function uninstallFromManifest(claudeBase, manifest, isGlobal) {
  const warnings = [];
  let hooksClean = true;
  const settingsPath = getSettingsPath(isGlobal);
  const settings = loadJsonFileForCleanup(settingsPath, 'Claude settings', warnings);

  if (settings) {
    try {
      const changed = removeHookEntries(
        settings,
        manifestHookSpecsToRuntime(claudeBase, manifest.managedHooks)
      );
      if (changed) {
        writeJsonAtomic(settingsPath, settings);
      }
    } catch (error) {
      hooksClean = false;
      warnings.push(error.message);
    }
  }

  const configClean = cleanupTrackedConfigBlocks(claudeBase, manifest, warnings);
  const removedFiles = removeTrackedFiles(claudeBase, manifest.files, warnings);
  const removedDirectories = removeTrackedDirectories(claudeBase, manifest.directories, warnings);

  let manifestRemoved = false;
  if (hooksClean && configClean) {
    try {
      fs.rmSync(getManifestPath(claudeBase), { force: true });
      removeTrackedDirectories(claudeBase, [MANIFEST_DIR], warnings);
      manifestRemoved = true;
    } catch (error) {
      warnings.push(`Could not remove install manifest: ${error.message}`);
    }
  }

  return {
    removedFiles,
    removedDirectories,
    hooksClean,
    configClean,
    manifestRemoved,
    warnings
  };
}

function uninstallLegacy(claudeBase, isGlobal, assets) {
  const warnings = [];
  const legacy = collectLegacyPaths(claudeBase, assets);
  const settingsPath = getSettingsPath(isGlobal);
  let removedSomething = false;

  const settings = loadJsonFileForCleanup(settingsPath, 'Claude settings', warnings);
  if (settings) {
    const hookSpecs = [
      ...buildHookSpecs(claudeBase, CURRENT_HOOK_DIR),
      ...buildHookSpecs(claudeBase, LEGACY_HOOK_DIR)
    ];

    try {
      const changed = removeHookEntries(settings, hookSpecs);
      if (changed) {
        writeJsonAtomic(settingsPath, settings);
        removedSomething = true;
      }
    } catch (error) {
      warnings.push(error.message);
    }
  }

  if (removeLanguageConfigBlock(getClaudeMdPath(isGlobal))) {
    removedSomething = true;
  }

  if (legacy.detected) {
    if (removeTrackedFiles(claudeBase, legacy.files, warnings) > 0) {
      removedSomething = true;
    }
    if (removeTrackedDirectories(claudeBase, legacy.directories, warnings) > 0) {
      removedSomething = true;
    }
    removeTrackedDirectories(
      claudeBase,
      collectManagedDirectories(legacy.files.concat(legacy.directories)),
      warnings
    );
  }

  return {
    removedSomething,
    warnings: legacy.warnings.concat(warnings),
    legacyDetected: legacy.detected
  };
}

function install(isGlobal) {
  const srcBase = path.join(__dirname, '..');
  const claudeBase = getClaudeBase(isGlobal);
  const label = formatPath(claudeBase);
  const settingsPath = getSettingsPath(isGlobal);
  const assets = collectAssets(srcBase, claudeBase);
  const currentManifest = loadManifest(claudeBase);
  const legacyPaths = collectLegacyPaths(claudeBase, assets);
  const dependencyProbe = probeDependencies();
  const managedHookSpecs = dependencyProbe.readiness.hooks.ready
    ? buildHookSpecs(claudeBase, CURRENT_HOOK_DIR)
    : [];

  console.log(`  Installing to ${cyan}${label}${reset}\n`);

  // Validate settings before touching managed assets so broken JSON is never clobbered.
  const settings = loadJsonFile(settingsPath, 'Claude settings') || {};
  validateSettingsStructure(settings, settingsPath);

  const ownedRelativePaths = new Set();
  if (currentManifest) {
    for (const relativePath of currentManifest.files) {
      ownedRelativePaths.add(relativePath);
    }
  }
  if (legacyPaths.detected) {
    for (const relativePath of legacyPaths.files) {
      ownedRelativePaths.add(relativePath);
    }
  }

  ensureNoConflicts(assets, ownedRelativePaths);

  const desiredFiles = new Set(assets.map((asset) => asset.targetRelativePath));
  const desiredDirectories = collectManagedDirectories([...desiredFiles]);
  const migratedLegacyPaths = [...legacyPaths.files, ...legacyPaths.directories];

  if (currentManifest) {
    const staleFiles = currentManifest.files.filter((relativePath) => {
      return !desiredFiles.has(relativePath);
    });
    removeTrackedFiles(claudeBase, staleFiles, []);
    removeTrackedDirectories(
      claudeBase,
      currentManifest.directories.filter((relativePath) => {
        return !desiredDirectories.includes(relativePath);
      }),
      []
    );
    removeHookEntries(
      settings,
      manifestHookSpecsToRuntime(claudeBase, currentManifest.managedHooks)
    );
  }

  if (legacyPaths.detected) {
    const removableLegacyFiles = legacyPaths.files.filter((relativePath) => {
      return !desiredFiles.has(relativePath);
    });
    removeTrackedFiles(claudeBase, removableLegacyFiles, []);
    removeTrackedDirectories(claudeBase, legacyPaths.directories, []);
    removeHookEntries(settings, buildHookSpecs(claudeBase, LEGACY_HOOK_DIR));

    console.log(
      `  ${dim}Migrated legacy install markers: ` +
      `${legacyPaths.reasons.join(', ')}${reset}`
    );
  }

  for (const asset of assets) {
    copyAsset(asset);
  }

  addHookEntries(settings, managedHookSpecs);
  writeJsonAtomic(settingsPath, settings);

  const manifest = createManifest(
    isGlobal,
    assets,
    migratedLegacyPaths,
    managedHookSpecs,
    dependencyProbe
  );
  writeJsonAtomic(getManifestPath(claudeBase), manifest);

  if (managedHookSpecs.length > 0) {
    console.log(
      `  ${green}✓${reset} Hooks configured in ` +
      `${formatPath(settingsPath)}`
    );
  } else {
    console.log(
      `  ${yellow}!${reset} Hooks were left disabled in ` +
      `${formatPath(settingsPath)} because jq was not found`
    );
  }

  if (legacyPaths.warnings.length > 0) {
    for (const warning of legacyPaths.warnings) {
      console.log(`  ${yellow}!${reset} ${warning}`);
    }
  }

  console.log(`  ${green}✓${reset} Installed ${assets.length} managed files to ${label}`);
  printReadinessSummary(dependencyProbe, isGlobal);
}

function uninstall() {
  const targets = [];

  if (hasGlobal && !hasLocal) {
    targets.push(true);
  } else if (hasLocal && !hasGlobal) {
    targets.push(false);
  } else {
    targets.push(true, false);
  }

  let removed = false;
  let warned = false;

  for (const isGlobal of targets) {
    const claudeBase = getClaudeBase(isGlobal);
    const label = formatPath(claudeBase);
    const assets = collectAssets(path.join(__dirname, '..'), claudeBase);
    let manifest = null;

    try {
      manifest = loadManifest(claudeBase);
    } catch (error) {
      console.log(`  ${yellow}!${reset} ${error.message}`);
      warned = true;
    }

    if (manifest) {
      const result = uninstallFromManifest(claudeBase, manifest, isGlobal);
      if (result.removedFiles > 0 || result.manifestRemoved || result.removedDirectories > 0) {
        console.log(`  ${green}✓${reset} Removed GSD-CC from ${label}`);
        removed = true;
      }
      for (const warning of result.warnings) {
        console.log(`  ${yellow}!${reset} ${warning}`);
        warned = true;
      }
      continue;
    }

    const legacyResult = uninstallLegacy(claudeBase, isGlobal, assets);
    if (legacyResult.removedSomething) {
      console.log(`  ${green}✓${reset} Removed legacy GSD-CC assets from ${label}`);
      console.log(
        `  ${yellow}!${reset} No install manifest was found, so cleanup was conservative.`
      );
      removed = true;
      warned = true;
    }
    for (const warning of legacyResult.warnings) {
      console.log(`  ${yellow}!${reset} ${warning}`);
      warned = true;
    }
  }

  if (!removed) {
    console.log(`  ${yellow}No GSD-CC installation found.${reset}`);
    return;
  }

  console.log(`\n  ${green}Done.${reset} GSD-CC has been removed.`);
  if (warned) {
    console.log(
      `  ${dim}Some paths were kept intentionally where ownership could not be proven.${reset}`
    );
  }
}

function promptLanguage(isGlobal) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`
  ${yellow}Which language should GSD-CC use?${reset}
  ${dim}(e.g. English, Deutsch, Français, Español, ...)${reset}
  ${dim}You can change this anytime with /gsd-cc-config in Claude Code${reset}
`);

  rl.question(`  Language ${dim}[English]${reset}: `, (answer) => {
    rl.close();

    try {
      const language = answer.trim() || 'English';
      writeLanguageConfig(isGlobal, language);
      console.log(`  ${green}✓${reset} Language set to ${cyan}${language}${reset}
`);
      console.log(`  ${green}Done.${reset} Open Claude Code and type ${cyan}/gsd-cc${reset} to start.
`);
    } catch (error) {
      fail(error);
    }
  });
}

function promptLocation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const globalPath = getClaudeBase(true).replace(os.homedir(), '~');

  console.log(`  ${yellow}Where would you like to install?${reset}

  ${cyan}1${reset}) Global ${dim}(${globalPath})${reset} — available in all projects
  ${cyan}2${reset}) Local  ${dim}(./.claude/)${reset} — this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    rl.close();
    console.log();

    try {
      const isGlobal = (answer.trim() || '1') !== '2';
      install(isGlobal);
      promptLanguage(isGlobal);
    } catch (error) {
      fail(error);
    }
  });
}

function fail(error) {
  const message = error && error.message ? error.message : String(error);
  console.error(`  ${red}Error:${reset} ${message}`);
  process.exit(1);
}

// Main
try {
  if (hasUninstall) {
    uninstall();
  } else if (hasGlobal && hasLocal) {
    console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
    process.exit(1);
  } else if (hasGlobal) {
    install(true);
    promptLanguage(true);
  } else if (hasLocal) {
    install(false);
    promptLanguage(false);
  } else {
    promptLocation();
  }
} catch (error) {
  fail(error);
}
