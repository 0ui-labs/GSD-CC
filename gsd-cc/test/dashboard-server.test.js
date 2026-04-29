const assert = require('assert');
const http = require('http');
const path = require('path');

const {
  DEFAULT_HOST,
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

async function withServer(options, testFn) {
  const serverInfo = await startDashboardServer(options);

  try {
    await testFn(serverInfo);
  } finally {
    await serverInfo.close();
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

async function run() {
  await testHealthUsesLoopbackByDefault();
  await testStaticAssetsUseExpectedContentTypes();
  await testUnknownPathsReturnSafeNotFound();
  await testUnsupportedMethodsReturnSafeResponse();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
