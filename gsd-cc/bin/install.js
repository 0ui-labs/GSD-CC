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

// Sub-skills that get their own top-level directory under .claude/skills/
const SUB_SKILLS = ['apply', 'auto', 'config', 'discuss', 'help', 'ideate', 'ingest', 'plan', 'profile', 'seed', 'stack', 'status', 'tutorial', 'unify', 'update', 'vision'];

// Shared directories that go into gsd-cc-shared/
const SHARED_DIRS = ['checklists', 'prompts', 'templates'];

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
 * Resolve skills base directory
 */
function getSkillsBase(isGlobal) {
  if (isGlobal) {
    return path.join(os.homedir(), '.claude', 'skills');
  }
  return path.join(process.cwd(), '.claude', 'skills');
}

/**
 * Install skills to target directory
 */
function install(isGlobal) {
  const skillsSrc = path.join(__dirname, '..', 'skills', 'gsd');
  const skillsBase = getSkillsBase(isGlobal);
  const label = isGlobal
    ? skillsBase.replace(os.homedir(), '~')
    : skillsBase.replace(process.cwd(), '.');

  if (!fs.existsSync(skillsSrc)) {
    console.error(`  ${red}Error:${reset} Skills source not found at ${skillsSrc}`);
    process.exit(1);
  }

  console.log(`  Installing to ${cyan}${label}${reset}\n`);

  let fileCount = 0;

  // 1. Install main router: gsd-cc/SKILL.md
  const routerDest = path.join(skillsBase, 'gsd-cc');
  fs.mkdirSync(routerDest, { recursive: true });
  fs.copyFileSync(path.join(skillsSrc, 'SKILL.md'), path.join(routerDest, 'SKILL.md'));
  fileCount++;

  // 2. Install each sub-skill as its own top-level directory
  for (const skill of SUB_SKILLS) {
    const srcDir = path.join(skillsSrc, skill);
    const destDir = path.join(skillsBase, `gsd-cc-${skill}`);

    if (fs.existsSync(srcDir)) {
      copyDir(srcDir, destDir);
      fileCount += countFiles(destDir);
    }
  }

  // 3. Install shared resources (templates, checklists, prompts)
  const sharedDest = path.join(skillsBase, 'gsd-cc-shared');
  for (const dir of SHARED_DIRS) {
    const srcDir = path.join(skillsSrc, dir);
    if (fs.existsSync(srcDir)) {
      copyDir(srcDir, path.join(sharedDest, dir));
      fileCount += countFiles(path.join(sharedDest, dir));
    }
  }

  // 4. Make auto-loop.sh executable
  const autoLoop = path.join(skillsBase, 'gsd-cc-auto', 'auto-loop.sh');
  if (fs.existsSync(autoLoop)) {
    fs.chmodSync(autoLoop, 0o755);
  }

  // 5. Install hooks
  const hooksSrc = path.join(__dirname, '..', 'hooks');
  const hooksBase = isGlobal
    ? path.join(os.homedir(), '.claude', 'hooks')
    : path.join(process.cwd(), '.claude', 'hooks');
  if (fs.existsSync(hooksSrc)) {
    copyDir(hooksSrc, hooksBase);
    // Make hooks executable
    const hookFiles = fs.readdirSync(hooksBase);
    for (const f of hookFiles) {
      fs.chmodSync(path.join(hooksBase, f), 0o755);
    }
    fileCount += hookFiles.length;
  }

  // 6. Configure hooks in settings.json
  installHooks(isGlobal, hooksBase);

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

  // PostToolUse: context monitor (all tools) + workflow guard (Edit/Write)
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse.push({
    hooks: [{ type: 'command', command: contextMonitor, timeout: 5000 }]
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: workflowGuard, timeout: 5000 }]
  });

  // Notification: statusline
  if (!settings.hooks.Notification) settings.hooks.Notification = [];
  settings.hooks.Notification.push({
    hooks: [{ type: 'command', command: statusline, timeout: 3000 }]
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
 * Uninstall skills
 */
function uninstall() {
  const locations = [getSkillsBase(true), getSkillsBase(false)];
  const allDirs = ['gsd-cc', ...SUB_SKILLS.map(s => `gsd-cc-${s}`), 'gsd-cc-shared', 'gsd'];

  let removed = false;

  for (const base of locations) {
    const label = base.includes(os.homedir())
      ? base.replace(os.homedir(), '~')
      : base.replace(process.cwd(), '.');

    let removedFromLocation = false;
    for (const dir of allDirs) {
      const fullPath = path.join(base, dir);
      if (removeDir(fullPath)) {
        removedFromLocation = true;
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

  const globalPath = getSkillsBase(true).replace(os.homedir(), '~');

  console.log(`  ${yellow}Where would you like to install?${reset}

  ${cyan}1${reset}) Global ${dim}(${globalPath})${reset} — available in all projects
  ${cyan}2${reset}) Local  ${dim}(./.claude/skills/)${reset} — this project only
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
