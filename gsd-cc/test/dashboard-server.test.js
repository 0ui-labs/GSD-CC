const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  DEFAULT_HOST,
  DEFAULT_PORT,
  startDashboardServer
} = require('../scripts/dashboard-server');
const {
  makeTempDir
} = require('./helpers/temp');

function request(serverInfo, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: serverInfo.host,
      port: serverInfo.port,
      path: pathname,
      method: options.method || 'GET'
    }, (res) => {
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

function contentType(response) {
  return response.headers['content-type'] || '';
}

function assertNoCache(response) {
  assert.strictEqual(response.headers['cache-control'], 'no-store, max-age=0');
  assert.strictEqual(response.headers.pragma, 'no-cache');
  assert.strictEqual(response.headers.expires, '0');
}

async function withServer(options, testFn) {
  const serverInfo = await startDashboardServer(options);

  try {
    await testFn(serverInfo);
  } finally {
    await serverInfo.close();
  }
}

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('occupied\n');
    });

    server.once('error', reject);
    server.listen(port, DEFAULT_HOST, () => {
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

async function occupyDefaultPortIfAvailable() {
  try {
    return await listenOnPort(DEFAULT_PORT);
  } catch (error) {
    if (error && error.code === 'EADDRINUSE') {
      return null;
    }
    throw error;
  }
}

async function testHealthUsesLoopbackByDefault() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-project-');

  await withServer({ projectRoot, port: 0 }, async (serverInfo) => {
    assert.strictEqual(serverInfo.host, DEFAULT_HOST);
    assert.ok(serverInfo.port > 0, 'ephemeral port should be assigned');

    const response = await request(serverInfo, '/api/health');
    assert.strictEqual(response.statusCode, 200);
    assert.match(contentType(response), /^application\/json\b/);

    const health = JSON.parse(response.body);
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.projectRoot, path.resolve(projectRoot));
    assert.strictEqual(health.host, DEFAULT_HOST);
    assert.strictEqual(health.port, serverInfo.port);
  });
}

async function testStaticAssetsUseExpectedContentTypes() {
  await withServer({ port: 0 }, async (serverInfo) => {
    const index = await request(serverInfo, '/');
    assert.strictEqual(index.statusCode, 200);
    assert.match(contentType(index), /^text\/html\b/);
    assert.match(index.body, /Dashboard loading/);

    const app = await request(serverInfo, '/app.js');
    assert.strictEqual(app.statusCode, 200);
    assert.match(contentType(app), /^application\/javascript\b/);
    assert.match(app.body, /data-dashboard-root/);

    const styles = await request(serverInfo, '/styles.css');
    assert.strictEqual(styles.statusCode, 200);
    assert.match(contentType(styles), /^text\/css\b/);
    assert.match(styles.body, /dashboard-shell/);
  });
}

async function testStateReturnsDashboardModelAsJson() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-state-api-');

  fs.mkdirSync(path.join(projectRoot, '.gsd'));
  fs.writeFileSync(path.join(projectRoot, '.gsd', 'STATE.md'), [
    'milestone: M001',
    'current_slice: S01',
    'current_task: T02',
    'phase: applying',
    'language: English',
    ''
  ].join('\n'));

  await withServer({ projectRoot, port: 0 }, async (serverInfo) => {
    const response = await request(serverInfo, '/api/state');

    assert.strictEqual(response.statusCode, 200);
    assert.match(contentType(response), /^application\/json\b/);
    assertNoCache(response);

    const model = JSON.parse(response.body);
    assert.strictEqual(model.project.root, path.resolve(projectRoot));
    assert.strictEqual(model.current.milestone, 'M001');
    assert.strictEqual(model.current.slice, 'S01');
    assert.strictEqual(model.current.task, 'T02');
    assert.strictEqual(model.current.phase, 'applying');
  });
}

async function testStateReturnsSafeJsonError() {
  await withServer({
    port: 0,
    modelBuilder() {
      throw new Error('secret fixture path');
    }
  }, async (serverInfo) => {
    const response = await request(serverInfo, '/api/state');

    assert.strictEqual(response.statusCode, 500);
    assert.match(contentType(response), /^application\/json\b/);
    assertNoCache(response);
    assert.doesNotMatch(response.body, /secret fixture path/);

    assert.deepStrictEqual(JSON.parse(response.body), {
      ok: false,
      error: {
        code: 'dashboard_model_failed',
        message: 'Dashboard state is temporarily unavailable.'
      }
    });
  });
}

async function testArtifactReturnsGsdFileContent() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-artifact-api-');
  const gsdDir = path.join(projectRoot, '.gsd');
  const stateContent = [
    'milestone: M001',
    'current_slice: S01',
    ''
  ].join('\n');

  fs.mkdirSync(gsdDir);
  fs.writeFileSync(path.join(gsdDir, 'STATE.md'), stateContent);

  await withServer({ projectRoot, port: 0 }, async (serverInfo) => {
    const response = await request(
      serverInfo,
      `/api/artifact?path=${encodeURIComponent('.gsd/STATE.md')}`
    );

    assert.strictEqual(response.statusCode, 200);
    assert.match(contentType(response), /^application\/json\b/);
    assertNoCache(response);

    const payload = JSON.parse(response.body);
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.artifact.path, '.gsd/STATE.md');
    assert.strictEqual(payload.artifact.name, 'STATE.md');
    assert.strictEqual(payload.artifact.content, stateContent);
    assert.strictEqual(payload.artifact.size, Buffer.byteLength(stateContent));
    assert.ok(Date.parse(payload.artifact.modifiedAt));
  });
}

async function testArtifactReturnsNotFoundForMissingFile() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-missing-artifact-');

  fs.mkdirSync(path.join(projectRoot, '.gsd'));

  await withServer({ projectRoot, port: 0 }, async (serverInfo) => {
    const response = await request(
      serverInfo,
      `/api/artifact?path=${encodeURIComponent('.gsd/MISSING.md')}`
    );

    assert.strictEqual(response.statusCode, 404);
    assert.match(contentType(response), /^application\/json\b/);
    assertNoCache(response);
    assert.deepStrictEqual(JSON.parse(response.body), {
      ok: false,
      error: {
        code: 'artifact_not_found',
        message: 'Artifact not found.'
      }
    });
  });
}

async function testArtifactRejectsUnsafePaths() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-unsafe-artifact-');

  await withServer({ projectRoot, port: 0 }, async (serverInfo) => {
    const traversal = await request(
      serverInfo,
      `/api/artifact?path=${encodeURIComponent('../package.json')}`
    );
    const absolute = await request(
      serverInfo,
      `/api/artifact?path=${encodeURIComponent(
        path.join(projectRoot, '.gsd', 'STATE.md')
      )}`
    );
    const outsideGsd = await request(
      serverInfo,
      `/api/artifact?path=${encodeURIComponent('package.json')}`
    );

    for (const response of [traversal, absolute, outsideGsd]) {
      assert.strictEqual(response.statusCode, 400);
      assert.match(contentType(response), /^application\/json\b/);
      assertNoCache(response);
      assert.strictEqual(
        JSON.parse(response.body).error.code,
        'invalid_artifact_path'
      );
    }
  });
}

async function testUnknownPathsReturnSafeNotFound() {
  await withServer({ port: 0 }, async (serverInfo) => {
    const response = await request(serverInfo, '/../package.json');

    assert.strictEqual(response.statusCode, 404);
    assert.match(contentType(response), /^text\/plain\b/);
    assert.strictEqual(response.body, 'Not found\n');
  });
}

async function testUnsupportedMethodsReturnSafeResponse() {
  await withServer({ port: 0 }, async (serverInfo) => {
    const response = await request(serverInfo, '/api/health', {
      method: 'POST'
    });

    assert.strictEqual(response.statusCode, 405);
    assert.strictEqual(response.headers.allow, 'GET, HEAD');
    assert.strictEqual(response.body, 'Method not allowed\n');
  });
}

async function testDefaultPortFallsBackWhenBusy() {
  const occupiedServer = await occupyDefaultPortIfAvailable();

  try {
    await withServer({
      host: DEFAULT_HOST,
      fallbackAttempts: 50
    }, async (serverInfo) => {
      assert.notStrictEqual(serverInfo.port, DEFAULT_PORT);
      assert.ok(
        serverInfo.port > DEFAULT_PORT && serverInfo.port <= DEFAULT_PORT + 50,
        `expected fallback port near ${DEFAULT_PORT}, got ${serverInfo.port}`
      );

      const response = await request(serverInfo, '/api/health');
      const health = JSON.parse(response.body);
      assert.strictEqual(health.port, serverInfo.port);
    });
  } finally {
    if (occupiedServer) {
      await closeHttpServer(occupiedServer);
    }
  }
}

async function testExplicitPortCollisionDoesNotFallback() {
  const occupiedServer = await listenOnPort(0);
  const occupiedPort = occupiedServer.address().port;

  try {
    await assert.rejects(
      () => startDashboardServer({
        host: DEFAULT_HOST,
        port: occupiedPort
      }),
      (error) => error && error.code === 'EADDRINUSE'
    );
  } finally {
    await closeHttpServer(occupiedServer);
  }
}

async function run() {
  await testHealthUsesLoopbackByDefault();
  await testStaticAssetsUseExpectedContentTypes();
  await testStateReturnsDashboardModelAsJson();
  await testStateReturnsSafeJsonError();
  await testArtifactReturnsGsdFileContent();
  await testArtifactReturnsNotFoundForMissingFile();
  await testArtifactRejectsUnsafePaths();
  await testUnknownPathsReturnSafeNotFound();
  await testUnsupportedMethodsReturnSafeResponse();
  await testDefaultPortFallsBackWhenBusy();
  await testExplicitPortCollisionDoesNotFallback();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
