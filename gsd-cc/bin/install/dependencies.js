
const fs = require('fs');
const path = require('path');
const { COLORS } = require('./constants');

const { green, yellow, reset } = COLORS;

function findExecutable(command) {
  const searchPath = process.env.PATH || '';
  const extensions = process.platform === 'win32'
    ? ['', ...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter(Boolean)
      .map((extension) => extension.toLowerCase())]
    : [''];

  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);

      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch (error) {
        continue;
      }
    }
  }

  return null;
}

function buildReadinessState(reasons) {
  return {
    ready: reasons.length === 0,
    reasons
  };
}

function probeDependencies() {
  const dependencies = {
    jq: {
      label: 'jq',
      path: findExecutable('jq')
    },
    git: {
      label: 'git',
      path: findExecutable('git')
    },
    claude: {
      label: 'claude CLI',
      path: findExecutable('claude')
    }
  };

  for (const dependency of Object.values(dependencies)) {
    dependency.available = Boolean(dependency.path);
  }

  const hookReasons = [];
  if (!dependencies.jq.available) {
    hookReasons.push('jq not found');
  }

  const autoReasons = [];
  if (!dependencies.jq.available) {
    autoReasons.push('jq not found');
  }
  if (!dependencies.git.available) {
    autoReasons.push('git not found');
  }
  if (!dependencies.claude.available) {
    autoReasons.push('claude CLI not found');
  }

  return {
    dependencies,
    readiness: {
      install: buildReadinessState([]),
      hooks: buildReadinessState(hookReasons),
      auto: buildReadinessState(autoReasons)
    }
  };
}

function getReadinessStatusLabel(name, readiness) {
  if (readiness.ready) {
    return `${green}ready${reset}`;
  }

  return name === 'hooks'
    ? `${yellow}disabled${reset}`
    : `${yellow}unavailable${reset}`;
}

function formatReadinessLine(name, label, readiness) {
  const suffix = readiness.ready
    ? ''
    : ` (${readiness.reasons.join(', ')})`;

  return `  ${label}: ${getReadinessStatusLabel(name, readiness)}${suffix}`;
}

function getRecoverySteps(probe, isGlobal) {
  const steps = [];
  const reinstallCommand = isGlobal ? 'npx gsd-cc' : 'npx gsd-cc --local';

  if (!probe.dependencies.jq.available) {
    if (process.platform === 'darwin') {
      steps.push('Install jq: brew install jq');
    } else if (process.platform === 'linux') {
      steps.push('Install jq with your distro package manager, such as apt, yum, or pacman');
    } else {
      steps.push('Install jq with your system package manager or from https://jqlang.github.io/jq/download/');
    }
    steps.push(`Rerun ${reinstallCommand} to enable hooks after jq is available`);
  }

  if (!probe.dependencies.git.available) {
    steps.push('Install Git and ensure `git` is available in your PATH');
  }

  if (!probe.dependencies.claude.available) {
    steps.push('Install Claude Code and ensure `claude` is available in your PATH');
  }

  return steps;
}

function printReadinessSummary(probe, isGlobal) {
  console.log('\n  Readiness summary:');
  console.log(formatReadinessLine('install', 'Installation', probe.readiness.install));
  console.log(formatReadinessLine('hooks', 'Hooks', probe.readiness.hooks));
  console.log(formatReadinessLine('auto', 'Auto-mode', probe.readiness.auto));

  const steps = getRecoverySteps(probe, isGlobal);
  for (const step of steps) {
    console.log(`  Next step: ${step}`);
  }
}

module.exports = {
  findExecutable,
  probeDependencies,
  printReadinessSummary
};
