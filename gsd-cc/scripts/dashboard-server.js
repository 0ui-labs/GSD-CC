#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const {
  buildDashboardModel
} = require('./dashboard/read-model');
const {
  watchDashboardFiles
} = require('./dashboard/watch');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4766;
const DEFAULT_PORT_FALLBACK_ATTEMPTS = 20;
const DEFAULT_EVENT_HEARTBEAT_MS = 30000;
const DASHBOARD_DIR = path.resolve(__dirname, '..', 'dashboard');

const STATIC_ROUTES = {
  '/': {
    file: 'index.html',
    type: 'text/html; charset=utf-8'
  },
  '/app.js': {
    file: 'app.js',
    type: 'application/javascript; charset=utf-8'
  },
  '/styles.css': {
    file: 'styles.css',
    type: 'text/css; charset=utf-8'
  }
};

function normalizeHost(host) {
  return host || DEFAULT_HOST;
}

function normalizePort(port) {
  if (port === null || port === undefined || port === '') {
    return DEFAULT_PORT;
  }

  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error('Dashboard port must be a number between 0 and 65535.');
  }

  return parsed;
}

function normalizeProjectRoot(projectRoot) {
  return path.resolve(projectRoot || process.cwd());
}

function normalizePositiveInteger(value, fallback, label) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return normalized;
}

function canReadBody(method) {
  return method !== 'HEAD';
}

function writeResponse(res, req, statusCode, headers, body) {
  const textBody = body || '';

  res.writeHead(statusCode, {
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(textBody),
    ...headers
  });

  if (canReadBody(req.method)) {
    res.end(textBody);
    return;
  }

  res.end();
}

function writeJson(res, req, statusCode, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  writeResponse(res, req, statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  }, body);
}

function writeNoCacheJson(res, req, statusCode, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  writeResponse(res, req, statusCode, {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
    Expires: '0',
    Pragma: 'no-cache'
  }, body);
}

function writeSseHeaders(res) {
  res.writeHead(200, {
    'Cache-Control': 'no-store, max-age=0',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    Expires: '0',
    Pragma: 'no-cache',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff'
  });
}

function writeArtifactError(res, req, statusCode, code, message) {
  writeNoCacheJson(res, req, statusCode, {
    ok: false,
    error: {
      code,
      message
    }
  });
}

function writeNotFound(res, req) {
  writeResponse(res, req, 404, {
    'Content-Type': 'text/plain; charset=utf-8'
  }, 'Not found\n');
}

function writeMethodNotAllowed(res, req) {
  writeResponse(res, req, 405, {
    Allow: 'GET, HEAD',
    'Content-Type': 'text/plain; charset=utf-8'
  }, 'Method not allowed\n');
}

function writeServerError(res, req) {
  writeResponse(res, req, 500, {
    'Content-Type': 'text/plain; charset=utf-8'
  }, 'Internal server error\n');
}

function parseRequestUrl(req) {
  try {
    return new URL(req.url || '/', 'http://dashboard.local');
  } catch (_error) {
    return null;
  }
}

function getBoundPort(server, fallbackPort) {
  const address = server.address();
  if (address && typeof address === 'object') {
    return address.port;
  }
  return fallbackPort;
}

function createDashboardUrl(host, port) {
  return `http://${formatHostForUrl(host)}:${port}/`;
}

function serveStaticAsset(req, res, route, dashboardDir) {
  const filePath = path.join(dashboardDir, route.file);

  fs.readFile(filePath, 'utf8', (error, body) => {
    if (error) {
      writeServerError(res, req);
      return;
    }

    writeResponse(res, req, 200, {
      'Content-Type': route.type
    }, body);
  });
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);

  return Boolean(relative)
    && !relative.startsWith('..')
    && !path.isAbsolute(relative);
}

function hasTraversalSegment(value) {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => segment === '..');
}

function normalizeArtifactRequestPath(value) {
  if (!value) {
    return {
      error: 'Artifact path is required.'
    };
  }

  if (
    value.includes('\0')
    || path.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || hasTraversalSegment(value)
  ) {
    return {
      error: 'Artifact path must be a safe repository-relative path.'
    };
  }

  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));

  if (!normalized.startsWith('.gsd/') || normalized === '.gsd/') {
    return {
      error: 'Artifact path must point to a file inside .gsd/.'
    };
  }

  return {
    path: normalized
  };
}

function isMissingFileError(error) {
  return Boolean(
    error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'ELOOP')
  );
}

async function buildArtifactPayload(projectRoot, requestedPath) {
  const normalized = normalizeArtifactRequestPath(requestedPath);

  if (normalized.error) {
    const error = new Error(normalized.error);
    error.statusCode = 400;
    error.artifactCode = 'invalid_artifact_path';
    throw error;
  }

  const gsdDir = path.resolve(projectRoot, '.gsd');
  const artifactPath = path.resolve(projectRoot, normalized.path);

  if (!isPathInside(gsdDir, artifactPath)) {
    const error = new Error('Artifact path must point to a file inside .gsd/.');
    error.statusCode = 400;
    error.artifactCode = 'invalid_artifact_path';
    throw error;
  }

  let gsdStats;
  let artifactStats;

  try {
    [gsdStats, artifactStats] = await Promise.all([
      fs.promises.lstat(gsdDir),
      fs.promises.lstat(artifactPath)
    ]);
  } catch (error) {
    if (isMissingFileError(error)) {
      const notFound = new Error('Artifact not found.');
      notFound.statusCode = 404;
      notFound.artifactCode = 'artifact_not_found';
      throw notFound;
    }

    throw error;
  }

  if (!gsdStats.isDirectory() || !artifactStats.isFile()) {
    const notFound = new Error('Artifact not found.');
    notFound.statusCode = 404;
    notFound.artifactCode = 'artifact_not_found';
    throw notFound;
  }

  const [realGsdDir, realArtifactPath] = await Promise.all([
    fs.promises.realpath(gsdDir),
    fs.promises.realpath(artifactPath)
  ]);

  if (!isPathInside(realGsdDir, realArtifactPath)) {
    const error = new Error('Artifact path must point to a file inside .gsd/.');
    error.statusCode = 400;
    error.artifactCode = 'invalid_artifact_path';
    throw error;
  }

  let artifactHandle;
  try {
    const noFollowFlag = fs.constants.O_NOFOLLOW || 0;
    artifactHandle = await fs.promises.open(
      realArtifactPath,
      fs.constants.O_RDONLY | noFollowFlag
    );
    artifactStats = await artifactHandle.stat();
    if (!artifactStats.isFile()) {
      const notFound = new Error('Artifact not found.');
      notFound.statusCode = 404;
      notFound.artifactCode = 'artifact_not_found';
      throw notFound;
    }
    const content = await artifactHandle.readFile('utf8');

    return {
      ok: true,
      artifact: {
        path: normalized.path,
        name: path.basename(realArtifactPath),
        size: artifactStats.size,
        modifiedAt: artifactStats.mtime.toISOString(),
        content
      }
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      const notFound = new Error('Artifact not found.');
      notFound.statusCode = 404;
      notFound.artifactCode = 'artifact_not_found';
      throw notFound;
    }

    throw error;
  } finally {
    if (artifactHandle) {
      await artifactHandle.close();
    }
  }
}

function writeArtifact(req, res, requestUrl, projectRoot) {
  buildArtifactPayload(projectRoot, requestUrl.searchParams.get('path'))
    .then((payload) => {
      writeNoCacheJson(res, req, 200, payload);
    })
    .catch((error) => {
      if (error && error.statusCode && error.artifactCode) {
        writeArtifactError(
          res,
          req,
          error.statusCode,
          error.artifactCode,
          error.message
        );
        return;
      }

      writeArtifactError(
        res,
        req,
        500,
        'artifact_unavailable',
        'Artifact is temporarily unavailable.'
      );
    });
}

function writeDashboardModel(req, res, modelBuilder, projectRoot) {
  try {
    writeNoCacheJson(res, req, 200, modelBuilder(projectRoot));
  } catch (_error) {
    writeNoCacheJson(res, req, 500, {
      ok: false,
      error: {
        code: 'dashboard_model_failed',
        message: 'Dashboard state is temporarily unavailable.'
      }
    });
  }
}

function buildSafeDashboardModel(modelBuilder, projectRoot) {
  try {
    return modelBuilder(projectRoot);
  } catch (_error) {
    return {
      ok: false,
      error: {
        code: 'dashboard_model_failed',
        message: 'Dashboard state is temporarily unavailable.'
      }
    };
  }
}

function writeSseEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeSseComment(res, comment) {
  res.write(`: ${comment}\n\n`);
}

function createStateEventStream(options) {
  const projectRoot = options.projectRoot;
  const modelBuilder = options.modelBuilder;
  const watchOptions = options.watchOptions || {};
  const heartbeatMs = normalizePositiveInteger(
    options.heartbeatMs,
    DEFAULT_EVENT_HEARTBEAT_MS,
    'Dashboard event heartbeat'
  );
  const clients = new Set();

  let watcher = null;
  let heartbeatTimer = null;
  let closed = false;

  function closeWatcher() {
    if (!watcher) {
      return;
    }

    watcher.close();
    watcher = null;
  }

  function stopHeartbeat() {
    if (!heartbeatTimer) {
      return;
    }

    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function stopIdleWork() {
    if (clients.size > 0) {
      return;
    }

    closeWatcher();
    stopHeartbeat();
  }

  function sendState(client) {
    if (client.closed || client.res.destroyed) {
      return;
    }

    writeSseEvent(
      client.res,
      'state',
      buildSafeDashboardModel(modelBuilder, projectRoot)
    );
  }

  function broadcastState() {
    for (const client of clients) {
      sendState(client);
    }
  }

  function broadcastHeartbeat() {
    for (const client of clients) {
      if (!client.closed && !client.res.destroyed) {
        writeSseComment(client.res, 'heartbeat');
      }
    }
  }

  function ensureWatcher() {
    if (watcher || closed) {
      return;
    }

    watcher = watchDashboardFiles(projectRoot, () => {
      broadcastState();
    }, watchOptions);
  }

  function ensureHeartbeat() {
    if (heartbeatTimer || closed) {
      return;
    }

    heartbeatTimer = setInterval(broadcastHeartbeat, heartbeatMs);

    if (heartbeatTimer.unref) {
      heartbeatTimer.unref();
    }
  }

  function removeClient(client) {
    if (client.closed) {
      return;
    }

    client.closed = true;
    clients.delete(client);
    stopIdleWork();
  }

  return {
    addClient(req, res) {
      if (closed) {
        res.end();
        return;
      }

      const client = {
        closed: false,
        res
      };

      clients.add(client);
      req.on('close', () => removeClient(client));
      res.on('close', () => removeClient(client));

      if (res.socket && res.socket.setKeepAlive) {
        res.socket.setKeepAlive(true);
      }

      writeSseHeaders(res);
      ensureWatcher();
      ensureHeartbeat();
      sendState(client);
    },
    close() {
      closed = true;
      closeWatcher();
      stopHeartbeat();

      for (const client of clients) {
        client.closed = true;
        client.res.end();
      }

      clients.clear();
    }
  };
}

function createDashboardServer(options = {}) {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const projectRoot = normalizeProjectRoot(options.projectRoot);
  const dashboardDir = path.resolve(options.dashboardDir || DASHBOARD_DIR);
  const modelBuilder = options.modelBuilder || buildDashboardModel;
  const eventStream = createStateEventStream({
    projectRoot,
    modelBuilder,
    watchOptions: options.watchOptions,
    heartbeatMs: options.eventHeartbeatMs
  });

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      writeMethodNotAllowed(res, req);
      return;
    }

    const requestUrl = parseRequestUrl(req);
    if (!requestUrl) {
      writeNotFound(res, req);
      return;
    }

    const requestPath = requestUrl.pathname;

    if (requestPath === '/api/health') {
      writeJson(res, req, 200, {
        ok: true,
        projectRoot,
        host,
        port: getBoundPort(server, port)
      });
      return;
    }

    if (requestPath === '/api/state') {
      writeDashboardModel(req, res, modelBuilder, projectRoot);
      return;
    }

    if (requestPath === '/api/events') {
      if (req.method === 'HEAD') {
        writeSseHeaders(res);
        res.end();
        return;
      }

      eventStream.addClient(req, res);
      return;
    }

    if (requestPath === '/api/artifact') {
      writeArtifact(req, res, requestUrl, projectRoot);
      return;
    }

    const route = STATIC_ROUTES[requestPath];
    if (!route) {
      writeNotFound(res, req);
      return;
    }

    serveStaticAsset(req, res, route, dashboardDir);
  });

  server.closeDashboardEventStream = () => eventStream.close();
  server.on('close', () => eventStream.close());

  return server;
}

function closeServer(server) {
  if (server && typeof server.closeDashboardEventStream === 'function') {
    server.closeDashboardEventStream();
  }

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

function formatHostForUrl(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    function handleError(error) {
      server.off('listening', handleListening);
      reject(error);
    }

    function handleListening() {
      server.off('error', handleError);
      resolve();
    }

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });
}

function shouldTryNextPort(error, port, allowPortFallback, attemptsRemaining) {
  return Boolean(
    allowPortFallback
    && attemptsRemaining > 0
    && port > 0
    && error
    && error.code === 'EADDRINUSE'
  );
}

async function startDashboardServer(options = {}) {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const projectRoot = normalizeProjectRoot(options.projectRoot);
  const portWasProvided = !(
    options.port === null
    || options.port === undefined
    || options.port === ''
  );
  const allowPortFallback = options.allowPortFallback !== undefined
    ? Boolean(options.allowPortFallback)
    : !portWasProvided && port > 0;
  const fallbackAttempts = options.fallbackAttempts === undefined
    ? DEFAULT_PORT_FALLBACK_ATTEMPTS
    : Number(options.fallbackAttempts);

  if (!Number.isInteger(fallbackAttempts) || fallbackAttempts < 0) {
    throw new Error('Dashboard fallback attempts must be a non-negative integer.');
  }

  let nextPort = port;
  let attemptsRemaining = fallbackAttempts;

  while (true) {
    const server = createDashboardServer({
      ...options,
      host,
      port: nextPort,
      projectRoot
    });

    try {
      await listen(server, host, nextPort);

      const boundPort = getBoundPort(server, nextPort);
      return {
        server,
        host,
        port: boundPort,
        projectRoot,
        url: createDashboardUrl(host, boundPort),
        close: () => closeServer(server)
      };
    } catch (error) {
      if (!shouldTryNextPort(error, nextPort, allowPortFallback, attemptsRemaining)) {
        throw error;
      }

      nextPort += 1;
      attemptsRemaining -= 1;
    }
  }
}

if (require.main === module) {
  startDashboardServer({
    host: process.env.GSD_CC_DASHBOARD_HOST,
    port: process.env.GSD_CC_DASHBOARD_PORT,
    projectRoot: process.cwd()
  }).then((dashboard) => {
    console.log(`Dashboard server listening at ${dashboard.url}`);
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  createDashboardServer,
  createDashboardUrl,
  startDashboardServer
};
