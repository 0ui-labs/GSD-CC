#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

const pkg = require('../package.json');

const banner = `
${cyan}   ██████╗ ███████╗██████╗        ██████╗ ██████╗
  ██╔════╝ ██╔════╝██╔══██╗      ██╔════╝██╔════╝
  ██║  ███╗███████╗██║  ██║█████╗██║     ██║
  ██║   ██║╚════██║██║  ██║╚════╝██║     ██║
  ╚██████╔╝███████║██████╔╝      ╚██████╗╚██████╗
   ╚═════╝ ╚══════╝╚═════╝        ╚═════╝ ╚═════╝${reset}

  Get Shit Done on Claude Code ${dim}v${pkg.version}${reset}
`;

// Directories inside gsd-cc/ that map 1:1 into .claude/
const CLAUDE_DIRS = ['skills', 'hooks', 'checklists', 'commands', 'templates'];

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasUninstall = args.includes('--uninstall');
const hasHelp = args.includes('--help') || args.includes('-h');

console.log(banner);

if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx gsd-cc [options]

  ${yellow}Options:${reset}
    ${cyan}-g, --global${reset}      Install globally to ~/.claude/skills/ ${dim}(default)${reset}
    ${cyan}-l, --local${reset}       Install locally to ./.claude/skills/
    ${cyan}--uninstall${reset}       Remove GSD-CC skills
    ${cyan}-h, --help${reset}        Show this help message

  ${yellow}Examples:${reset}
    ${dim}# Install globally (default)${reset}
    npx gsd-cc

    ${dim}# Install to current project only${reset}
    npx gsd-cc --local

    ${dim}# Remove GSD-CC${reset}
    npx gsd-cc --uninstall
`);
  process.exit(0);
}

/**
 * Recursively copy a directory
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Remove a directory recursively
 */
function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Resolve .claude base directory
 */
function getClaudeBase(isGlobal) {
  if (isGlobal) {
    return path.join(os.homedir(), '.claude');
  }
  return path.join(process.cwd(), '.claude');
}

/**
 * Install everything into .claude/
 * Source structure mirrors target structure 1:1.
 */
function install(isGlobal) {
  const srcBase = path.join(__dirname, '..');
  const claudeBase = isGlobal
    ? path.join(os.homedir(), '.claude')
    : path.join(process.cwd(), '.claude');
  const label = isGlobal
    ? claudeBase.replace(os.homedir(), '~')
    : claudeBase.replace(process.cwd(), '.');

  console.log(`  Installing to ${cyan}${label}${reset}\n`);

  let fileCount = 0;

  // Copy each directory 1:1 into .claude/
  for (const dir of CLAUDE_DIRS) {
    const srcDir = path.join(srcBase, dir);
    if (fs.existsSync(srcDir)) {
      copyDir(srcDir, path.join(claudeBase, dir));
      fileCount += countFiles(path.join(claudeBase, dir));
    }
  }

  // Make shell scripts executable
  const makeExecutable = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        makeExecutable(fullPath);
      } else if (entry.name.endsWith('.sh')) {
        fs.chmodSync(fullPath, 0o755);
      }
    }
  };
  makeExecutable(claudeBase);

  // Configure hooks in settings.json
  const hooksDir = path.join(claudeBase, 'hooks');
  if (fs.existsSync(hooksDir)) {
    installHooks(isGlobal, hooksDir);
  }

  console.log(`  ${green}✓${reset} Installed ${fileCount} files to ${label}`);
}

/**
 * Install hooks into .claude/settings.json or .claude/settings.local.json
 */
function installHooks(isGlobal, hooksDir) {
  const settingsPath = isGlobal
    ? path.join(os.homedir(), '.claude', 'settings.json')
    : path.join(process.cwd(), '.claude', 'settings.local.json');

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (e) {
      settings = {};
    }
  }

  if (!settings.hooks) settings.hooks = {};

  const boundaryGuard = path.join(hooksDir, 'gsd-boundary-guard.sh');
  const promptGuard = path.join(hooksDir, 'gsd-prompt-guard.sh');
  const contextMonitor = path.join(hooksDir, 'gsd-context-monitor.sh');
  const workflowGuard = path.join(hooksDir, 'gsd-workflow-guard.sh');
  const statusline = path.join(hooksDir, 'gsd-statusline.sh');

  // Remove all existing GSD-CC hooks before adding (idempotent)
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event].filter(
      h => !JSON.stringify(h).includes('gsd-')
    );
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }

  // PreToolUse: boundary guard + prompt injection guard on Edit/Write
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    matcher: 'Edit|Write',
    hooks: [
      { type: 'command', command: boundaryGuard, timeout: 5000 },
      { type: 'command', command: promptGuard, timeout: 5000 }
    ]
  });

  // PostToolUse: context monitor + statusline (all tools) + workflow guard (Edit/Write)
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse.push({
    hooks: [
      { type: 'command', command: contextMonitor, timeout: 5000 },
      { type: 'command', command: statusline, timeout: 3000 }
    ]
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: workflowGuard, timeout: 5000 }]
  });

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  ${green}✓${reset} Hooks configured in ${settingsPath.replace(os.homedir(), '~').replace(process.cwd(), '.')}`);
}

/**
 * Write language to CLAUDE.md
 */
function writeLanguageConfig(isGlobal, language) {
  const claudeMdPath = isGlobal
    ? path.join(os.homedir(), '.claude', 'CLAUDE.md')
    : path.join(process.cwd(), 'CLAUDE.md');

  const gsdBlock = `\n# GSD-CC Config\nGSD-CC language: ${language}\n`;

  if (fs.existsSync(claudeMdPath)) {
    let content = fs.readFileSync(claudeMdPath, 'utf-8');
    // Replace existing GSD-CC config block if present
    const gsdRegex = /\n?# GSD-CC Config\nGSD-CC language: .+\n/;
    if (gsdRegex.test(content)) {
      content = content.replace(gsdRegex, gsdBlock);
    } else {
      content += gsdBlock;
    }
    fs.writeFileSync(claudeMdPath, content);
  } else {
    fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
    fs.writeFileSync(claudeMdPath, gsdBlock.trimStart());
  }
}

/**
 * Prompt for language, then finish
 */
function promptLanguage(isGlobal) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`
  ${yellow}Which language should GSD-CC use?${reset}
  ${dim}(e.g. English, Deutsch, Français, Español, ...)${reset}
  ${dim}You can change this anytime with /gsd-cc-config in Claude Code${reset}
`);

  rl.question(`  Language ${dim}[English]${reset}: `, (answer) => {
    rl.close();
    const language = answer.trim() || 'English';
    writeLanguageConfig(isGlobal, language);
    console.log(`  ${green}✓${reset} Language set to ${cyan}${language}${reset}
`);
    console.log(`  ${green}Done.${reset} Open Claude Code and type ${cyan}/gsd-cc${reset} to start.
`);
  });
}

/**
 * Count files in a directory recursively
 */
function countFiles(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Uninstall GSD-CC
 */
function uninstall() {
  const claudeBases = [
    path.join(os.homedir(), '.claude'),
    path.join(process.cwd(), '.claude')
  ];

  let removed = false;

  for (const claudeBase of claudeBases) {
    const label = claudeBase.includes(os.homedir())
      ? claudeBase.replace(os.homedir(), '~')
      : claudeBase.replace(process.cwd(), '.');

    let removedFromLocation = false;

    // Remove all CLAUDE_DIRS
    for (const dir of [...CLAUDE_DIRS, 'prompts']) { // 'prompts' for legacy cleanup
      const fullPath = path.join(claudeBase, dir);
      if (removeDir(fullPath)) {
        removedFromLocation = true;
      }
    }

    // Also clean up old skill names (legacy: gsd-cc-shared, gsd)
    const skillsDir = path.join(claudeBase, 'skills');
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir);
      for (const entry of entries) {
        if (entry.startsWith('gsd-cc') || entry === 'gsd') {
          if (removeDir(path.join(skillsDir, entry))) {
            removedFromLocation = true;
          }
        }
      }
    }

    if (removedFromLocation) {
      console.log(`  ${green}✓${reset} Removed GSD-CC from ${label}`);
      removed = true;
    }
  }

  // Clean up hooks from settings files
  for (const isGlobal of [true, false]) {
    const settingsPath = isGlobal
      ? path.join(os.homedir(), '.claude', 'settings.json')
      : path.join(process.cwd(), '.claude', 'settings.local.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (settings.hooks) {
          for (const event of Object.keys(settings.hooks)) {
            settings.hooks[event] = settings.hooks[event].filter(
              h => !JSON.stringify(h).includes('gsd-')
            );
            if (settings.hooks[event].length === 0) delete settings.hooks[event];
          }
          if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        }
      } catch (e) { /* ignore parse errors */ }
    }
  }

  if (!removed) {
    console.log(`  ${yellow}No GSD-CC installation found.${reset}`);
  } else {
    console.log(`  ${green}✓${reset} Hooks removed from settings`);
    console.log(`\n  ${green}Done.${reset} GSD-CC has been removed.`);
  }
}

/**
 * Prompt for install location
 */
function promptLocation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const globalPath = getClaudeBase(true).replace(os.homedir(), '~');

  console.log(`  ${yellow}Where would you like to install?${reset}

  ${cyan}1${reset}) Global ${dim}(${globalPath})${reset} — available in all projects
  ${cyan}2${reset}) Local  ${dim}(./.claude/)${reset} — this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    rl.close();
    console.log();
    const isGlobal = (answer.trim() || '1') !== '2';
    install(isGlobal);
    promptLanguage(isGlobal);
  });
}

// Main
if (hasUninstall) {
  uninstall();
} else if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (hasGlobal) {
  install(true);
  promptLanguage(true);
} else if (hasLocal) {
  install(false);
  promptLanguage(false);
} else {
  promptLocation();
}
