
const os = require('os');
const path = require('path');
const {
  MANIFEST_DIR,
  MANIFEST_FILENAME
} = require('./constants');

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

module.exports = {
  getClaudeBase,
  getSettingsPath,
  getClaudeMdPath,
  getClaudeConfigRelativePath,
  getManifestPath,
  formatPath
};
