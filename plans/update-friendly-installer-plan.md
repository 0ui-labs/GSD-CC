# Update-Friendly Installer Implementation Plan

## Goal

Make `gsd-cc` updates non-interactive and predictable.

The target outcome is:

- `/gsd-cc-update` never hangs on the installer language prompt
- reinstalling or updating preserves the existing GSD-CC language by default
- users can set language explicitly with a CLI flag
- automation can opt out of all prompts with a `--yes` flag
- fresh interactive installs still feel friendly
- tests cover both update and first-install behavior

## Why This Change Comes Fourth

The update skill currently tells Claude to run:

```bash
npx -y gsd-cc@latest --global
```

or:

```bash
npx -y gsd-cc@latest --local
```

The `-y` belongs to `npx`; it does not answer prompts inside the package.
After installing files, `gsd-cc/bin/install.js` always calls
`promptLanguage(...)` for `--global` and `--local`. That means an update
command can unexpectedly wait for interactive input.

An update path should be boring: preserve the user's existing configuration,
refresh managed files, print the result, and exit.

## Current Problem

The main installer flow is:

```js
if (hasGlobal) {
  install(true);
  promptLanguage(true);
} else if (hasLocal) {
  install(false);
  promptLanguage(false);
} else {
  promptLocation();
}
```

This treats fresh install, reinstall, and update the same way. The installer
does not currently distinguish:

- first install with no language configured
- reinstall where `CLAUDE.md` already contains `GSD-CC language: ...`
- non-interactive update from `/gsd-cc-update`
- explicit user intent to change language

The result is an update command that can block even though no new decision is
needed.

## Behavioral Contract

### Fresh interactive install

When the user runs:

```bash
npx gsd-cc
```

with no scope flags and a TTY:

- ask where to install
- install files
- ask for language if no existing language is configured
- default language to `English` if the user presses Enter

This preserves the friendly first-run experience.

### Reinstall or update with existing language

When the target `CLAUDE.md` already contains a GSD-CC language config:

- preserve that language automatically
- do not prompt for language
- print a short line such as:

```text
Language preserved: Deutsch
```

This should happen for both global and local installs.

### Explicit language flag

When the user passes:

```bash
npx gsd-cc --global --language Deutsch
```

or:

```bash
npx gsd-cc --local --language=English
```

the installer should:

- install files
- write that language to the target config
- never ask for language

Explicit CLI input wins over any existing language.

### `--yes`

When the user passes:

```bash
npx gsd-cc --global --yes
```

the installer should not ask any questions.

Language resolution in `--yes` mode:

1. use `--language` if provided
2. otherwise preserve existing language if present
3. otherwise write `English`

If `--yes` is used without `--global` or `--local`, default to global install
and print that choice. This matches the current default while avoiding a
location prompt.

### Non-TTY mode

If stdin or stdout is not a TTY, behave like `--yes` for prompts:

- do not call `readline.question`
- preserve existing language or default to `English`
- default to global install if no scope is provided

This prevents CI, scripts, and agent subprocesses from hanging.

### Uninstall

`--uninstall` should remain non-interactive. It should ignore `--language` and
`--yes` except for argument validation warnings if the implementation chooses
to add them.

## Proposed Implementation

### 1. Replace ad hoc argument checks with a small parser

Introduce a parser that supports:

- `--global`, `-g`
- `--local`, `-l`
- `--uninstall`
- `--help`, `-h`
- `--yes`, `-y`
- `--language <value>`
- `--language=<value>`

Important note: `npx -y gsd-cc@latest --global --yes` is the intended update
shape. The package should not rely on receiving `-y` from `npx`, but accepting
`-y` after the package name is still useful for direct CLI use.

Validation:

- reject `--global` and `--local` together
- reject empty `--language`
- reject unknown flags so typos do not silently change install behavior

### 2. Add language read helpers

Add a helper that reads the current language from the target `CLAUDE.md`:

```js
function readLanguageConfig(isGlobal) {
  const claudeMdPath = getClaudeMdPath(isGlobal);
  if (!fs.existsSync(claudeMdPath)) {
    return null;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf8');
  return extractLanguageFromConfig(content);
}
```

`extractLanguageFromConfig(content)` should support both:

- the current managed marker block
- the legacy `# GSD-CC Config` format

The helper should return only the language value, for example `Deutsch`.

### 3. Centralize language resolution

Replace direct calls to `promptLanguage(isGlobal)` with a single flow:

```js
function configureLanguage(isGlobal, options, onDone) {
  const existingLanguage = readLanguageConfig(isGlobal);

  if (options.language) {
    writeLanguageConfig(isGlobal, options.language);
    printLanguageSet(options.language);
    onDone();
    return;
  }

  if (existingLanguage) {
    printLanguagePreserved(existingLanguage);
    onDone();
    return;
  }

  if (!options.interactive || options.yes) {
    writeLanguageConfig(isGlobal, 'English');
    printLanguageSet('English');
    onDone();
    return;
  }

  promptLanguage(isGlobal, onDone);
}
```

Because the current implementation uses `readline`, this can stay callback
based in the first change. A later refactor can convert the installer to
`async`/`await`, but that is not required.

### 4. Update `promptLanguage`

Change `promptLanguage(isGlobal)` to accept a completion callback:

```js
function promptLanguage(isGlobal, onDone) {
  ...
  rl.question(..., (answer) => {
    ...
    onDone();
  });
}
```

Keep the existing prompt copy for true first-time interactive installs.

### 5. Update `promptLocation`

`promptLocation()` should also route into the same post-install language flow:

```js
install(isGlobal);
configureLanguage(isGlobal, options, printDoneMessage);
```

When prompts are disabled and no scope was supplied, skip `promptLocation()`
and install globally.

### 6. Separate install completion messages

Today `promptLanguage` prints the final "Done" message. Move final messaging
to one helper so every path prints consistently:

```js
function printInstallDone() {
  console.log(`Done. Open Claude Code and type /gsd-cc to start.`);
}
```

This avoids duplicate or missing completion text across:

- prompt language
- preserved language
- explicit `--language`
- `--yes`
- non-TTY update

### 7. Update `/gsd-cc-update`

Change `gsd-cc/skills/update/SKILL.md` commands to pass `--yes`:

```bash
npx -y gsd-cc@latest --global --yes
npx -y gsd-cc@latest --local --yes
```

For updating both scopes, prefer two separate commands in sequence instead of
one shell line with `&&` if the agent environment makes failure reporting
clearer. If the skill keeps one line, it should still include `--yes` for both
invocations:

```bash
npx -y gsd-cc@latest --global --yes && npx -y gsd-cc@latest --local --yes
```

The update skill should also say:

- existing language is preserved by default
- use `/gsd-cc-config` after update to change language

### 8. Update help and docs

Update installer help output with:

```text
--yes                 Run without prompts
--language <name>     Set GSD-CC language non-interactively
```

Update docs where install/update commands are listed:

- `README.md`
- `gsd-cc/README.md`
- possibly `gsd-cc/skills/help/SKILL.md` if command behavior is described

## Files Expected To Change

- `gsd-cc/bin/install.js`
- `gsd-cc/skills/update/SKILL.md`
- `README.md`
- `gsd-cc/README.md`
- `gsd-cc/package.json` if new tests are wired into scripts

Possible additions:

- `gsd-cc/test/installer-update.test.js`
- or expanded coverage in `gsd-cc/test/install-hooks.test.js`

## Test Strategy

Use temporary homes and project directories. Never touch the real
`~/.claude`.

### Test 1: Existing global language is preserved

Setup:

- temp `HOME`
- pre-create `HOME/.claude/CLAUDE.md` with managed language block:
  `GSD-CC language: Deutsch`

Run:

```bash
node bin/install.js --global --yes
```

Expected:

- process exits 0
- output does not contain `Which language should GSD-CC use?`
- `CLAUDE.md` still contains `GSD-CC language: Deutsch`
- output contains `Language preserved: Deutsch`

### Test 2: Existing local language is preserved

Setup:

- temp project directory
- pre-create `CLAUDE.md` with `GSD-CC language: Deutsch`

Run:

```bash
node bin/install.js --local --yes
```

Expected:

- no prompt
- project `CLAUDE.md` preserves `Deutsch`
- global `HOME/.claude/CLAUDE.md` is not created or changed

### Test 3: `--language` overrides existing language

Setup:

- existing language `Deutsch`

Run:

```bash
node bin/install.js --global --yes --language English
```

Expected:

- no prompt
- language becomes `English`
- output says language was set, not merely preserved

### Test 4: `--language=value` works

Run:

```bash
node bin/install.js --local --language=Deutsch --yes
```

Expected:

- local `CLAUDE.md` contains `GSD-CC language: Deutsch`
- no prompt

### Test 5: Fresh `--yes` install defaults to English

Setup:

- no existing `CLAUDE.md`

Run:

```bash
node bin/install.js --global --yes
```

Expected:

- no prompt
- `CLAUDE.md` is created with `GSD-CC language: English`

### Test 6: Non-TTY install does not hang

Run installer with piped stdin or `stdio` that is not a TTY:

```bash
node bin/install.js --global
```

from a test subprocess with non-interactive stdio.

Expected:

- exits without waiting for input
- preserves existing language or defaults to `English`

### Test 7: Interactive install still prompts

This can be a limited test using subprocess input:

```bash
node bin/install.js --global
```

with input:

```text
Deutsch
```

Expected:

- output contains the language prompt
- `CLAUDE.md` contains `Deutsch`

If testing true TTY behavior is awkward, keep this as a manual smoke check and
cover all non-interactive paths automatically.

### Test 8: Update skill command is non-interactive

Read `gsd-cc/skills/update/SKILL.md` and assert the documented update commands
include `--yes` for each `npx -y gsd-cc@latest` invocation.

This is a simple text-level regression test that prevents the skill from
drifting back to a blocking update command.

## Implementation Phases

### Phase A: Add failing update tests

Add tests for:

- existing language preservation
- `--language` override
- fresh `--yes` default
- update skill commands include `--yes`

These tests should fail against the current installer because it always calls
`promptLanguage`.

### Phase B: Add CLI parsing and language helpers

Implement:

- structured argument parser
- `extractLanguageFromConfig`
- `readLanguageConfig`
- prompt eligibility detection

Keep behavior unchanged for normal fresh interactive install.

### Phase C: Wire non-interactive install flow

Update the main flow so:

- `--global --yes` installs and exits without prompting
- `--local --yes` installs and exits without prompting
- existing language is preserved before prompting is considered
- missing language in non-interactive mode defaults to `English`

### Phase D: Update update skill and docs

Change `/gsd-cc-update` commands to include `--yes`.

Update CLI help and README install/update sections so users can discover:

- `--yes`
- `--language`
- default language preservation on reinstall/update

### Phase E: Manual smoke test

Run isolated commands in `/tmp`:

```bash
HOME=/tmp/gsd-cc-update-smoke node gsd-cc/bin/install.js --global --yes
HOME=/tmp/gsd-cc-update-smoke node gsd-cc/bin/install.js --global --yes
HOME=/tmp/gsd-cc-update-smoke node gsd-cc/bin/install.js --global --yes --language Deutsch
```

Confirm:

- none of the commands hang
- language is preserved between the first two commands
- explicit `--language Deutsch` changes the config

## Acceptance Criteria

- `/gsd-cc-update` can run without waiting for user input.
- Existing global and local language settings are preserved on update.
- `--language <name>` and `--language=<name>` set language explicitly.
- `--yes` disables location and language prompts.
- Non-TTY installer runs do not hang.
- Fresh interactive installs can still ask for install location and language.
- CLI help documents the new flags.
- Automated tests cover update-style non-interactive installs.

## Suggested Atomic Commits

1. `test(installer): Cover noninteractive updates`
2. `fix(installer): Preserve language during updates`
3. `docs(update): Use noninteractive installer flags`

