
const fs = require('fs');
const path = require('path');
const {
  COLORS,
  CURRENT_HOOK_DIR,
  LEGACY_HOOK_DIR,
  MANIFEST_DIR
} = require('./constants');
const {
  getClaudeBase,
  getClaudeMdPath,
  getManifestPath,
  getSettingsPath,
  formatPath
} = require('./paths');
const {
  collectManagedDirectories,
  loadJsonFile,
  loadJsonFileForCleanup,
  validateSettingsStructure,
  writeJsonAtomic
} = require('./fs-utils');
const {
  readLanguageConfig,
  removeLanguageConfigBlock,
  writeLanguageConfig
} = require('./language-config');
const {
  probeDependencies,
  printReadinessSummary
} = require('./dependencies');
const {
  addHookEntries,
  buildHookSpecs,
  removeHookEntries
} = require('./hooks');
const {
  collectAssets,
  collectLegacyPaths,
  copyAsset,
  ensureNoConflicts
} = require('./assets');
const {
  createManifest,
  loadManifest,
  manifestHookSpecsToRuntime,
  removeTrackedDirectories,
  removeTrackedFiles,
  resolveManagedConfigPath
} = require('./manifest');

const { cyan, green, yellow, dim, reset } = COLORS;

function cleanupTrackedConfigBlocks(claudeBase, manifest, isGlobal, warnings) {
  let clean = true;

  for (const block of manifest.managedConfigBlocks) {
    const filePath = resolveManagedConfigPath(claudeBase, block.file, isGlobal);
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

  const configClean = cleanupTrackedConfigBlocks(claudeBase, manifest, isGlobal, warnings);
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
  const srcBase = path.join(__dirname, '..', '..');
  const claudeBase = getClaudeBase(isGlobal);
  const label = formatPath(claudeBase);
  const settingsPath = getSettingsPath(isGlobal);
  const assets = collectAssets(srcBase, claudeBase);
  const currentManifest = loadManifest(claudeBase, isGlobal);
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

function uninstall(options) {
  const hasGlobal = options.global;
  const hasLocal = options.local;
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
  let blocked = false;

  for (const isGlobal of targets) {
    const claudeBase = getClaudeBase(isGlobal);
    const label = formatPath(claudeBase);
    const assets = collectAssets(path.join(__dirname, '..', '..'), claudeBase);
    let manifest = null;

    try {
      manifest = loadManifest(claudeBase, isGlobal);
    } catch (error) {
      console.log(`  ${yellow}!${reset} ${error.message}`);
      console.log(
        `  ${yellow}!${reset} Manifest cleanup blocked for ${label}; ` +
        'GSD-CC left this install untouched.'
      );
      warned = true;
      blocked = true;
      continue;
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
    if (blocked) {
      console.log(
        `  ${yellow}No files removed. Inspect the invalid or unsafe manifest before retrying.${reset}`
      );
      return;
    }
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

function printLanguageSet(language) {
  console.log(`  ${green}✓${reset} Language set to ${language}`);
}

function printLanguagePreserved(language) {
  console.log(`  ${green}✓${reset} Language preserved: ${language}`);
}

function printInstallDone() {
  console.log(`\n  ${green}Done.${reset} Open Claude Code and type ${cyan}/gsd-cc${reset} to start.\n`);
}

function configureLanguage(isGlobal, installOptions, onDone, promptLanguage) {
  const existingLanguage = readLanguageConfig(isGlobal);

  if (installOptions.language) {
    writeLanguageConfig(isGlobal, installOptions.language);
    printLanguageSet(installOptions.language);
    onDone();
    return;
  }

  if (existingLanguage) {
    printLanguagePreserved(existingLanguage);
    onDone();
    return;
  }

  if (!installOptions.interactive || installOptions.yes) {
    writeLanguageConfig(isGlobal, 'English');
    printLanguageSet('English');
    onDone();
    return;
  }

  promptLanguage(isGlobal, onDone);
}

function installAndConfigure(isGlobal, installOptions, promptLanguage) {
  install(isGlobal);
  configureLanguage(isGlobal, installOptions, printInstallDone, promptLanguage);
}

function printDefaultGlobalChoice() {
  console.log(`  ${dim}No install scope selected; defaulting to global install.${reset}\n`);
}

module.exports = {
  configureLanguage,
  install,
  installAndConfigure,
  printDefaultGlobalChoice,
  printLanguageSet,
  uninstall
};
