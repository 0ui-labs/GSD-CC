const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const DEFAULT_DEBOUNCE_MS = 100;
const DEFAULT_POLL_INTERVAL_MS = 500;

function normalizeProjectRoot(projectRoot) {
  return path.resolve(projectRoot || process.cwd());
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function toGsdDisplayPath(relativePath) {
  if (!relativePath || relativePath === '.') {
    return '.gsd';
  }

  return `.gsd/${toPosixPath(relativePath)}`;
}

function isMissingFileError(error) {
  return Boolean(
    error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

function readDirectoryEntries(directoryPath) {
  try {
    return fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

function statEntry(entryPath) {
  try {
    return fs.lstatSync(entryPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function readFileHash(filePath) {
  try {
    return crypto
      .createHash('sha256')
      .update(fs.readFileSync(filePath))
      .digest('hex');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function createEntrySignature(entryPath, stats, previousSignature) {
  const metadata = [
    stats.isDirectory() ? 'dir' : 'file',
    stats.size,
    stats.mtimeMs
  ].join(':');

  if (previousSignature && previousSignature.startsWith(`${metadata}:`)) {
    return previousSignature;
  }

  if (stats.isFile()) {
    const hash = readFileHash(entryPath);

    if (hash) {
      return `${metadata}:${hash}`;
    }
  }

  return metadata;
}

function collectEntries(directoryPath, relativeRoot, entries, previousEntries) {
  const directoryEntries = readDirectoryEntries(directoryPath)
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of directoryEntries) {
    const entryPath = path.join(directoryPath, entry.name);
    const relativePath = relativeRoot
      ? path.posix.join(relativeRoot, entry.name)
      : entry.name;
    const stats = statEntry(entryPath);

    if (!stats) {
      continue;
    }

    if (stats.isDirectory()) {
      entries.set(
        toPosixPath(relativePath),
        createEntrySignature(
          entryPath,
          stats,
          previousEntries && previousEntries.get(toPosixPath(relativePath))
        )
      );
      collectEntries(entryPath, relativePath, entries, previousEntries);
      continue;
    }

    if (stats.isFile() || stats.isSymbolicLink()) {
      entries.set(
        toPosixPath(relativePath),
        createEntrySignature(
          entryPath,
          stats,
          previousEntries && previousEntries.get(toPosixPath(relativePath))
        )
      );
    }
  }
}

function snapshotGsdDirectory(projectRoot, previousSnapshot = null) {
  const root = normalizeProjectRoot(projectRoot);
  const gsdDir = path.join(root, '.gsd');
  const entries = new Map();
  const previousEntries = previousSnapshot ? previousSnapshot.entries : null;
  const stats = statEntry(gsdDir);

  if (!stats || !stats.isDirectory()) {
    return {
      projectRoot: root,
      gsdDir,
      hasGsd: false,
      entries
    };
  }

  entries.set('.', createEntrySignature(gsdDir, stats, previousEntries && previousEntries.get('.')));
  collectEntries(gsdDir, '', entries, previousEntries);

  return {
    projectRoot: root,
    gsdDir,
    hasGsd: true,
    entries
  };
}

function diffGsdSnapshots(previous, next) {
  const changedPaths = new Set();

  if (previous.hasGsd !== next.hasGsd) {
    changedPaths.add('.gsd');
  }

  const keys = new Set([
    ...previous.entries.keys(),
    ...next.entries.keys()
  ]);

  for (const key of keys) {
    if (previous.entries.get(key) !== next.entries.get(key)) {
      changedPaths.add(toGsdDisplayPath(key));
    }
  }

  return {
    changed: changedPaths.size > 0,
    paths: Array.from(changedPaths).sort((left, right) => {
      return left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    })
  };
}

function normalizeWatcherPath(fileName) {
  if (!fileName) {
    return '.gsd';
  }

  return toGsdDisplayPath(toPosixPath(fileName));
}

function normalizePositiveInteger(value, fallback, label) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return normalized;
}

function watchDashboardFiles(projectRoot, onChange, options = {}) {
  if (typeof onChange !== 'function') {
    throw new Error('Dashboard watcher requires an onChange callback.');
  }

  const root = normalizeProjectRoot(projectRoot);
  const debounceMs = normalizePositiveInteger(
    options.debounceMs,
    DEFAULT_DEBOUNCE_MS,
    'Dashboard watcher debounce'
  );
  const pollIntervalMs = normalizePositiveInteger(
    options.pollIntervalMs,
    DEFAULT_POLL_INTERVAL_MS,
    'Dashboard watcher poll interval'
  );
  const forcePolling = Boolean(options.forcePolling);

  let closed = false;
  let nativeWatcher = null;
  let debounceTimer = null;
  let pollTimer = null;
  let currentSnapshot = snapshotGsdDirectory(root);
  let pendingReasons = new Set();
  let pendingPaths = new Set();
  let nativeAvailable = false;

  function closeNativeWatcher() {
    if (!nativeWatcher) {
      return;
    }

    const watcher = nativeWatcher;
    nativeWatcher = null;

    try {
      watcher.close();
    } catch (_error) {
      // Best-effort cleanup only; the dashboard can continue via polling.
    }
  }

  function startNativeWatcher() {
    if (closed || forcePolling || nativeWatcher || !currentSnapshot.hasGsd) {
      return;
    }

    try {
      nativeWatcher = fs.watch(
        currentSnapshot.gsdDir,
        { recursive: true },
        (eventType, fileName) => {
          detectChanges(`fs.watch:${eventType}`, normalizeWatcherPath(fileName));
        }
      );
      nativeAvailable = true;
      nativeWatcher.on('error', () => {
        closeNativeWatcher();
        detectChanges('fs.watch:error', '.gsd');
      });
    } catch (_error) {
      closeNativeWatcher();
    }
  }

  function syncNativeWatcher() {
    if (!currentSnapshot.hasGsd) {
      closeNativeWatcher();
      return;
    }

    startNativeWatcher();
  }

  function flushChange() {
    if (closed) {
      return;
    }

    debounceTimer = null;

    const event = {
      projectRoot: root,
      gsdDir: currentSnapshot.gsdDir,
      hasGsd: currentSnapshot.hasGsd,
      paths: Array.from(pendingPaths).sort((left, right) => {
        return left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
      }),
      reasons: Array.from(pendingReasons).sort(),
      timestamp: new Date().toISOString()
    };

    pendingPaths = new Set();
    pendingReasons = new Set();
    onChange(event);
  }

  function scheduleChange(reason, paths) {
    pendingReasons.add(reason);

    for (const changedPath of paths) {
      pendingPaths.add(changedPath);
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(flushChange, debounceMs);
  }

  function detectChanges(reason, hintedPath) {
    if (closed) {
      return;
    }

    const nextSnapshot = snapshotGsdDirectory(root, currentSnapshot);
    const diff = diffGsdSnapshots(currentSnapshot, nextSnapshot);

    currentSnapshot = nextSnapshot;
    syncNativeWatcher();

    if (!diff.changed) {
      return;
    }

    const paths = hintedPath
      ? Array.from(new Set([...diff.paths, hintedPath]))
      : diff.paths;

    scheduleChange(reason, paths);
  }

  startNativeWatcher();

  pollTimer = setInterval(() => {
    detectChanges('poll', null);
  }, pollIntervalMs);

  if (pollTimer.unref) {
    pollTimer.unref();
  }

  return {
    close() {
      closed = true;
      closeNativeWatcher();

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
    getMode() {
      if (forcePolling) {
        return 'polling';
      }

      return nativeAvailable ? 'native+polling' : 'polling';
    },
    getSnapshot() {
      return currentSnapshot;
    }
  };
}

module.exports = {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_POLL_INTERVAL_MS,
  diffGsdSnapshots,
  snapshotGsdDirectory,
  watchDashboardFiles
};
