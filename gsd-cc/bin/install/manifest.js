
const fs = require('fs');
const path = require('path');
const pkg = require('../../package.json');
const {
  MANAGED_BY,
  MANIFEST_VERSION,
  MANIFEST_DIR,
  CLAUDE_CONFIG_BLOCK_START,
  CLAUDE_CONFIG_BLOCK_END
} = require('./constants');
const {
  formatPath,
  getClaudeConfigRelativePath,
  getManifestPath
} = require('./paths');
const {
  collectManagedDirectories,
  loadJsonFile,
  sortPathsDeepFirst
} = require('./fs-utils');

function manifestError(manifestPath, message) {
  return new Error(`Install manifest at ${formatPath(manifestPath)} ${message}`);
}

function normalizeManifestPathForComparison(relativePath) {
  return relativePath.replace(/\\/g, '/');
}

function hasParentTraversal(relativePath) {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .includes('..');
}

function isDescendantPath(basePath, targetPath) {
  const relativePath = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return Boolean(relativePath) &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath);
}

function validateManagedRelativePath(claudeBase, relativePath, manifestPath, label) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw manifestError(manifestPath, `contains an invalid ${label}. Expected a non-empty relative path.`);
  }

  if (
    relativePath.includes('\0') ||
    relativePath.startsWith('~') ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    /^[A-Za-z]:/.test(relativePath) ||
    hasParentTraversal(relativePath)
  ) {
    throw manifestError(
      manifestPath,
      `contains an unsafe ${label}: ${JSON.stringify(relativePath)}.`
    );
  }

  const absolutePath = path.resolve(claudeBase, relativePath);
  if (!isDescendantPath(claudeBase, absolutePath)) {
    throw manifestError(
      manifestPath,
      `contains an unsafe ${label}: ${JSON.stringify(relativePath)}.`
    );
  }
}

function validateManagedConfigPath(relativePath, manifestPath, isGlobal) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw manifestError(manifestPath, 'contains an invalid managed config block path.');
  }

  const expectedPath = normalizeManifestPathForComparison(
    getClaudeConfigRelativePath(isGlobal)
  );
  const actualPath = normalizeManifestPathForComparison(relativePath);

  if (actualPath !== expectedPath) {
    throw manifestError(
      manifestPath,
      `contains an unsafe managed config block path: ${JSON.stringify(relativePath)}.`
    );
  }
}

function validateManifest(manifest, manifestPath, claudeBase, isGlobal) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`Install manifest at ${formatPath(manifestPath)} is invalid.`);
  }

  if (manifest.source !== MANAGED_BY) {
    throw new Error(
      `Install manifest at ${formatPath(manifestPath)} is not owned by GSD-CC.`
    );
  }

  const expectedInstallMode = isGlobal ? 'global' : 'local';
  if (manifest.installMode !== expectedInstallMode) {
    throw manifestError(
      manifestPath,
      `has installMode "${manifest.installMode}" but expected "${expectedInstallMode}".`
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

  for (const relativePath of manifest.files) {
    validateManagedRelativePath(claudeBase, relativePath, manifestPath, 'file path');
  }

  for (const relativePath of manifest.directories) {
    validateManagedRelativePath(claudeBase, relativePath, manifestPath, 'directory path');
  }

  for (const [index, hook] of manifest.managedHooks.entries()) {
    if (!hook || typeof hook !== 'object' || Array.isArray(hook)) {
      throw manifestError(manifestPath, `contains an invalid managed hook at index ${index}.`);
    }

    if (typeof hook.event !== 'string' || !hook.event.trim()) {
      throw manifestError(manifestPath, `contains an invalid hook event at index ${index}.`);
    }

    if (
      hook.matcher !== undefined &&
      hook.matcher !== null &&
      typeof hook.matcher !== 'string'
    ) {
      throw manifestError(manifestPath, `contains an invalid hook matcher at index ${index}.`);
    }

    if (!Array.isArray(hook.commands)) {
      throw manifestError(manifestPath, `contains an invalid hook command list at index ${index}.`);
    }

    for (const command of hook.commands) {
      validateManagedRelativePath(claudeBase, command, manifestPath, 'hook command path');
    }
  }

  for (const [index, block] of manifest.managedConfigBlocks.entries()) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      throw manifestError(manifestPath, `contains an invalid config block at index ${index}.`);
    }

    if (
      typeof block.kind !== 'string' ||
      typeof block.startMarker !== 'string' ||
      typeof block.endMarker !== 'string'
    ) {
      throw manifestError(manifestPath, `contains an invalid config block shape at index ${index}.`);
    }

    validateManagedConfigPath(block.file, manifestPath, isGlobal);
  }
}

function loadManifest(claudeBase, isGlobal) {
  const manifestPath = getManifestPath(claudeBase);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const manifest = loadJsonFile(manifestPath, 'Install manifest');
  validateManifest(manifest, manifestPath, claudeBase, isGlobal);
  return manifest;
}

function resolveManagedPath(claudeBase, relativePath) {
  validateManagedRelativePath(claudeBase, relativePath, getManifestPath(claudeBase), 'managed path');
  return path.resolve(claudeBase, relativePath);
}

function resolveManagedConfigPath(claudeBase, relativePath, isGlobal) {
  validateManagedConfigPath(relativePath, getManifestPath(claudeBase), isGlobal);
  return path.resolve(claudeBase, relativePath);
}

function manifestHookSpecsToRuntime(claudeBase, managedHooks) {
  return managedHooks.map((hook) => ({
    event: hook.event,
    matcher: hook.matcher,
    hooks: hook.commands.map((command) => ({
      type: 'command',
      command: resolveManagedPath(claudeBase, command)
    }))
  }));
}

function removeTrackedFiles(claudeBase, relativePaths, warnings) {
  let removed = 0;

  for (const relativePath of relativePaths) {
    const absolutePath = resolveManagedPath(claudeBase, relativePath);
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
    const absolutePath = resolveManagedPath(claudeBase, relativePath);
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

module.exports = {
  createManifest,
  loadManifest,
  manifestHookSpecsToRuntime,
  removeTrackedDirectories,
  removeTrackedFiles,
  resolveManagedConfigPath,
  resolveManagedPath,
  validateManifest
};
