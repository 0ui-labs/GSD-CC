
const path = require('path');

const COLORS = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  reset: '\x1b[0m'
};

const MANAGED_BY = 'gsd-cc';
const MANIFEST_VERSION = 1;
const MANIFEST_DIR = 'gsd-cc';
const MANIFEST_FILENAME = 'install-manifest.json';
const CURRENT_HOOK_DIR = path.join('hooks', 'gsd-cc');
const LEGACY_HOOK_DIR = 'hooks';
const CLAUDE_CONFIG_BLOCK_START = '<!-- gsd-cc:config:start -->';
const CLAUDE_CONFIG_BLOCK_END = '<!-- gsd-cc:config:end -->';
const LEGACY_CLAUDE_CONFIG_REGEX = /\n?# GSD-CC Config\nGSD-CC language: .+\n(?:GSD-CC commit language: .+\n?)?/;
const LEGACY_LANGUAGE_CONFIG_REGEX = /(?:^|\n)# GSD-CC Config\nGSD-CC language:\s*([^\n]+)(?:\n|$)/;
const LANGUAGE_LINE_REGEX = /^GSD-CC language:\s*(.+?)\s*$/m;
const COMMIT_LANGUAGE_LINE_REGEX = /^GSD-CC commit language:\s*(.+?)\s*$/m;
const DEFAULT_COMMIT_LANGUAGE = 'English';

const INSTALL_LAYOUT = [
  { sourceDir: 'skills', targetDir: 'skills' },
  { sourceDir: 'hooks', targetDir: CURRENT_HOOK_DIR },
  { sourceDir: 'checklists', targetDir: 'checklists' },
  { sourceDir: 'templates', targetDir: 'templates' },
];

const HOOK_SPECS = [
  {
    event: 'PreToolUse',
    matcher: 'Edit|Write|MultiEdit',
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

module.exports = {
  COLORS,
  MANAGED_BY,
  MANIFEST_VERSION,
  MANIFEST_DIR,
  MANIFEST_FILENAME,
  CURRENT_HOOK_DIR,
  LEGACY_HOOK_DIR,
  CLAUDE_CONFIG_BLOCK_START,
  CLAUDE_CONFIG_BLOCK_END,
  LEGACY_CLAUDE_CONFIG_REGEX,
  LEGACY_LANGUAGE_CONFIG_REGEX,
  LANGUAGE_LINE_REGEX,
  COMMIT_LANGUAGE_LINE_REGEX,
  DEFAULT_COMMIT_LANGUAGE,
  INSTALL_LAYOUT,
  HOOK_SPECS
};
