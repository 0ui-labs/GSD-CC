function trimWhitespace(value) {
  return String(value || '').replace(/^\s+|\s+$/g, '');
}

function stripXmlComments(value) {
  return String(value || '').replace(/<!--[\s\S]*?-->/g, '');
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripXmlTags(value) {
  return String(value || '').replace(/<[^>]+>/g, '');
}

function meaningfulText(value) {
  return trimWhitespace(stripXmlTags(stripXmlComments(value))).length > 0;
}

function normalizeDisplayLines(value) {
  return stripXmlComments(value)
    .split(/\r?\n/)
    .map((line) => trimWhitespace(decodeXmlEntities(stripXmlTags(line))))
    .filter(Boolean);
}

function normalizeMultilineText(value) {
  const lines = normalizeDisplayLines(value);
  return lines.length > 0 ? lines.join('\n') : null;
}

function normalizeSingleLineText(value) {
  const lines = normalizeDisplayLines(value);
  return lines.length > 0 ? lines.join(' ') : null;
}

function findTag(content, tag) {
  const openPattern = new RegExp(`<${tag}\\b[^>]*>`, 'i');
  const openMatch = openPattern.exec(content);

  if (!openMatch) {
    return null;
  }

  const closePattern = new RegExp(`</${tag}\\s*>`, 'i');
  const afterOpen = content.slice(openMatch.index + openMatch[0].length);
  const closeMatch = closePattern.exec(afterOpen);

  if (!closeMatch) {
    return {
      openTag: openMatch[0],
      body: '',
      closed: false
    };
  }

  return {
    openTag: openMatch[0],
    body: afterOpen.slice(0, closeMatch.index),
    closed: true
  };
}

function extractAttr(openTag, attr) {
  const pattern = new RegExp(`\\s${attr}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  const match = String(openTag || '').match(pattern);
  return match ? decodeXmlEntities(match[2]) : null;
}

function extractXmlBlock(content, tag) {
  const block = findTag(String(content || ''), tag);
  return block && block.closed ? block.body : '';
}

function extractTagAttr(content, tag, attr) {
  const block = findTag(String(content || ''), tag);
  return block ? extractAttr(block.openTag, attr) || '' : '';
}

function extractTaskAttr(content, attr) {
  return extractTagAttr(content, 'task', attr);
}

function parseRawAcceptanceCriteria(content) {
  const criteria = [];
  const acPattern = /<ac\b([^>]*)>([\s\S]*?)<\/ac>/gi;
  let match;

  while ((match = acPattern.exec(String(content || ''))) !== null) {
    criteria.push({
      id: extractAttr(`<ac${match[1]}>`, 'id') || '',
      body: match[2]
    });
  }

  return criteria;
}

function countOpeningTags(content, tag) {
  return (String(content || '').match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
}

function countClosingTags(content, tag) {
  return (String(content || '').match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
}

module.exports = {
  countClosingTags,
  countOpeningTags,
  decodeXmlEntities,
  extractAttr,
  extractTagAttr,
  extractTaskAttr,
  extractXmlBlock,
  findTag,
  meaningfulText,
  normalizeDisplayLines,
  normalizeMultilineText,
  normalizeSingleLineText,
  parseRawAcceptanceCriteria,
  stripXmlComments,
  stripXmlTags,
  trimWhitespace
};
