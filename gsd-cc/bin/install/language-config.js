
const fs = require('fs');
const {
  CLAUDE_CONFIG_BLOCK_START,
  CLAUDE_CONFIG_BLOCK_END,
  COMMIT_LANGUAGE_LINE_REGEX,
  DEFAULT_COMMIT_LANGUAGE,
  LEGACY_CLAUDE_CONFIG_REGEX,
  LEGACY_LANGUAGE_CONFIG_REGEX,
  LANGUAGE_LINE_REGEX
} = require('./constants');
const { getClaudeMdPath } = require('./paths');
const { writeFileAtomic } = require('./fs-utils');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractLineValue(content, regex) {
  const match = content.match(regex);
  return match ? match[1].trim() || null : null;
}

function extractMarkedConfigBlock(content) {
  const markerRegex = new RegExp(
    `${escapeRegExp(CLAUDE_CONFIG_BLOCK_START)}[\\s\\S]*?${escapeRegExp(CLAUDE_CONFIG_BLOCK_END)}`
  );
  const markerMatch = content.match(markerRegex);
  return markerMatch ? markerMatch[0] : null;
}

function extractCommitLanguageFromConfig(content) {
  const markerBlock = extractMarkedConfigBlock(content);
  if (markerBlock) {
    return extractLineValue(markerBlock, COMMIT_LANGUAGE_LINE_REGEX);
  }

  return extractLineValue(content, COMMIT_LANGUAGE_LINE_REGEX);
}

function replaceLanguageBlock(content, language, commitLanguage) {
  const resolvedCommitLanguage = commitLanguage ||
    extractCommitLanguageFromConfig(content) ||
    DEFAULT_COMMIT_LANGUAGE;
  const block = [
    CLAUDE_CONFIG_BLOCK_START,
    '# GSD-CC Config',
    `GSD-CC language: ${language}`,
    `GSD-CC commit language: ${resolvedCommitLanguage}`,
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

function extractLanguageFromConfig(content) {
  const markerBlock = extractMarkedConfigBlock(content);

  if (markerBlock) {
    return extractLineValue(markerBlock, LANGUAGE_LINE_REGEX);
  }

  const legacyMatch = content.match(LEGACY_LANGUAGE_CONFIG_REGEX);
  return legacyMatch ? legacyMatch[1].trim() || null : null;
}

function readLanguageConfig(isGlobal) {
  const claudeMdPath = getClaudeMdPath(isGlobal);
  if (!fs.existsSync(claudeMdPath)) {
    return null;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf8');
  return extractLanguageFromConfig(content);
}

function readCommitLanguageConfig(isGlobal) {
  const claudeMdPath = getClaudeMdPath(isGlobal);
  if (!fs.existsSync(claudeMdPath)) {
    return DEFAULT_COMMIT_LANGUAGE;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf8');
  return extractCommitLanguageFromConfig(content) || DEFAULT_COMMIT_LANGUAGE;
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

function writeCommitLanguageConfig(isGlobal, commitLanguage) {
  const claudeMdPath = getClaudeMdPath(isGlobal);
  const existingContent = fs.existsSync(claudeMdPath)
    ? fs.readFileSync(claudeMdPath, 'utf8')
    : '';
  const language = extractLanguageFromConfig(existingContent) || 'English';
  const nextContent = replaceLanguageBlock(
    existingContent,
    language,
    commitLanguage || DEFAULT_COMMIT_LANGUAGE
  );

  if (nextContent !== existingContent) {
    writeFileAtomic(claudeMdPath, nextContent);
  }
}

module.exports = {
  DEFAULT_COMMIT_LANGUAGE,
  extractCommitLanguageFromConfig,
  extractLanguageFromConfig,
  readCommitLanguageConfig,
  readLanguageConfig,
  replaceLanguageBlock,
  removeLanguageConfigBlock,
  writeCommitLanguageConfig,
  writeLanguageConfig
};
