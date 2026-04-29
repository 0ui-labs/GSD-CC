#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 0;
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

function parseRequestPath(req) {
  try {
    return new URL(req.url || '/', 'http://dashboard.local').pathname;
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

function createDashboardServer(options = {}) {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const projectRoot = normalizeProjectRoot(options.projectRoot);
  const dashboardDir = path.resolve(options.dashboardDir || DASHBOARD_DIR);

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      writeMethodNotAllowed(res, req);
      return;
    }

    const requestPath = parseRequestPath(req);
    if (!requestPath) {
      writeNotFound(res, req);
      return;
    }

    if (requestPath === '/api/health') {
      writeJson(res, req, 200, {
        ok: true,
        projectRoot,
        host,
        port: getBoundPort(server, port)
      });
      return;
    }

    const route = STATIC_ROUTES[requestPath];
    if (!route) {
      writeNotFound(res, req);
      return;
    }

    serveStaticAsset(req, res, route, dashboardDir);
  });

  return server;
}

function closeServer(server) {
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

function startDashboardServer(options = {}) {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const projectRoot = normalizeProjectRoot(options.projectRoot);
  const server = createDashboardServer({
    ...options,
    host,
    port,
    projectRoot
  });

  return new Promise((resolve, reject) => {
    function handleError(error) {
      server.off('listening', handleListening);
      reject(error);
    }

    function handleListening() {
      server.off('error', handleError);

      const boundPort = getBoundPort(server, port);
      resolve({
        server,
        host,
        port: boundPort,
        projectRoot,
        url: `http://${formatHostForUrl(host)}:${boundPort}/`,
        close: () => closeServer(server)
      });
    }

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });
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
  startDashboardServer
};
