function defaultParsed() {
  return {
    command: 'install',
    global: false,
    local: false,
    uninstall: false,
    help: false,
    yes: false,
    language: null,
    dashboard: null,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY)
  };
}

function parseRequiredValue(rawArgs, index, optionName) {
  const value = rawArgs[index + 1];
  if (value === undefined || value.startsWith('-') || !value.trim()) {
    throw new Error(`${optionName} requires a non-empty value.`);
  }
  return value.trim();
}

function parseDashboardPort(value) {
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('--port requires a number between 1 and 65535.');
  }

  const port = Number(trimmed);
  if (port < 1 || port > 65535) {
    throw new Error('--port requires a number between 1 and 65535.');
  }

  return port;
}

function ensureDashboardOptions(parsed) {
  if (!parsed.dashboard) {
    parsed.dashboard = {
      host: null,
      port: null,
      open: true
    };
  }
}

function parseArgs(rawArgs) {
  const parsed = defaultParsed();

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (index === 0 && arg === 'dashboard') {
      parsed.command = 'dashboard';
      ensureDashboardOptions(parsed);
      continue;
    }

    if (parsed.command === 'dashboard') {
      if (arg === '--no-open') {
        parsed.dashboard.open = false;
        continue;
      }

      if (arg === '--host') {
        parsed.dashboard.host = parseRequiredValue(rawArgs, index, '--host');
        index += 1;
        continue;
      }

      if (arg.startsWith('--host=')) {
        const value = arg.slice('--host='.length).trim();
        if (!value) {
          throw new Error('--host requires a non-empty value.');
        }
        parsed.dashboard.host = value;
        continue;
      }

      if (arg === '--port') {
        parsed.dashboard.port = parseDashboardPort(
          parseRequiredValue(rawArgs, index, '--port')
        );
        index += 1;
        continue;
      }

      if (arg.startsWith('--port=')) {
        parsed.dashboard.port = parseDashboardPort(arg.slice('--port='.length));
        continue;
      }

      if (arg === '--help' || arg === '-h') {
        parsed.help = true;
        continue;
      }

      if (arg.startsWith('-')) {
        throw new Error(`Unknown dashboard option: ${arg}`);
      }

      throw new Error(`Unexpected dashboard argument: ${arg}`);
    }

    if (arg === '--global' || arg === '-g') {
      parsed.global = true;
      continue;
    }

    if (arg === '--local' || arg === '-l') {
      parsed.local = true;
      continue;
    }

    if (arg === '--uninstall') {
      parsed.uninstall = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--yes' || arg === '-y') {
      parsed.yes = true;
      continue;
    }

    if (arg === '--language') {
      parsed.language = parseRequiredValue(rawArgs, index, '--language');
      index += 1;
      continue;
    }

    if (arg.startsWith('--language=')) {
      const value = arg.slice('--language='.length).trim();
      if (!value) {
        throw new Error('--language requires a non-empty value.');
      }
      parsed.language = value;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (parsed.global && parsed.local) {
    throw new Error('Cannot specify both --global and --local.');
  }

  return parsed;
}

module.exports = {
  parseArgs
};
