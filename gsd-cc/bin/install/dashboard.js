const path = require('path');
const { spawn } = require('child_process');
const {
  startDashboardServer
} = require('../../scripts/dashboard-server');

function shouldOpenBrowser(options) {
  return Boolean(
    options.dashboard
    && options.dashboard.open !== false
    && options.interactive
    && !process.env.CI
    && !process.env.GSD_CC_TEST_RUNNER
  );
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;

  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore'
  });

  child.on('error', () => {});
  child.unref();
}

function installShutdownHandlers(dashboard) {
  let stopping = false;

  async function stop(signal) {
    if (stopping) {
      return;
    }

    stopping = true;

    try {
      await dashboard.close();
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.error(`  Error stopping dashboard: ${message}`);
    }

    process.exit(signal === 'SIGINT' ? 130 : 143);
  }

  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}

async function launchDashboard(options) {
  const dashboardOptions = options.dashboard || {};
  const requestedPort = dashboardOptions.port;
  const dashboard = await startDashboardServer({
    host: dashboardOptions.host,
    port: requestedPort,
    projectRoot: process.cwd(),
    allowPortFallback: requestedPort === null || requestedPort === undefined
  });

  console.log(`  GSD-CC Dashboard running at ${dashboard.url}`);
  console.log(`  Watching ${path.join(dashboard.projectRoot, '.gsd')}`);

  if (shouldOpenBrowser(options)) {
    openBrowser(dashboard.url);
    console.log('  Opening browser.');
  }

  console.log('  Press Ctrl+C to stop.');

  installShutdownHandlers(dashboard);
  return dashboard;
}

module.exports = {
  launchDashboard,
  shouldOpenBrowser
};
