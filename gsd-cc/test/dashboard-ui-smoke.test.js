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
    attention: []
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
  assert.match(root.innerHTML, /plan/);

  FakeEventSource.instances[0].emit('state', {
    data: JSON.stringify(createModel('applying'))
  });

  assert.match(root.innerHTML, /applying/);
  assert.doesNotMatch(root.innerHTML, /Handle plan/);
  assert.match(root.innerHTML, /Connected/);
}

async function testStylesExposeConnectionStates() {
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.match(styles, /\.dashboard-connection--connected/);
  assert.match(styles, /\.dashboard-connection--reconnecting/);
  assert.match(styles, /\.dashboard-connection--disconnected/);
}

async function run() {
  await testClientReferencesDashboardEndpoints();
  await testSseStateEventUpdatesRenderedState();
  await testStylesExposeConnectionStates();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
