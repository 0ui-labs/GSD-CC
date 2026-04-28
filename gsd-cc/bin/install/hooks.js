
const path = require('path');
const { HOOK_SPECS } = require('./constants');

function buildHookSpecs(claudeBase, relativeHookDir) {
  return HOOK_SPECS.map((group) => {
    const commands = group.hooks.map((hook) => path.join(relativeHookDir, hook.file));
    return {
      event: group.event,
      matcher: group.matcher,
      commands,
      hooks: group.hooks.map((hook) => ({
        type: 'command',
        command: path.join(claudeBase, relativeHookDir, hook.file),
        timeout: hook.timeout
      }))
    };
  });
}

function normalizeMatcher(value) {
  return value || null;
}

function hookEntryMatchesSpec(entry, spec) {
  if (normalizeMatcher(entry.matcher) !== normalizeMatcher(spec.matcher)) {
    return false;
  }

  if (!Array.isArray(entry.hooks) || entry.hooks.length !== spec.hooks.length) {
    return false;
  }

  return entry.hooks.every((hook, index) => {
    const expected = spec.hooks[index];
    return hook &&
      hook.type === 'command' &&
      typeof hook.command === 'string' &&
      path.normalize(hook.command) === path.normalize(expected.command);
  });
}

function normalizeHookCommand(command) {
  return path.normalize(command);
}

function collectManagedHookCommands(specs) {
  const commands = new Set();

  for (const spec of specs) {
    for (const hook of spec.hooks) {
      if (hook && hook.type === 'command' && typeof hook.command === 'string') {
        commands.add(normalizeHookCommand(hook.command));
      }
    }
  }

  return commands;
}

function hookEntryOwnedByCommands(entry, managedCommands) {
  if (!Array.isArray(entry.hooks) || entry.hooks.length === 0) {
    return false;
  }

  return entry.hooks.every((hook) => {
    return hook &&
      hook.type === 'command' &&
      typeof hook.command === 'string' &&
      managedCommands.has(normalizeHookCommand(hook.command));
  });
}

function removeHookEntries(settings, specs) {
  if (!settings.hooks) {
    return false;
  }

  if (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    throw new Error(
      'Claude settings contain an invalid "hooks" value. ' +
      'Expected an object of hook arrays.'
    );
  }

  let changed = false;
  const managedCommands = collectManagedHookCommands(specs);

  for (const [event, entries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(entries)) {
      throw new Error(
        `Claude settings contain an invalid hook list for "${event}". ` +
        'Expected an array.'
      );
    }

    const eventSpecs = specs.filter((spec) => spec.event === event);
    if (eventSpecs.length === 0) {
      continue;
    }

    const nextEntries = entries.filter((entry) => {
      const exactMatch = eventSpecs.some((spec) => hookEntryMatchesSpec(entry, spec));
      return !(exactMatch || hookEntryOwnedByCommands(entry, managedCommands));
    });

    if (nextEntries.length !== entries.length) {
      changed = true;
    }

    if (nextEntries.length === 0) {
      delete settings.hooks[event];
    } else {
      settings.hooks[event] = nextEntries;
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return changed;
}

function addHookEntries(settings, specs) {
  if (specs.length === 0) {
    return;
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const spec of specs) {
    if (!settings.hooks[spec.event]) {
      settings.hooks[spec.event] = [];
    }

    const entry = { hooks: spec.hooks };
    if (spec.matcher) {
      entry.matcher = spec.matcher;
    }

    settings.hooks[spec.event].push(entry);
  }
}

module.exports = {
  buildHookSpecs,
  removeHookEntries,
  addHookEntries
};
