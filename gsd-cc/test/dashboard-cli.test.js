const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { parseArgs } = require('../bin/install/args');
const {
  packageRoot
} = require('./helpers/package-fixture');

function runCli(args) {
  return spawnSync(
    process.execPath,
    [path.join(packageRoot, 'bin', 'install.js'), ...args],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        GSD_CC_TEST_RUNNER: '1'
      },
      encoding: 'utf8',
      timeout: 5000
    }
  );
}

function spawnDashboard(args) {
  return spawn(
    process.execPath,
    [path.join(packageRoot, 'bin', 'install.js'), ...args],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        GSD_CC_TEST_RUNNER: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
}

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('occupied\n');
    });

    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function findFreePort() {
  const server = await listenOnPort(0);
  const port = server.address().port;
  await closeHttpServer(server);
  return port;
}

function requestUrl(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, (res) => {
      let body = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function waitForDashboardReady(child) {
  let stdout = '';
  let stderr = '';

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      cleanup();
      reject(new Error(`dashboard launch timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    }

    function onStdout(chunk) {
      stdout += chunk;
      const match = stdout.match(/GSD-CC Dashboard running at (http:\/\/\S+)/);

      if (match && /Press Ctrl\+C to stop/.test(stdout)) {
        cleanup();
        resolve({
          url: match[1],
          stdout,
          stderr
        });
      }
    }

    function onStderr(chunk) {
      stderr += chunk;
    }

    function onExit(code, signal) {
      cleanup();
      reject(new Error(
        `dashboard exited before it was ready (${code || signal})\n`
        + `stdout:\n${stdout}\nstderr:\n${stderr}`
      ));
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('exit', onExit);
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 2000);

    child.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGINT');
  });
}

async function testDashboardSubcommandStartsServer() {
  const port = await findFreePort();
  const child = spawnDashboard([
    'dashboard',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--no-open'
  ]);

  try {
    const ready = await waitForDashboardReady(child);

    assert.strictEqual(ready.url, `http://127.0.0.1:${port}/`);
    assert.match(ready.stdout, /Watching .+\.gsd/);
    assert.match(ready.stdout, /Press Ctrl\+C to stop/);
    assert.doesNotMatch(ready.stdout, /Installing to/);

    const response = await requestUrl(new URL('/api/health', ready.url));
    assert.strictEqual(response.statusCode, 200);

    const health = JSON.parse(response.body);
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.host, '127.0.0.1');
    assert.strictEqual(health.port, port);
    assert.strictEqual(health.projectRoot, packageRoot);
  } finally {
    await stopChild(child);
  }
}

function testDashboardEqualsOptionsParse() {
  const options = parseArgs([
    'dashboard',
    '--host=localhost',
    '--port=5173'
  ]);

  assert.strictEqual(options.command, 'dashboard');
  assert.strictEqual(options.dashboard.host, 'localhost');
  assert.strictEqual(options.dashboard.port, 5173);
  assert.strictEqual(options.dashboard.open, true);
}

function testDashboardRejectsInvalidPort() {
  assert.throws(
    () => parseArgs(['dashboard', '--port', 'abc']),
    /--port requires a number between 1 and 65535/
  );
  assert.throws(
    () => parseArgs(['dashboard', '--port=70000']),
    /--port requires a number between 1 and 65535/
  );
}

function testInstallArgumentsStillParseAsBefore() {
  const globalOptions = parseArgs(['--global', '--yes', '--language', 'Deutsch']);
  assert.strictEqual(globalOptions.command, 'install');
  assert.strictEqual(globalOptions.global, true);
  assert.strictEqual(globalOptions.local, false);
  assert.strictEqual(globalOptions.yes, true);
  assert.strictEqual(globalOptions.language, 'Deutsch');
  assert.strictEqual(globalOptions.dashboard, null);

  const localOptions = parseArgs(['--local', '--language=English']);
  assert.strictEqual(localOptions.command, 'install');
  assert.strictEqual(localOptions.global, false);
  assert.strictEqual(localOptions.local, true);
  assert.strictEqual(localOptions.language, 'English');
  assert.strictEqual(localOptions.dashboard, null);

  const uninstallOptions = parseArgs(['--uninstall', '--global']);
  assert.strictEqual(uninstallOptions.command, 'install');
  assert.strictEqual(uninstallOptions.uninstall, true);
  assert.strictEqual(uninstallOptions.global, true);
  assert.strictEqual(uninstallOptions.dashboard, null);
}

function testInstallModeStillRejectsUnexpectedArguments() {
  assert.throws(
    () => parseArgs(['--globall']),
    /Unknown option: --globall/
  );
  assert.throws(
    () => parseArgs(['dashboard', '--global']),
    /Unknown dashboard option: --global/
  );
}

async function testDashboardRespectsExplicitBusyPort() {
  const occupiedServer = await listenOnPort(0);
  const occupiedPort = occupiedServer.address().port;

  try {
    const result = runCli([
      'dashboard',
      '--host',
      '127.0.0.1',
      '--port',
      String(occupiedPort),
      '--no-open'
    ]);

    assert.notStrictEqual(
      result.status,
      0,
      'dashboard should fail instead of falling back from an explicit port'
    );
    assert.match(result.stderr, /EADDRINUSE|address already in use/i);
  } finally {
    await closeHttpServer(occupiedServer);
  }
}

async function run() {
  await testDashboardSubcommandStartsServer();
  testDashboardEqualsOptionsParse();
  testDashboardRejectsInvalidPort();
  testInstallArgumentsStillParseAsBefore();
  testInstallModeStillRejectsUnexpectedArguments();
  await testDashboardRespectsExplicitBusyPort();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
