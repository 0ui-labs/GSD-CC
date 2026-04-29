const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  startDashboardServer
} = require('../scripts/dashboard-server');
const {
  makeTempDir
} = require('./helpers/temp');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForCondition(label, condition, timeoutMs = 1500) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      if (condition()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${label}.`));
        return;
      }

      setTimeout(check, 10);
    }

    check();
  });
}

function writeState(projectRoot, phase) {
  fs.writeFileSync(path.join(projectRoot, '.gsd', 'STATE.md'), [
    'milestone: M001',
    'current_slice: S01',
    'current_task: T01',
    `phase: ${phase}`,
    'language: English',
    ''
  ].join('\n'));
}

function parseSseBlock(block) {
  const data = [];
  const comments = [];
  let event = 'message';

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) {
      comments.push(line.slice(1).trim());
      continue;
    }

    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).replace(/^ /, ''));
    }
  }

  if (comments.length > 0 && data.length === 0) {
    return {
      comment: comments.join('\n')
    };
  }

  return {
    event,
    data: data.join('\n')
  };
}

function appendSseChunk(client, chunk) {
  client.buffer += chunk.replace(/\r\n/g, '\n');

  while (client.buffer.includes('\n\n')) {
    const boundary = client.buffer.indexOf('\n\n');
    const block = client.buffer.slice(0, boundary);
    client.buffer = client.buffer.slice(boundary + 2);

    if (!block.trim()) {
      continue;
    }

    const parsed = parseSseBlock(block);

    if (parsed.comment !== undefined) {
      client.comments.push(parsed.comment);
      continue;
    }

    client.events.push(parsed);
  }
}

function connectEventStream(serverInfo) {
  const client = {
    buffer: '',
    comments: [],
    events: [],
    closed: false,
    response: null,
    request: null,
    close() {
      if (client.request) {
        client.request.destroy();
      }
    }
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const req = http.request({
      host: serverInfo.host,
      port: serverInfo.port,
      path: '/api/events',
      method: 'GET',
      headers: {
        Accept: 'text/event-stream'
      }
    }, (res) => {
      settled = true;
      client.response = res;
      res.setEncoding('utf8');
      res.on('data', (chunk) => appendSseChunk(client, chunk));
      res.on('close', () => {
        client.closed = true;
      });
      res.on('end', () => {
        client.closed = true;
      });
      resolve(client);
    });

    client.request = req;
    req.on('error', (error) => {
      if (!settled) {
        reject(error);
      }
    });
    req.end();
  });
}

async function startTestServer(projectRoot) {
  return startDashboardServer({
    projectRoot,
    port: 0,
    eventHeartbeatMs: 30,
    watchOptions: {
      debounceMs: 20,
      forcePolling: true,
      pollIntervalMs: 10
    }
  });
}

async function testEventsStreamSendsInitialAndUpdatedState() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-sse-state-');
  fs.mkdirSync(path.join(projectRoot, '.gsd'));
  writeState(projectRoot, 'plan');

  const serverInfo = await startTestServer(projectRoot);
  const client = await connectEventStream(serverInfo);

  try {
    assert.strictEqual(client.response.statusCode, 200);
    assert.match(
      client.response.headers['content-type'] || '',
      /^text\/event-stream\b/
    );
    assert.strictEqual(client.response.headers['cache-control'], 'no-store, max-age=0');

    await waitForCondition('initial state event', () => client.events.length >= 1);

    const initial = JSON.parse(client.events[0].data);
    assert.strictEqual(client.events[0].event, 'state');
    assert.strictEqual(initial.current.phase, 'plan');

    writeState(projectRoot, 'applying');

    await waitForCondition('updated state event', () => {
      return client.events
        .map((event) => JSON.parse(event.data))
        .some((model) => model.current && model.current.phase === 'applying');
    });

    await waitForCondition('heartbeat comment', () => {
      return client.comments.includes('heartbeat');
    });
  } finally {
    client.close();
    await serverInfo.close();
  }
}

async function testServerCloseCleansActiveEventClients() {
  const projectRoot = makeTempDir('gsd-cc-dashboard-sse-close-');
  fs.mkdirSync(path.join(projectRoot, '.gsd'));
  writeState(projectRoot, 'plan');

  const serverInfo = await startTestServer(projectRoot);
  const client = await connectEventStream(serverInfo);

  await waitForCondition('initial state event', () => client.events.length >= 1);

  await serverInfo.close();
  await sleep(20);

  assert.strictEqual(client.closed, true);
}

async function run() {
  await testEventsStreamSendsInitialAndUpdatedState();
  await testServerCloseCleansActiveEventClients();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
