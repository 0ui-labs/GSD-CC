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

function createAttentionModel() {
  return {
    project: {
      name: 'Attention Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M001',
      slice: 'S01',
      task: 'T02',
      phase: 'apply-blocked',
      next_action: 'Resolve the blocker before continuing.'
    },
    automation: {
      status: 'approval-required',
      scope: 'slice',
      unit: 'S01/T02',
      pid: 99999999,
      started_at: '2026-04-29T08:00:00Z'
    },
    progress: {
      slices: [
        {
          id: 'S01',
          name: 'Attention states',
          current: true,
          status: 'blocked'
        }
      ],
      acceptance_criteria: {
        passed: 1,
        pending: 1
      }
    },
    current_task: {
      id: 'S01-T02',
      name: 'Handle attention states',
      risk: {
        level: 'high'
      },
      acceptance_criteria: []
    },
    attention: [
      {
        id: 'unify-required',
        severity: 'warning',
        title: 'UNIFY required',
        message: 'S01 is apply-complete but has no UNIFY report yet.',
        source: '.gsd/S01-UNIFY.md',
        recommended_action: 'Run UNIFY for S01 before moving on.'
      },
      {
        id: 'approval-required',
        severity: 'critical',
        title: 'Approval required',
        message: 'S01/T02 needs approval before auto-mode can continue.',
        source: '.gsd/APPROVAL-REQUEST.json',
        recommended_action: 'risk high meets approval_required_risk high'
      },
      {
        id: 'phase-apply-blocked',
        severity: 'warning',
        title: 'Phase blocked',
        message: 'apply-blocked requires attention for S01/T02.',
        source: '.gsd/STATE.md',
        recommended_action: 'Resolve the recorded blocker: Missing API credentials'
      },
      {
        id: 'auto-lock-stale',
        severity: 'critical',
        title: 'Auto-mode lock is stale',
        message: 'An auto-mode lock exists, but its PID is not running.',
        source: '.gsd/auto.lock',
        recommended_action: 'Review the last task state, then remove .gsd/auto.lock.'
      },
      {
        id: 'auto-recovery',
        severity: 'critical',
        title: 'Auto-mode stopped early',
        message: 'Auto-mode stopped: dispatch_failed.',
        source: '.gsd/auto-recovery.json',
        recommended_action: 'Inspect the log before resuming.'
      }
    ],
    activity: [],
    evidence: {
      approval_request: {
        slice: 'S01',
        task: 'T02',
        unit: 'S01/T02',
        plan: '.gsd/S01-T02-PLAN.xml',
        risk_level: 'high',
        risk_reason: 'Touches deployment configuration.',
        fingerprint: '123:456',
        reasons: [
          'risk high meets approval_required_risk high'
        ],
        created_at: '2026-04-29T08:01:00Z',
        source: '.gsd/APPROVAL-REQUEST.json'
      },
      latest_recovery: {
        status: 'problem',
        reason: 'dispatch_failed',
        message: 'Dispatch failed with exit 42 on S01/T02.',
        scope: 'slice',
        unit: 'S01/T02',
        phase: 'applying',
        dispatch_phase: 'apply',
        started_at: '2026-04-29T08:00:00Z',
        stopped_at: '2026-04-29T08:02:00Z',
        uncommitted_files: [
          'src/fixture.txt'
        ],
        log_file: '.gsd/auto.log',
        safe_next_action: 'Inspect the log before resuming.',
        source: '.gsd/auto-recovery.json',
        report: '.gsd/AUTO-RECOVERY.md'
      },
      latest_unify: null,
      recent_decisions: []
    }
  };
}

function createCurrentRunModel() {
  return {
    project: {
      name: 'Current Run Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M001',
      slice: 'S03',
      task: 'T04',
      phase: 'applying',
      task_name: 'Implement dashboard current run',
      next_action: 'Wait for S03/T04 to finish.',
      activity: {
        timestamp: '2026-04-29T08:45:00.000Z',
        type: 'dispatch_failed',
        category: 'dispatch',
        severity: 'warning',
        message: 'Apply dispatch failed.',
        unit: 'S03/T04',
        phase: 'applying',
        dispatch_phase: 'apply',
        source: '.gsd/events.jsonl',
        line: 8,
        artifact: '.gsd/AUTO-RECOVERY.md'
      }
    },
    automation: {
      status: 'active',
      scope: 'task',
      unit: 'S03/T04',
      pid: 4242,
      started_at: '2026-04-29T08:40:00.000Z'
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
      id: 'S03-T04',
      name: 'Fallback task title',
      risk: {
        level: 'medium'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: [],
    evidence: {
      latest_recovery: {
        reason: 'dispatch_failed',
        dispatch_phase: 'apply',
        log_file: '.gsd/auto.log',
        report: '.gsd/AUTO-RECOVERY.md',
        source: '.gsd/auto-recovery.json'
      }
    }
  };
}

function createWhyTaskModel() {
  return {
    project: {
      name: 'Why Task Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M002',
      slice: 'S04',
      task: 'T05',
      phase: 'applying',
      task_name: 'Explain task rationale',
      next_action: 'Review the task plan rationale.'
    },
    automation: {
      status: 'inactive',
      scope: 'task',
      unit: 'S04/T05'
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
      id: 'S04-T05',
      name: 'Explain task rationale',
      risk: {
        level: 'high',
        reason: 'Task plan fields must not be mixed with inferred reasoning.'
      },
      files: [],
      boundaries: [],
      acceptance_criteria: [
        {
          id: 'AC-4',
          text: 'Given a task plan exists\nWhen the dashboard renders\nThen action evidence is visible',
          status: 'pending'
        },
        {
          id: 'AC-5',
          text: 'Given verify commands exist\nWhen the dashboard renders\nThen commands are shown verbatim',
          status: 'passed'
        }
      ],
      action: [
        '1. Render the task action summary',
        '2. Show risk and covered ACs'
      ],
      verify: [
        'node test/dashboard-ui-smoke.test.js (AC-4, AC-5)'
      ],
      done: null,
      warnings: []
    },
    attention: [],
    activity: []
  };
}

function createActivityFeedModel() {
  return {
    project: {
      name: 'Activity Feed Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M003',
      slice: 'S05',
      task: 'T06',
      phase: 'applying',
      task_name: 'Render activity feed',
      next_action: 'Watch auto-mode progress.'
    },
    automation: {
      status: 'active',
      scope: 'task',
      unit: 'S05/T06',
      pid: 5150,
      started_at: '2026-04-29T08:00:00.000Z'
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
      id: 'S05-T06',
      name: 'Render activity feed',
      risk: {
        level: 'medium'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: [
      {
        timestamp: '2026-04-29T08:06:00.000Z',
        type: 'state_validation_failed',
        category: 'error',
        severity: 'warning',
        message: 'State validation failed.',
        source: '.gsd/events.jsonl',
        line: 6,
        details: {
          reason: 'phase missing',
          attempts: 2
        },
        artifacts: [
          '.gsd/STATE.md'
        ]
      },
      {
        timestamp: '2026-04-29T08:05:00.000Z',
        type: 'approval_required',
        category: 'approval',
        severity: 'critical',
        message: 'Approval required for S05/T06.',
        unit: 'S05/T06',
        phase: 'applying',
        source: '.gsd/events.jsonl',
        line: 5,
        artifact: '.gsd/APPROVAL-REQUEST.json',
        artifacts: [
          '.gsd/APPROVAL-REQUEST.json',
          '.gsd/S05-T06-PLAN.xml'
        ],
        details: {
          risk_level: 'high'
        }
      },
      {
        timestamp: '2026-04-29T08:04:00.000Z',
        type: 'recovery_written',
        category: 'recovery',
        severity: 'warning',
        message: 'Recovery report written.',
        unit: 'S05/T06',
        phase: 'applying',
        source: '.gsd/events.jsonl',
        line: 4,
        artifact: '.gsd/AUTO-RECOVERY.md',
        details: {
          exit_code: '42'
        }
      },
      {
        timestamp: '2026-04-29T08:03:00.000Z',
        type: 'task_started',
        category: 'task',
        severity: 'info',
        message: 'Task S05/T06 started.',
        unit: 'S05/T06',
        phase: 'applying',
        source: '.gsd/events.jsonl',
        line: 3,
        artifact: '.gsd/S05-T06-PLAN.xml'
      },
      {
        timestamp: '2026-04-29T08:02:00.000Z',
        type: 'dispatch_started',
        category: 'dispatch',
        severity: 'info',
        message: 'Apply dispatch started.',
        unit: 'S05/T06',
        phase: 'applying',
        dispatch_phase: 'apply',
        source: '.gsd/events.jsonl',
        line: 2
      },
      {
        timestamp: '2026-04-29T08:01:00.000Z',
        type: 'auto_started',
        category: 'lifecycle',
        severity: 'info',
        message: 'Auto-mode started.',
        source: '.gsd/events.jsonl',
        line: 1
      }
    ]
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
  assert.match(source, /dashboard-attention-panel/);
  assert.match(source, /dashboard-current-run-panel/);
  assert.match(source, /dashboard-why-task-panel/);
  assert.match(source, /dashboard-activity-feed/);
  assert.match(source, /dashboard-activity-summary/);
  assert.match(source, /dashboard-activity-pill/);
  assert.match(source, /formatActivityTimestamp/);
  assert.match(source, /Action summary/);
  assert.match(source, /Acceptance criteria covered/);
  assert.match(source, /Verify command/);
  assert.match(source, /formatRuntimeSince/);
  assert.match(source, /Dispatch phase/);
  assert.match(source, /Latest event/);
  assert.match(source, /Latest pointer/);
  assert.match(source, /Activity event groups/);
  assert.match(source, /\/api\/artifact\?path=/);
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
  assert.match(root.innerHTML, /No live activity yet/);
  assert.match(root.innerHTML, /No log pointer yet/);
  assert.match(root.innerHTML, /No recent activity yet/);
  assert.match(root.innerHTML, /No attention items/);
}

async function testCurrentRunPanelRendersActiveOperationDetails() {
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
          return Promise.resolve(createCurrentRunModel());
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

  assert.match(root.innerHTML, /dashboard-current-run-panel/);
  assert.match(root.innerHTML, /Current task/);
  assert.match(root.innerHTML, /Implement dashboard current run/);
  assert.match(root.innerHTML, /S03\/T04/);
  assert.match(root.innerHTML, /Current phase/);
  assert.match(root.innerHTML, /applying/);
  assert.match(root.innerHTML, /Dispatch phase/);
  assert.match(root.innerHTML, /apply/);
  assert.match(root.innerHTML, /PID/);
  assert.match(root.innerHTML, /4242/);
  assert.match(root.innerHTML, /Runtime/);
  assert.match(root.innerHTML, /Latest event/);
  assert.match(root.innerHTML, /Apply dispatch failed/);
  assert.match(root.innerHTML, /dispatch - dispatch_failed/);
  assert.match(root.innerHTML, /Latest pointer/);
  assert.match(root.innerHTML, /Log/);
  assert.match(root.innerHTML, /auto\.log/);
  assert.match(root.innerHTML, /Recovery/);
  assert.match(root.innerHTML, /AUTO-RECOVERY\.md/);
}

async function testWhyThisTaskPanelRendersTaskPlanEvidence() {
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
          return Promise.resolve(createWhyTaskModel());
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

  assert.match(root.innerHTML, /dashboard-why-task-panel/);
  assert.match(root.innerHTML, /Why this task/);
  assert.match(root.innerHTML, /Explain task rationale/);
  assert.match(root.innerHTML, /Task plan/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FS04-T05-PLAN\.xml/);
  assert.match(root.innerHTML, /Action summary/);
  assert.match(root.innerHTML, /1\. Render the task action summary/);
  assert.match(root.innerHTML, /Risk level/);
  assert.match(root.innerHTML, /high/);
  assert.match(root.innerHTML, /Task plan fields must not be mixed with inferred reasoning/);
  assert.match(root.innerHTML, /Acceptance criteria covered/);
  assert.match(root.innerHTML, /AC-4/);
  assert.match(root.innerHTML, /action evidence is visible/);
  assert.match(root.innerHTML, /AC-5/);
  assert.match(root.innerHTML, /commands are shown verbatim/);
  assert.match(root.innerHTML, /Verify command/);
  assert.match(root.innerHTML, /node test\/dashboard-ui-smoke\.test\.js \(AC-4, AC-5\)/);
  assert.doesNotMatch(root.innerHTML, /doing this because/i);
}

async function testAttentionPanelRendersRequiredActionDetails() {
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
          return Promise.resolve(createAttentionModel());
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

  assert.match(root.innerHTML, /dashboard-attention-panel/);
  assert.match(root.innerHTML, /Approval required/);
  assert.match(root.innerHTML, /risk high meets approval_required_risk high/);
  assert.match(root.innerHTML, /Touches deployment configuration/);
  assert.match(root.innerHTML, /APPROVAL-REQUEST\.json/);
  assert.match(root.innerHTML, /S01-T02-PLAN\.xml/);
  assert.match(root.innerHTML, /Auto-mode stopped early/);
  assert.match(root.innerHTML, /dispatch_failed/);
  assert.match(root.innerHTML, /AUTO-RECOVERY\.md/);
  assert.match(root.innerHTML, /src\/fixture\.txt/);
  assert.match(root.innerHTML, /Auto-mode lock is stale/);
  assert.match(root.innerHTML, /99999999/);
  assert.match(root.innerHTML, /auto\.lock/);
  assert.match(root.innerHTML, /Phase blocked/);
  assert.match(root.innerHTML, /STATE\.md/);
  assert.match(root.innerHTML, /UNIFY required/);
  assert.match(root.innerHTML, /Expected report/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FAPPROVAL-REQUEST\.json/);

  assert.ok(
    root.innerHTML.indexOf('Approval required') < root.innerHTML.indexOf('UNIFY required'),
    'critical approval item should render before warning UNIFY item'
  );
  assert.ok(
    root.innerHTML.indexOf('dashboard-attention-panel') < root.innerHTML.indexOf('id="progress"'),
    'attention panel should render above normal progress'
  );
}

async function testActivityFeedRendersExecutionHistory() {
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
          return Promise.resolve(createActivityFeedModel());
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

  assert.match(root.innerHTML, /dashboard-activity-feed/);
  assert.match(root.innerHTML, /dashboard-activity-summary/);
  assert.match(root.innerHTML, /Activity event groups/);
  assert.match(root.innerHTML, /Lifecycle/);
  assert.match(root.innerHTML, /Task/);
  assert.match(root.innerHTML, /Approval/);
  assert.match(root.innerHTML, /Recovery/);
  assert.match(root.innerHTML, /Error/);
  assert.match(root.innerHTML, /dashboard-activity--category-lifecycle/);
  assert.match(root.innerHTML, /dashboard-activity--category-task/);
  assert.match(root.innerHTML, /dashboard-activity--category-approval/);
  assert.match(root.innerHTML, /dashboard-activity--category-recovery/);
  assert.match(root.innerHTML, /dashboard-activity--category-error/);
  assert.match(root.innerHTML, /datetime="2026-04-29T08:06:00\.000Z"/);
  assert.match(root.innerHTML, /State validation failed/);
  assert.match(root.innerHTML, /state_validation_failed/);
  assert.match(root.innerHTML, /phase missing/);
  assert.match(root.innerHTML, /risk_level/);
  assert.match(root.innerHTML, /high/);
  assert.match(root.innerHTML, /Recovery report written/);
  assert.match(root.innerHTML, /exit_code/);
  assert.match(root.innerHTML, /42/);
  assert.match(root.innerHTML, /Apply dispatch started/);
  assert.match(root.innerHTML, /apply/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FAPPROVAL-REQUEST\.json/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FAUTO-RECOVERY\.md/);
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
  assert.match(styles, /\.dashboard-attention-panel/);
  assert.match(styles, /\.dashboard-attention-item--critical/);
  assert.match(styles, /\.dashboard-current-run-panel/);
  assert.match(styles, /\.dashboard-current-run-details/);
  assert.match(styles, /\.dashboard-current-run-activity--warning/);
  assert.match(styles, /\.dashboard-current-run-pointer-links/);
  assert.match(styles, /\.dashboard-why-task-panel/);
  assert.match(styles, /\.dashboard-why-task-grid/);
  assert.match(styles, /\.dashboard-why-task-risk-badge--high/);
  assert.match(styles, /\.dashboard-why-task-criterion--passed/);
  assert.match(styles, /\.dashboard-activity-feed/);
  assert.match(styles, /\.dashboard-activity-summary/);
  assert.match(styles, /\.dashboard-activity-count--approval/);
  assert.match(styles, /\.dashboard-activity-pill--recovery/);
  assert.match(styles, /\.dashboard-activity-details/);
  assert.match(styles, /max-height:\s*min\(680px,\s*72vh\)/);
  assert.match(styles, /overflow-y:\s*auto/);
  assert.match(styles, /\.dashboard-artifact-link/);
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
  await testCurrentRunPanelRendersActiveOperationDetails();
  await testWhyThisTaskPanelRendersTaskPlanEvidence();
  await testAttentionPanelRendersRequiredActionDetails();
  await testActivityFeedRendersExecutionHistory();
  await testStylesExposeConnectionStates();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
