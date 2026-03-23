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
    ${cyan}-g, --global${reset}      Install globally to ~/.claude/skills/gsd/ ${dim}(default)${reset}
    ${cyan}-l, --local${reset}       Install locally to ./.claude/skills/gsd/
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
 * Resolve target directory
 */
function getTargetDir(isGlobal) {
  if (isGlobal) {
    return path.join(os.homedir(), '.claude', 'skills', 'gsd');
  }
  return path.join(process.cwd(), '.claude', 'skills', 'gsd');
}

/**
 * Install skills to target directory
 */
function install(isGlobal) {
  const skillsSrc = path.join(__dirname, '..', 'skills', 'gsd');
  const targetDir = getTargetDir(isGlobal);
  const label = isGlobal
    ? targetDir.replace(os.homedir(), '~')
    : targetDir.replace(process.cwd(), '.');

  if (!fs.existsSync(skillsSrc)) {
    console.error(`  ${red}Error:${reset} Skills source not found at ${skillsSrc}`);
    process.exit(1);
  }

  console.log(`  Installing to ${cyan}${label}${reset}\n`);

  // Copy skills
  copyDir(skillsSrc, targetDir);

  // Make auto-loop.sh executable if it exists
  const autoLoop = path.join(targetDir, 'auto', 'auto-loop.sh');
  if (fs.existsSync(autoLoop)) {
    fs.chmodSync(autoLoop, 0o755);
  }

  // Count installed files
  let fileCount = 0;
  function countFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        countFiles(path.join(dir, entry.name));
      } else {
        fileCount++;
      }
    }
  }
  countFiles(targetDir);

  console.log(`  ${green}✓${reset} Installed ${fileCount} files to ${label}`);
  console.log(`
  ${green}Done.${reset} Open Claude Code and type ${cyan}/gsd-cc${reset} to start.
`);
}

/**
 * Uninstall skills
 */
function uninstall() {
  const globalDir = getTargetDir(true);
  const localDir = getTargetDir(false);

  let removed = false;

  if (removeDir(globalDir)) {
    console.log(`  ${green}✓${reset} Removed global install (${globalDir.replace(os.homedir(), '~')})`);
    removed = true;
  }

  if (removeDir(localDir)) {
    console.log(`  ${green}✓${reset} Removed local install (${localDir.replace(process.cwd(), '.')})`);
    removed = true;
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

  const globalPath = getTargetDir(true).replace(os.homedir(), '~');

  console.log(`  ${yellow}Where would you like to install?${reset}

  ${cyan}1${reset}) Global ${dim}(${globalPath})${reset} — available in all projects
  ${cyan}2${reset}) Local  ${dim}(./.claude/skills/gsd/)${reset} — this project only
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
