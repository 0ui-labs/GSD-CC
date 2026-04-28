
const fs = require('fs');
const path = require('path');
const {
  INSTALL_LAYOUT,
  CURRENT_HOOK_DIR,
  LEGACY_HOOK_DIR
} = require('./constants');
const {
  compareFileContents,
  ensureDirectory,
  sortPathsDeepFirst
} = require('./fs-utils');
const { formatPath } = require('./paths');
const { buildHookSpecs } = require('./hooks');

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

function getInstallMode(asset) {
  const hookDirPrefix = `${CURRENT_HOOK_DIR}${path.sep}`;
  if (
    asset.targetRelativePath.startsWith(hookDirPrefix) &&
    asset.targetRelativePath.endsWith('.sh')
  ) {
    return 0o755;
  }

  return fs.statSync(asset.sourcePath).mode & 0o777;
}

function copyAsset(asset) {
  ensureDirectory(path.dirname(asset.targetPath));
  fs.copyFileSync(asset.sourcePath, asset.targetPath);
  fs.chmodSync(asset.targetPath, getInstallMode(asset));
}

module.exports = {
  collectAssets,
  collectLegacyPaths,
  detectLegacyInstallation,
  ensureNoConflicts,
  copyAsset
};
