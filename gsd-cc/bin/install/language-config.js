
const fs = require('fs');
const {
  CLAUDE_CONFIG_BLOCK_START,
  CLAUDE_CONFIG_BLOCK_END,
  LEGACY_CLAUDE_CONFIG_REGEX,
  LEGACY_LANGUAGE_CONFIG_REGEX,
  LANGUAGE_LINE_REGEX
} = require('./constants');
const { getClaudeMdPath } = require('./paths');
const { writeFileAtomic } = require('./fs-utils');

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

function extractLanguageFromConfig(content) {
  const markerRegex = new RegExp(
    `${escapeRegExp(CLAUDE_CONFIG_BLOCK_START)}[\\s\\S]*?${escapeRegExp(CLAUDE_CONFIG_BLOCK_END)}`
  );
  const markerMatch = content.match(markerRegex);

  if (markerMatch) {
    const languageMatch = markerMatch[0].match(LANGUAGE_LINE_REGEX);
    return languageMatch ? languageMatch[1].trim() || null : null;
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

module.exports = {
  extractLanguageFromConfig,
  readLanguageConfig,
  removeLanguageConfigBlock,
  writeLanguageConfig
};
