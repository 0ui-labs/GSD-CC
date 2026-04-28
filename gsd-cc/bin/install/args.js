

function parseArgs(rawArgs) {
  const parsed = {
    global: false,
    local: false,
    uninstall: false,
    help: false,
    yes: false,
    language: null,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY)
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

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
      const value = rawArgs[index + 1];
      if (value === undefined || value.startsWith('-') || !value.trim()) {
        throw new Error('--language requires a non-empty value.');
      }
      parsed.language = value.trim();
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
