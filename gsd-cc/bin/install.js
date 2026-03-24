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
const SUB_SKILLS = ['apply', 'auto', 'discuss', 'help', 'plan', 'seed', 'status', 'tutorial', 'unify', 'update'];

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

  console.log(`  ${green}✓${reset} Installed ${fileCount} files to ${label}`);
  console.log(`
  ${green}Done.${reset} Open Claude Code and type ${cyan}/gsd-cc${reset} to start.
`);
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

  if (!removed) {
    console.log(`  ${yellow}No GSD-CC installation found.${reset}`);
  } else {
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
    const choice = answer.trim() || '1';
    install(choice !== '2');
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
} else if (hasLocal) {
  install(false);
} else {
  promptLocation();
}
