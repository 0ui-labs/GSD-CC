const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dashboardDir = path.resolve(__dirname, '..', 'dashboard');
const appPath = path.join(dashboardDir, 'app.js');
const stylesPath = path.join(dashboardDir, 'styles.css');

function createModel(phase) {
  return {
    project: {
      name: 'Fixture Project'
    },
    current: {
      milestone: 'M001',
      slice: 'S01',
      task: 'T01',
      phase,
      next_action: `Handle ${phase}`
    },
    automation: {
      status: 'inactive',
      scope: 'slice',
      unit: null
    },
    progress: {
      slices: [
        {
          id: 'S01',
          name: 'Live browser connection',
          current: true,
          status: phase
        }
      ],
      acceptance_criteria: {
        passed: 1,
        pending: 2
      }
    },
    current_task: {
      id: 'S01-T01',
      name: 'Wire browser live connection',
      risk: {
        level: 'low'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: [
      {
        timestamp: '2026-04-29T08:30:00.000Z',
        type: 'task_started',
        category: 'task',
        severity: 'info',
        message: 'Task started'
      }
    ]
  };
}

function createEmptyModel() {
  return {
    project: {
      name: 'Empty Fixture',
      language: 'unknown',
      project_type: 'unknown',
      rigor: 'unknown',
      base_branch: 'unknown'
    },
    current: {
      milestone: 'unknown',
      slice: 'unknown',
      task: 'unknown',
      phase: 'no-project',
      next_action: 'Run /gsd-cc to initialize this project.'
    },
    automation: {
      status: 'inactive',
      scope: 'unknown',
      unit: null
    },
    progress: {
      slices: [],
      acceptance_criteria: {
        total: 0,
        passed: 0,
        pending: 0
      }
    },
    current_task: {
      id: 'unknown',
      name: 'unknown',
      risk: {
        level: 'unknown'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: []
  };
}

function flushPromises() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = {};
    FakeEventSource.instances.push(this);
  }

  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }

  emit(name, event = {}) {
    if (this.listeners[name]) {
      this.listeners[name](event);
    }
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

FakeEventSource.CLOSED = 2;
FakeEventSource.instances = [];

async function testClientReferencesDashboardEndpoints() {
  const source = fs.readFileSync(appPath, 'utf8');

  assert.match(source, /\/api\/state/);
  assert.match(source, /\/api\/events/);
  assert.match(source, /dashboard-topbar/);
  assert.match(source, /dashboard-status-strip/);
  assert.match(source, /dashboard-status-badge/);
  assert.match(source, /dashboard-sidebar/);
  assert.match(source, /dashboard-main/);
  assert.match(source, /dashboard-context/);
  assert.match(source, /\bfetch\(/);
  assert.match(source, /\bEventSource\b/);
  assert.match(source, /connected/);
  assert.match(source, /reconnecting/);
  assert.match(source, /disconnected/);
  assert.match(source, /setInterval\(fetchState,\s*POLL_INTERVAL_MS\)/);
}

async function testSseStateEventUpdatesRenderedState() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };
  const fetchCalls = [];

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch(url) {
      fetchCalls.push(url);
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createModel('plan'));
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.deepStrictEqual(fetchCalls, ['/api/state']);
  assert.strictEqual(FakeEventSource.instances.length, 1);
  assert.strictEqual(FakeEventSource.instances[0].url, '/api/events');
  assert.match(root.innerHTML, /dashboard-topbar/);
  assert.match(root.innerHTML, /dashboard-status-strip/);
  assert.match(root.innerHTML, /Fixture Project/);
  assert.match(root.innerHTML, /M001/);
  assert.match(root.innerHTML, /S01/);
  assert.match(root.innerHTML, /T01/);
  assert.match(root.innerHTML, /Auto/);
  assert.match(root.innerHTML, /inactive/);
  assert.match(root.innerHTML, /dashboard-sidebar/);
  assert.match(root.innerHTML, /dashboard-main/);
  assert.match(root.innerHTML, /dashboard-context/);
  assert.match(root.innerHTML, /plan/);
  assert.match(root.innerHTML, /Task started/);

  FakeEventSource.instances[0].emit('state', {
    data: JSON.stringify(createModel('applying'))
  });

  assert.match(root.innerHTML, /applying/);
  assert.doesNotMatch(root.innerHTML, /Handle plan/);
  assert.match(root.innerHTML, /Connected/);
  assert.match(root.innerHTML, /Updated/);
}

async function testEmptyModelRendersEmptyShellStates() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createEmptyModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /No progress data yet/);
  assert.match(root.innerHTML, /No current task plan loaded/);
  assert.match(root.innerHTML, /No recent activity yet/);
  assert.match(root.innerHTML, /No attention items/);
}

async function testStylesExposeConnectionStates() {
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.match(styles, /\.dashboard-connection--connected/);
  assert.match(styles, /\.dashboard-connection--reconnecting/);
  assert.match(styles, /\.dashboard-connection--disconnected/);
  assert.match(styles, /\.dashboard-status-strip/);
  assert.match(styles, /\.dashboard-status-badge/);
  assert.match(styles, /\.dashboard-status-badge--active/);
  assert.match(styles, /\.dashboard-status-badge--approval-required/);
  assert.match(styles, /\.dashboard-workspace/);
  assert.match(styles, /grid-template-columns:\s*minmax\(180px,\s*220px\)\s*minmax\(0,\s*1fr\)\s*minmax\(260px,\s*320px\)/);
  assert.match(styles, /\.dashboard-sidebar/);
  assert.match(styles, /\.dashboard-main/);
  assert.match(styles, /\.dashboard-context/);
  assert.match(styles, /@media \(max-width: 1180px\)/);
}

async function run() {
  await testClientReferencesDashboardEndpoints();
  await testSseStateEventUpdatesRenderedState();
  await testEmptyModelRendersEmptyShellStates();
  await testStylesExposeConnectionStates();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
