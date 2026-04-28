
const fs = require('fs');
const path = require('path');
const { MANIFEST_DIR } = require('./constants');
const { formatPath } = require('./paths');

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

module.exports = {
  ensureDirectory,
  writeFileAtomic,
  writeJsonAtomic,
  loadJsonFile,
  validateSettingsStructure,
  loadJsonFileForCleanup,
  compareFileContents,
  sortPathsDeepFirst,
  collectManagedDirectories
};
