const os = require('os');
const readline = require('readline');
const pkg = require('../../package.json');
const { parseArgs } = require('./args');
const { COLORS } = require('./constants');
const { launchDashboard } = require('./dashboard');
const { getClaudeBase } = require('./paths');
const { writeLanguageConfig } = require('./language-config');
const {
  installAndConfigure,
  printDefaultGlobalChoice,
  printLanguageSet,
  uninstall
} = require('./operations');

const { cyan, yellow, red, dim, reset } = COLORS;

const banner = `
${cyan}   ██████╗ ███████╗██████╗        ██████╗ ██████╗
  ██╔════╝ ██╔════╝██╔══██╗      ██╔════╝██╔════╝
  ██║  ███╗███████╗██║  ██║█████╗██║     ██║
  ██║   ██║╚════██║██║  ██║╚════╝██║     ██║
  ╚██████╔╝███████║██████╔╝      ╚██████╗╚██████╗
   ╚═════╝ ╚══════╝╚═════╝        ╚═════╝ ╚═════╝${reset}

  Get Shit Done on Claude Code ${dim}v${pkg.version}${reset}
`;

function printHelp() {
  console.log(`  ${yellow}Usage:${reset} npx gsd-cc [options]
         npx gsd-cc dashboard [options]

  ${yellow}Commands:${reset}
    ${cyan}dashboard${reset}       Start the local dashboard launcher

  ${yellow}Options:${reset}
    ${cyan}-g, --global${reset}      Install globally to ~/.claude/skills/ ${dim}(default)${reset}
    ${cyan}-l, --local${reset}       Install locally to ./.claude/skills/
    ${cyan}--uninstall${reset}       Remove GSD-CC safely from detected installs
    ${cyan}-y, --yes${reset}         Run without prompts
    ${cyan}--language <name>${reset} Set GSD-CC language non-interactively
    ${cyan}-h, --help${reset}        Show this help message

  ${yellow}Dashboard Options:${reset}
    ${cyan}--host <host>${reset}     Host to bind when the dashboard server is added
    ${cyan}--port <number>${reset}   Port to bind when the dashboard server is added
    ${cyan}--no-open${reset}         Do not open a browser automatically

  ${yellow}Examples:${reset}
    ${dim}# Install globally (default)${reset}
    npx gsd-cc

    ${dim}# Install to current project only${reset}
    npx gsd-cc --local

    ${dim}# Update or automate without prompts${reset}
    npx gsd-cc --global --yes

    ${dim}# Remove GSD-CC${reset}
    npx gsd-cc --uninstall

    ${dim}# Start the dashboard launcher${reset}
    npx gsd-cc dashboard --no-open
`);
}

function fail(error) {
  const message = error && error.message ? error.message : String(error);
  console.error(`  ${red}Error:${reset} ${message}`);
  process.exit(1);
}

function promptLanguage(isGlobal, onDone) {
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

    try {
      const language = answer.trim() || 'English';
      writeLanguageConfig(isGlobal, language);
      printLanguageSet(language);
      onDone();
    } catch (error) {
      fail(error);
    }
  });
}

function promptLocation(installOptions) {
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

    try {
      const isGlobal = (answer.trim() || '1') !== '2';
      installAndConfigure(isGlobal, installOptions, promptLanguage);
    } catch (error) {
      fail(error);
    }
  });
}

function main(rawArgs) {
  let options;
  try {
    options = parseArgs(rawArgs);
  } catch (error) {
    console.log(banner);
    fail(error);
  }

  const hasGlobal = options.global;
  const hasLocal = options.local;
  const hasUninstall = options.uninstall;
  const hasHelp = options.help;

  console.log(banner);

  if (hasHelp) {
    printHelp();
    return;
  }

  try {
    if (options.command === 'dashboard') {
      launchDashboard(options);
    } else if (hasUninstall) {
      uninstall(options);
    } else if (hasGlobal) {
      installAndConfigure(true, options, promptLanguage);
    } else if (hasLocal) {
      installAndConfigure(false, options, promptLanguage);
    } else if (options.yes || !options.interactive) {
      printDefaultGlobalChoice();
      installAndConfigure(true, options, promptLanguage);
    } else {
      promptLocation(options);
    }
  } catch (error) {
    fail(error);
  }
}

module.exports = { main };
