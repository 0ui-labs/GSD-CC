(function () {
  const STATE_ENDPOINT = '/api/state';
  const EVENTS_ENDPOINT = '/api/events';
  const POLL_INTERVAL_MS = 5000;
  const CONNECTION_STATES = {
    loading: {
      label: 'Loading',
      detail: 'Fetching state'
    },
    connected: {
      label: 'Connected',
      detail: 'Live updates'
    },
    reconnecting: {
      label: 'Reconnecting',
      detail: 'Waiting for events'
    },
    disconnected: {
      label: 'Disconnected',
      detail: 'Polling state'
    }
  };
  const ATTENTION_SEVERITY_ORDER = ['critical', 'warning', 'info'];
  const ACTIVITY_CATEGORY_LABELS = {
    approval: 'Approval',
    budget: 'Budget',
    commit: 'Commit',
    dispatch: 'Dispatch',
    error: 'Error',
    lifecycle: 'Lifecycle',
    other: 'Other',
    recovery: 'Recovery',
    task: 'Task'
  };
  const ACTIVITY_CATEGORY_ORDER = [
    'error',
    'approval',
    'recovery',
    'task',
    'dispatch',
    'lifecycle',
    'commit',
    'budget',
    'other'
  ];
  const SLICE_RISK_ORDER = ['high', 'medium', 'low', 'unknown'];
  const SLICE_STATUS_ORDER = [
    'unified',
    'apply-complete',
    'running',
    'planned',
    'pending',
    'blocked',
    'failed',
    'unknown'
  ];
  const TASK_STATE_LABELS = {
    completed: 'Completed task',
    current: 'Current task',
    pending: 'Pending task'
  };
  const root = document.querySelector('[data-dashboard-root]');

  if (!root) {
    return;
  }

  const app = {
    connection: 'loading',
    error: '',
    eventSource: null,
    lastUpdatedAt: null,
    model: null,
    pollTimer: null,
    selectedSliceId: '',
    selectedTaskId: ''
  };

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function displayValue(value, fallback) {
    const text = String(value === null || value === undefined ? '' : value).trim();

    return text ? text : fallback;
  }

  function knownDisplayValue(value) {
    const text = displayValue(value, '');

    return text && text !== 'unknown' ? text : '';
  }

  function toClassName(value) {
    return String(value || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
  }

  function formatDate(date) {
    if (!date) {
      return 'Not updated yet';
    }

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatDateAttribute(date) {
    return date ? ` datetime="${escapeHtml(date.toISOString())}"` : '';
  }

  function formatActivityTime(value) {
    const date = value ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return 'No time';
    }

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatActivityTimestamp(value) {
    const date = value ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return 'No timestamp';
    }

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatTimestampAttribute(value) {
    const date = value ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return '';
    }

    return ` datetime="${escapeHtml(date.toISOString())}"`;
  }

  function formatModelTime(value) {
    const date = value ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return displayValue(value, '');
    }

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRuntimeSince(value) {
    const started = value ? new Date(value) : null;

    if (!started || Number.isNaN(started.getTime())) {
      return '';
    }

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - started.getTime()) / 1000)
    );
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
  }

  function normalizeSeverity(value) {
    const severity = toClassName(value);

    return ATTENTION_SEVERITY_ORDER.includes(severity) ? severity : 'info';
  }

  function normalizeActivityCategory(value) {
    const category = toClassName(value);

    return ACTIVITY_CATEGORY_LABELS[category] ? category : 'other';
  }

  function sortAttentionItems(attention) {
    const items = Array.isArray(attention) ? attention : [];

    return items
      .map((item, index) => ({
        item: item || {},
        index
      }))
      .sort((left, right) => {
        const leftRank = ATTENTION_SEVERITY_ORDER.indexOf(
          normalizeSeverity(left.item.severity)
        );
        const rightRank = ATTENTION_SEVERITY_ORDER.indexOf(
          normalizeSeverity(right.item.severity)
        );

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return left.index - right.index;
      })
      .map((entry) => entry.item);
  }

  function artifactHref(source) {
    const path = displayValue(source, '');

    if (!path || !path.startsWith('.gsd/')) {
      return '';
    }

    return `/api/artifact?path=${encodeURIComponent(path)}`;
  }

  function renderArtifactLink(source, label) {
    const path = displayValue(source, '');

    if (!path) {
      return '';
    }

    const text = label || path;
    const href = artifactHref(path);

    if (!href) {
      return [
        '<span class="dashboard-artifact-link dashboard-artifact-link--plain">',
        escapeHtml(text),
        '</span>'
      ].join('');
    }

    return [
      `<a class="dashboard-artifact-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">`,
      escapeHtml(text),
      '</a>'
    ].join('');
  }

  function currentTaskPlanPath(currentTask) {
    const id = knownDisplayValue(currentTask && currentTask.id);

    if (!/^S[0-9]+-T[0-9]+$/i.test(id)) {
      return '';
    }

    return `.gsd/${id}-PLAN.xml`;
  }

  function normalizeTaskId(value) {
    return displayValue(value, '').toUpperCase();
  }

  function splitTaskPlanId(value) {
    const match = normalizeTaskId(value).match(/^(S[0-9]+)-(T[0-9]+)$/);

    if (!match) {
      return null;
    }

    return {
      slice: match[1],
      task: match[2]
    };
  }

  function sliceTaskPlanId(slice, task) {
    const existingPlanId = knownDisplayValue(task && task.task_id);

    if (/^S[0-9]+-T[0-9]+$/i.test(existingPlanId)) {
      return existingPlanId;
    }

    const taskId = knownDisplayValue(task && task.id);

    if (/^S[0-9]+-T[0-9]+$/i.test(taskId)) {
      return taskId;
    }

    const sliceId = knownDisplayValue(slice && slice.id);

    if (sliceId && /^T[0-9]+$/i.test(taskId)) {
      return `${sliceId}-${taskId}`;
    }

    return taskId || existingPlanId;
  }

  function taskSelectionId(slice, task) {
    return sliceTaskPlanId(slice, task) || knownDisplayValue(task && task.id);
  }

  function uniqueValues(values) {
    const seen = new Set();
    const unique = [];

    for (const value of values) {
      const normalized = displayValue(value, '');

      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        unique.push(normalized);
      }
    }

    return unique;
  }

  function normalizeRiskLevel(value) {
    const level = toClassName(value);

    return SLICE_RISK_ORDER.includes(level) ? level : 'unknown';
  }

  function normalizeSliceId(value) {
    return displayValue(value, '').toUpperCase();
  }

  function sliceTaskItems(slice) {
    const tasks = slice && slice.tasks ? slice.tasks : {};

    return Array.isArray(tasks.items) ? tasks.items : [];
  }

  function countSliceTasks(slice) {
    const tasks = slice && slice.tasks ? slice.tasks : {};
    const total = Number(tasks.total);

    if (Number.isFinite(total) && total > 0) {
      return total;
    }

    return sliceTaskItems(slice).length;
  }

  function sliceAcceptanceSummary(slice) {
    const summary = slice && slice.acceptance_criteria
      ? slice.acceptance_criteria
      : {};
    const total = Number(summary.total);

    if (Number.isFinite(total) && total > 0) {
      return {
        total,
        passed: Number(summary.passed) || 0,
        partial: Number(summary.partial) || 0,
        failed: Number(summary.failed) || 0,
        pending: Number(summary.pending) || 0
      };
    }

    return sliceTaskItems(slice).reduce((counts, task) => {
      const taskAc = task && task.acceptance_criteria
        ? Number(task.acceptance_criteria.total)
        : 0;

      counts.total += Number.isFinite(taskAc) ? taskAc : 0;
      return counts;
    }, {
      total: 0,
      passed: 0,
      partial: 0,
      failed: 0,
      pending: 0
    });
  }

  function sliceRiskSummary(slice) {
    const tasks = slice && slice.tasks ? slice.tasks : {};
    const risk = tasks.risk && typeof tasks.risk === 'object'
      ? tasks.risk
      : null;

    if (risk) {
      return SLICE_RISK_ORDER.reduce((summary, level) => {
        summary[level] = Number(risk[level]) || 0;
        return summary;
      }, {});
    }

    return sliceTaskItems(slice).reduce((summary, task) => {
      const level = normalizeRiskLevel(task && task.risk && task.risk.level);
      summary[level] += 1;
      return summary;
    }, {
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0
    });
  }

  function findSliceById(slices, sliceId) {
    const normalized = normalizeSliceId(sliceId);

    return slices.find((slice) => normalizeSliceId(slice && slice.id) === normalized)
      || null;
  }

  function taskMatchesId(slice, task, taskId) {
    const normalized = normalizeTaskId(taskId);

    if (!normalized) {
      return false;
    }

    return [
      task && task.id,
      task && task.task_id,
      sliceTaskPlanId(slice, task)
    ].some((value) => normalizeTaskId(value) === normalized);
  }

  function currentTaskParts(model) {
    const currentTask = model && model.current_task ? model.current_task : {};
    const current = model && model.current ? model.current : {};
    const taskPlanId = knownDisplayValue(currentTask.id);
    const parsed = splitTaskPlanId(taskPlanId);

    if (parsed) {
      return {
        ...parsed,
        planId: taskPlanId
      };
    }

    const slice = knownDisplayValue(current.slice);
    const task = knownDisplayValue(current.task);

    if (!slice || !task) {
      return null;
    }

    const combined = splitTaskPlanId(task) || splitTaskPlanId(`${slice}-${task}`);

    return combined
      ? {
        ...combined,
        planId: `${combined.slice}-${combined.task}`
      }
      : null;
  }

  function taskIsCurrent(model, slice, task) {
    const current = currentTaskParts(model);

    if (!current) {
      return false;
    }

    return normalizeSliceId(slice && slice.id) === current.slice
      && (
        normalizeTaskId(task && task.id) === current.task
        || normalizeTaskId(task && task.task_id) === current.planId
        || normalizeTaskId(sliceTaskPlanId(slice, task)) === current.planId
      );
  }

  function taskHasSummary(task) {
    const artifacts = task && task.artifacts ? task.artifacts : {};

    return Boolean(knownDisplayValue(artifacts.summary));
  }

  function taskState(model, slice, task) {
    if (taskIsCurrent(model, slice, task)) {
      return 'current';
    }

    return taskHasSummary(task) ? 'completed' : 'pending';
  }

  function findTaskById(slice, taskId) {
    return sliceTaskItems(slice).find((task) => taskMatchesId(slice, task, taskId))
      || null;
  }

  function defaultSelectedTask(model, slice) {
    const items = sliceTaskItems(slice);

    if (items.length === 0) {
      return null;
    }

    return items.find((task) => taskIsCurrent(model, slice, task))
      || items[0]
      || null;
  }

  function defaultSelectedSlice(slices, current) {
    return slices.find((slice) => slice && slice.current)
      || findSliceById(slices, current && current.slice)
      || slices[0]
      || null;
  }

  function ensureSelectedTask(model, selectedSlice) {
    if (!selectedSlice) {
      app.selectedTaskId = '';
      return;
    }

    if (app.selectedTaskId && findTaskById(selectedSlice, app.selectedTaskId)) {
      return;
    }

    const selected = defaultSelectedTask(model, selectedSlice);
    app.selectedTaskId = selected ? taskSelectionId(selectedSlice, selected) : '';
  }

  function ensureSelectedSlice(model) {
    const progress = model && model.progress ? model.progress : {};
    const slices = Array.isArray(progress.slices) ? progress.slices : [];

    if (slices.length === 0) {
      app.selectedSliceId = '';
      return;
    }

    if (app.selectedSliceId && findSliceById(slices, app.selectedSliceId)) {
      ensureSelectedTask(model, findSliceById(slices, app.selectedSliceId));
      return;
    }

    const selected = defaultSelectedSlice(slices, model && model.current);
    app.selectedSliceId = selected ? selected.id : '';
    ensureSelectedTask(model, selected);
  }

  function setConnection(connection) {
    app.connection = connection;
    render();
  }

  function setModel(model) {
    app.model = model;
    app.error = model && model.error && model.error.message
      ? model.error.message
      : '';
    app.lastUpdatedAt = new Date();
    ensureSelectedSlice(model);
    render();
  }

  function renderConnection() {
    const connection = CONNECTION_STATES[app.connection]
      || CONNECTION_STATES.disconnected;
    const updatedLabel = app.lastUpdatedAt
      ? `Updated ${formatDate(app.lastUpdatedAt)}`
      : formatDate(app.lastUpdatedAt);

    return [
      `<div class="dashboard-connection dashboard-connection--${app.connection}" role="status">`,
      '  <span class="dashboard-connection-dot" aria-hidden="true"></span>',
      '  <span>',
      `    <strong>${escapeHtml(connection.label)}</strong>`,
      `    <span>${escapeHtml(connection.detail)}</span>`,
      '  </span>',
      `  <time${formatDateAttribute(app.lastUpdatedAt)}>${escapeHtml(updatedLabel)}</time>`,
      '</div>'
    ].join('');
  }

  function renderEmptyState(title, detail) {
    return [
      '<div class="dashboard-empty-state">',
      `  <strong>${escapeHtml(title)}</strong>`,
      `  <p>${escapeHtml(detail)}</p>`,
      '</div>'
    ].join('');
  }

  function renderField(label, value) {
    return [
      '<div class="dashboard-field">',
      `  <dt>${escapeHtml(label)}</dt>`,
      `  <dd>${escapeHtml(displayValue(value, 'unknown'))}</dd>`,
      '</div>'
    ].join('');
  }

  function renderMetric(label, value) {
    return [
      '<div class="dashboard-metric">',
      `  <strong>${escapeHtml(displayValue(value, '0'))}</strong>`,
      `  <span>${escapeHtml(label)}</span>`,
      '</div>'
    ].join('');
  }

  function renderStatusBadge(label, value, options = {}) {
    const text = displayValue(value, options.fallback || 'unknown');
    const tone = options.tone || text;
    const detail = options.detail
      ? `<small>${escapeHtml(options.detail)}</small>`
      : '';

    return [
      `<span class="dashboard-status-badge dashboard-status-badge--${toClassName(tone)}">`,
      `  <span>${escapeHtml(label)}</span>`,
      `  <strong>${escapeHtml(text)}</strong>`,
      detail,
      '</span>'
    ].join('');
  }

  function renderAutomationBadge(automation) {
    const scope = displayValue(automation.scope, '');
    const unit = displayValue(automation.unit, '');
    const detail = [scope, unit].filter(Boolean).join(' / ');

    return renderStatusBadge('Auto', automation.status, {
      detail,
      fallback: 'inactive',
      tone: automation.status
    });
  }

  function renderTopStatusStrip(current, automation) {
    return [
      '<div class="dashboard-status-strip" aria-label="Current project position">',
      renderStatusBadge('Milestone', current.milestone),
      renderStatusBadge('Slice', current.slice),
      renderStatusBadge('Task', current.task),
      renderStatusBadge('Phase', current.phase, {
        tone: current.phase
      }),
      renderAutomationBadge(automation),
      '</div>'
    ].join('');
  }

  function renderTopBar(project, current, automation) {
    const title = displayValue(project.name, 'Dashboard loading');

    return [
      '<header class="dashboard-topbar">',
      '  <div class="dashboard-topbar-main">',
      '    <div class="dashboard-title-group">',
      '      <p class="dashboard-kicker">GSD-CC Dashboard</p>',
      `      <h1>${escapeHtml(title)}</h1>`,
      '    </div>',
      renderConnection(),
      '  </div>',
      renderTopStatusStrip(current, automation),
      '</header>'
    ].join('');
  }

  function renderNavItem(item, active) {
    const activeClass = active ? ' dashboard-nav-link--active' : '';
    const current = active ? ' aria-current="page"' : '';

    return [
      `<a class="dashboard-nav-link${activeClass}" href="#${escapeHtml(item.id)}"${current}>`,
      `  <span>${escapeHtml(item.label)}</span>`,
      `  <small>${escapeHtml(item.meta)}</small>`,
      '</a>'
    ].join('');
  }

  function renderSidebar(model, current) {
    const activity = Array.isArray(model.activity) ? model.activity : [];
    const attention = sortAttentionItems(model.attention);
    const navItems = [
      {
        id: 'attention',
        label: 'Attention',
        meta: attention.length > 0 ? `${attention.length} items` : 'clear'
      },
      {
        id: 'current-run',
        label: 'Run',
        meta: displayValue(current.phase, 'unknown')
      },
      {
        id: 'progress',
        label: 'Progress',
        meta: displayValue(current.slice, 'no slice')
      },
      {
        id: 'activity',
        label: 'Activity',
        meta: activity.length > 0 ? `${activity.length} events` : 'empty'
      },
      {
        id: 'context',
        label: 'Context',
        meta: displayValue(model.project && model.project.project_type, 'project')
      }
    ];

    return [
      '<nav class="dashboard-sidebar" aria-label="Dashboard sections">',
      '  <div class="dashboard-nav-list">',
      ...navItems.map((item, index) => renderNavItem(item, index === 0)),
      '  </div>',
      '</nav>'
    ].join('');
  }

  function renderRegionHeader(title, detail) {
    return [
      '<header class="dashboard-region-header">',
      `  <h2>${escapeHtml(title)}</h2>`,
      detail ? `  <p>${escapeHtml(detail)}</p>` : '',
      '</header>'
    ].join('');
  }

  function renderRunSummary(current) {
    return [
      '<section class="dashboard-run-strip" aria-label="Current state">',
      '  <dl class="dashboard-fields">',
      renderField('Milestone', current.milestone),
      renderField('Slice', current.slice),
      renderField('Task', current.task),
      renderField('Phase', current.phase),
      '  </dl>',
      `  <p class="dashboard-next-action">${escapeHtml(displayValue(
        current.next_action,
        'Waiting for project state.'
      ))}</p>`,
      '</section>'
    ].join('');
  }

  function describeCurrentTaskId(model, current) {
    const currentTask = model.current_task || {};
    const taskPlanId = knownDisplayValue(currentTask.id);

    if (taskPlanId) {
      return taskPlanId;
    }

    const slice = knownDisplayValue(current.slice);
    const task = knownDisplayValue(current.task);

    if (slice && task) {
      return `${slice}/${task}`;
    }

    return 'unknown';
  }

  function resolveCurrentTaskTitle(model, current) {
    const currentTask = model.current_task || {};

    return knownDisplayValue(current.task_name)
      || knownDisplayValue(currentTask.name)
      || knownDisplayValue(current.task)
      || 'Unknown task';
  }

  function resolveCurrentRunUnit(model, current, automation) {
    const activity = current.activity || {};

    return knownDisplayValue(activity.unit)
      || knownDisplayValue(automation.unit)
      || describeCurrentTaskId(model, current);
  }

  function resolveCurrentRunActivity(model, current) {
    const activity = current.activity || null;

    if (activity) {
      return activity;
    }

    return Array.isArray(model.activity) && model.activity.length > 0
      ? model.activity[0]
      : null;
  }

  function resolveDispatchPhase(model, current) {
    const activity = resolveCurrentRunActivity(model, current);
    const recovery = model.evidence && model.evidence.latest_recovery
      ? model.evidence.latest_recovery
      : {};

    return knownDisplayValue(activity && activity.dispatch_phase)
      || knownDisplayValue(recovery.dispatch_phase)
      || 'none';
  }

  function renderCurrentRunActivity(activity) {
    if (!activity) {
      return [
        '<div class="dashboard-current-run-activity dashboard-current-run-activity--empty">',
        '  <span>Latest event</span>',
        '  <strong>No live activity yet</strong>',
        '  <small>Events appear after auto-mode writes them.</small>',
        '</div>'
      ].join('');
    }

    const meta = [
      displayValue(activity.category, 'event'),
      displayValue(activity.type, 'unknown')
    ].join(' - ');

    return [
      `<div class="dashboard-current-run-activity dashboard-current-run-activity--${toClassName(activity.severity)}">`,
      '  <span>Latest event</span>',
      `  <strong>${escapeHtml(displayValue(activity.message, 'Activity recorded.'))}</strong>`,
      `  <small>${escapeHtml(formatActivityTime(activity.timestamp))} / ${escapeHtml(meta)}</small>`,
      '</div>'
    ].join('');
  }

  function currentRunPointerSources(model, activity) {
    const evidence = model.evidence || {};
    const recovery = evidence.latest_recovery || null;
    const sources = [];

    if (recovery) {
      sources.push({
        label: 'Recovery',
        path: recovery.report || recovery.source
      });
      sources.push({
        label: 'Log',
        path: recovery.log_file
      });
    }

    if (activity) {
      sources.push({
        label: 'Event',
        path: activity.source
      });
      sources.push({
        label: 'Artifact',
        path: activity.artifact
      });

      if (Array.isArray(activity.artifacts)) {
        activity.artifacts.forEach((path) => {
          sources.push({
            label: 'Artifact',
            path
          });
        });
      }
    }

    const seen = new Set();

    return sources.filter((source) => {
      const path = displayValue(source.path, '');

      if (!path || seen.has(path)) {
        return false;
      }

      seen.add(path);
      return true;
    });
  }

  function renderCurrentRunPointer(model, activity) {
    const sources = currentRunPointerSources(model, activity);

    if (sources.length === 0) {
      return [
        '<div class="dashboard-current-run-pointer dashboard-current-run-pointer--empty">',
        '  <span>Latest pointer</span>',
        '  <strong>No log pointer yet</strong>',
        '</div>'
      ].join('');
    }

    return [
      '<div class="dashboard-current-run-pointer">',
      '  <span>Latest pointer</span>',
      '  <div class="dashboard-current-run-pointer-links">',
      ...sources.slice(0, 4).map((source) => renderArtifactLink(source.path, source.label)),
      sources.length > 4
        ? `    <small>${sources.length - 4} more</small>`
        : '',
      '  </div>',
      '</div>'
    ].join('');
  }

  function renderCurrentRunPanel(model, current, automation) {
    const activity = resolveCurrentRunActivity(model, current);
    const isActive = automation.status === 'active';
    const runtime = isActive ? formatRuntimeSince(automation.started_at) : '';
    const pid = isActive && automation.pid ? automation.pid : 'inactive';

    return [
      '<section class="dashboard-current-run-panel" aria-label="Current run details">',
      '  <div class="dashboard-current-run-focus">',
      '    <span>Current task</span>',
      `    <h3>${escapeHtml(resolveCurrentTaskTitle(model, current))}</h3>`,
      `    <small>${escapeHtml(resolveCurrentRunUnit(model, current, automation))}</small>`,
      '  </div>',
      '  <dl class="dashboard-current-run-details">',
      renderField('Current phase', current.phase),
      renderField('Dispatch phase', resolveDispatchPhase(model, current)),
      renderField('PID', pid),
      renderField('Runtime', runtime || (isActive ? 'starting' : 'inactive')),
      '  </dl>',
      renderCurrentRunActivity(activity),
      renderCurrentRunPointer(model, activity),
      '</section>'
    ].join('');
  }

  function renderDetail(label, value) {
    const text = displayValue(value, '');

    if (!text) {
      return '';
    }

    return [
      '<div class="dashboard-attention-detail">',
      `  <dt>${escapeHtml(label)}</dt>`,
      `  <dd>${escapeHtml(text)}</dd>`,
      '</div>'
    ].join('');
  }

  function renderDetailList(label, values) {
    const items = uniqueValues(Array.isArray(values) ? values : []);

    if (items.length === 0) {
      return '';
    }

    return [
      '<div class="dashboard-attention-detail dashboard-attention-detail--list">',
      `  <dt>${escapeHtml(label)}</dt>`,
      '  <dd>',
      '    <ul>',
      ...items.slice(0, 4).map((item) => `      <li>${escapeHtml(item)}</li>`),
      items.length > 4
        ? `      <li>${items.length - 4} more</li>`
        : '',
      '    </ul>',
      '  </dd>',
      '</div>'
    ].join('');
  }

  function renderArtifactDetail(label, sources) {
    const links = uniqueValues(Array.isArray(sources) ? sources : [sources])
      .map((source) => renderArtifactLink(source))
      .filter(Boolean);

    if (links.length === 0) {
      return '';
    }

    return [
      '<div class="dashboard-attention-detail dashboard-attention-detail--artifacts">',
      `  <dt>${escapeHtml(label)}</dt>`,
      `  <dd>${links.join('')}</dd>`,
      '</div>'
    ].join('');
  }

  function renderApprovalDetails(approval) {
    if (!approval) {
      return '';
    }

    return [
      renderDetail('Unit', approval.unit),
      renderDetail('Risk', approval.risk_level),
      renderDetail('Reason', approval.risk_reason),
      renderDetail('Created', formatModelTime(approval.created_at)),
      renderDetailList('Approval reasons', approval.reasons),
      renderArtifactDetail('Artifacts', [
        approval.source,
        approval.plan
      ])
    ].join('');
  }

  function renderRecoveryDetails(recovery) {
    if (!recovery) {
      return '';
    }

    return [
      renderDetail('Unit', recovery.unit),
      renderDetail('Reason', recovery.reason),
      renderDetail('Phase', recovery.phase),
      renderDetail('Dispatch', recovery.dispatch_phase),
      renderDetail('Stopped', formatModelTime(recovery.stopped_at)),
      renderDetail('Message', recovery.message),
      renderDetailList('Uncommitted files', recovery.uncommitted_files),
      renderArtifactDetail('Artifacts', [
        recovery.source,
        recovery.report,
        recovery.log_file
      ])
    ].join('');
  }

  function renderLockDetails(automation) {
    return [
      renderDetail('Unit', automation.unit),
      renderDetail('PID', automation.pid),
      renderDetail('Started', formatModelTime(automation.started_at))
    ].join('');
  }

  function renderPhaseDetails(current) {
    return [
      renderDetail('Phase', current.phase),
      renderDetail('Milestone', current.milestone),
      renderDetail('Slice', current.slice),
      renderDetail('Task', current.task)
    ].join('');
  }

  function renderUnifyDetails(current, item) {
    return [
      renderDetail('Slice', current.slice),
      renderDetail('Expected report', item.source)
    ].join('');
  }

  function renderAttentionDetails(item, model) {
    const evidence = model.evidence || {};
    const current = model.current || {};
    const automation = model.automation || {};
    const id = displayValue(item.id, '');
    let details = '';

    if (id === 'approval-required') {
      details = renderApprovalDetails(evidence.approval_request);
    } else if (id === 'auto-recovery') {
      details = renderRecoveryDetails(evidence.latest_recovery);
    } else if (id === 'auto-lock-stale') {
      details = [
        renderLockDetails(automation),
        renderArtifactDetail('Artifacts', item.source)
      ].join('');
    } else if (id.startsWith('phase-')) {
      details = [
        renderPhaseDetails(current),
        renderArtifactDetail('Artifacts', item.source)
      ].join('');
    } else if (id === 'unify-required') {
      details = renderUnifyDetails(current, item);
    } else {
      details = renderArtifactDetail('Artifacts', item.source);
    }

    if (!details) {
      return '';
    }

    return `<dl class="dashboard-attention-details">${details}</dl>`;
  }

  function renderAttentionItem(item, model) {
    const severity = normalizeSeverity(item.severity);
    const action = displayValue(item.recommended_action, '');

    return [
      `<li class="dashboard-attention-item dashboard-attention-item--${severity}">`,
      '  <div class="dashboard-attention-item-header">',
      `    <span class="dashboard-attention-severity">${escapeHtml(severity)}</span>`,
      `    <strong>${escapeHtml(displayValue(item.title, 'Attention'))}</strong>`,
      '  </div>',
      `  <p>${escapeHtml(displayValue(item.message, 'Review project state.'))}</p>`,
      action
        ? `  <p class="dashboard-attention-action">${escapeHtml(action)}</p>`
        : '',
      renderAttentionDetails(item, model),
      '</li>'
    ].join('');
  }

  function renderAttentionSummary(attention) {
    const counts = attention.reduce((summary, item) => {
      const severity = normalizeSeverity(item.severity);
      summary[severity] += 1;
      return summary;
    }, {
      critical: 0,
      warning: 0,
      info: 0
    });

    return [
      '<div class="dashboard-attention-summary" aria-label="Attention summary">',
      ...ATTENTION_SEVERITY_ORDER
        .filter((severity) => counts[severity] > 0)
        .map((severity) => [
          `<span class="dashboard-attention-count dashboard-attention-count--${severity}">`,
          `  <strong>${counts[severity]}</strong>`,
          `  <span>${escapeHtml(severity)}</span>`,
          '</span>'
        ].join('')),
      '</div>'
    ].join('');
  }

  function renderAttentionPanel(model) {
    const attention = sortAttentionItems(model.attention);

    if (attention.length === 0) {
      return renderEmptyState(
        'No attention items',
        'Blockers, approvals, and recovery actions will appear here.'
      );
    }

    return [
      renderAttentionSummary(attention),
      '<ul class="dashboard-attention-list">',
      ...attention.map((item) => renderAttentionItem(item, model)),
      '</ul>'
    ].join('');
  }

  function renderWhyTaskLines(items, emptyText, options = {}) {
    const values = uniqueValues(Array.isArray(items) ? items : []);

    if (values.length === 0) {
      return `<p class="dashboard-why-task-empty">${escapeHtml(emptyText)}</p>`;
    }

    return [
      '<ul class="dashboard-why-task-list">',
      ...values.map((item) => [
        '  <li>',
        options.code
          ? `    <code>${escapeHtml(item)}</code>`
          : `    <span>${escapeHtml(item)}</span>`,
        '  </li>'
      ].join('')),
      '</ul>'
    ].join('');
  }

  function renderWhyTaskBlock(title, body) {
    return [
      '<section class="dashboard-why-task-block">',
      `  <h4>${escapeHtml(title)}</h4>`,
      body,
      '</section>'
    ].join('');
  }

  function renderWhyTaskRisk(risk) {
    const safeRisk = risk || {};
    const level = displayValue(safeRisk.level, 'unknown');
    const reason = displayValue(safeRisk.reason, '');

    return [
      '<div class="dashboard-why-task-risk">',
      `  <span class="dashboard-why-task-risk-badge dashboard-why-task-risk-badge--${toClassName(level)}">`,
      '    <span>Risk level</span>',
      `    <strong>${escapeHtml(level)}</strong>`,
      '  </span>',
      reason
        ? `  <p>${escapeHtml(reason)}</p>`
        : '  <p class="dashboard-why-task-empty">No risk reason recorded.</p>',
      '</div>'
    ].join('');
  }

  function renderWhyTaskCriteria(criteria) {
    const items = Array.isArray(criteria) ? criteria : [];

    if (items.length === 0) {
      return '<p class="dashboard-why-task-empty">No acceptance criteria recorded.</p>';
    }

    return [
      '<ul class="dashboard-why-task-criteria">',
      ...items.map((criterion) => {
        const status = displayValue(criterion && criterion.status, '');

        return [
          `  <li class="dashboard-why-task-criterion dashboard-why-task-criterion--${toClassName(status || 'pending')}">`,
          `    <strong>${escapeHtml(displayValue(criterion && criterion.id, 'AC'))}</strong>`,
          `    <p>${escapeHtml(displayValue(
            criterion && criterion.text,
            'Acceptance criterion'
          ))}</p>`,
          status ? `    <small>${escapeHtml(status)}</small>` : '',
          '  </li>'
        ].join('');
      }),
      '</ul>'
    ].join('');
  }

  function renderWhyThisTaskPanel(currentTask) {
    if (!currentTask || currentTask.id === 'unknown') {
      return renderEmptyState(
        'No current task plan loaded',
        'Load a GSD task plan to see the active work package.'
      );
    }

    const taskPlanLink = renderArtifactLink(currentTaskPlanPath(currentTask), 'Task plan');

    return [
      '<section class="dashboard-why-task-panel" aria-label="Why this task">',
      '  <header class="dashboard-why-task-header">',
      '    <div>',
      `      <span>${escapeHtml(displayValue(currentTask.id, 'unknown'))}</span>`,
      `      <h3>${escapeHtml(displayValue(currentTask.name, 'Untitled task'))}</h3>`,
      '    </div>',
      taskPlanLink,
      '  </header>',
      '  <div class="dashboard-why-task-grid">',
      renderWhyTaskBlock(
        'Action summary',
        renderWhyTaskLines(
          currentTask.action,
          'No task action recorded.'
        )
      ),
      renderWhyTaskBlock(
        'Risk',
        renderWhyTaskRisk(currentTask.risk)
      ),
      renderWhyTaskBlock(
        'Acceptance criteria covered',
        renderWhyTaskCriteria(currentTask.acceptance_criteria)
      ),
      renderWhyTaskBlock(
        'Verify command',
        renderWhyTaskLines(
          currentTask.verify,
          'No verify command recorded.',
          { code: true }
        )
      ),
      '  </div>',
      '</section>'
    ].join('');
  }

  function renderSliceStat(label, value) {
    return [
      '<span class="dashboard-slice-stat">',
      `  <strong>${escapeHtml(displayValue(value, '0'))}</strong>`,
      `  <span>${escapeHtml(label)}</span>`,
      '</span>'
    ].join('');
  }

  function renderSliceStatusSummary(slices) {
    const counts = slices.reduce((summary, slice) => {
      const status = toClassName(slice && slice.status);
      summary[status] = (summary[status] || 0) + 1;
      return summary;
    }, {});
    const statuses = [
      ...SLICE_STATUS_ORDER.filter((status) => counts[status] > 0),
      ...Object.keys(counts).filter((status) => !SLICE_STATUS_ORDER.includes(status))
    ];

    if (statuses.length === 0) {
      return '';
    }

    return [
      '<div class="dashboard-slice-status-summary" aria-label="Slice statuses">',
      ...statuses.map((status) => [
        `<span class="dashboard-slice-status-count dashboard-slice-status-count--${status}">`,
        `  <strong>${counts[status]}</strong>`,
        `  <span>${escapeHtml(status)}</span>`,
        '</span>'
      ].join('')),
      '</div>'
    ].join('');
  }

  function renderSliceRiskDistribution(riskSummary) {
    const entries = SLICE_RISK_ORDER
      .map((level) => ({
        level,
        count: Number(riskSummary && riskSummary[level]) || 0
      }))
      .filter((entry) => entry.count > 0);

    if (entries.length === 0) {
      return [
        '<span class="dashboard-slice-risk dashboard-slice-risk--empty">',
        '  <span>No risk data</span>',
        '</span>'
      ].join('');
    }

    return entries.map((entry) => [
      `<span class="dashboard-slice-risk dashboard-slice-risk--${entry.level}">`,
      `  <strong>${entry.count}</strong>`,
      `  <span>${escapeHtml(entry.level)}</span>`,
      '</span>'
    ].join('')).join('');
  }

  function renderSliceRoadmapItem(slice, selected) {
    const currentClass = slice.current ? ' dashboard-slice-roadmap-item--current' : '';
    const selectedClass = selected ? ' dashboard-slice-roadmap-item--selected' : '';
    const currentLabel = slice.current
      ? '<em>Current</em>'
      : '';
    const acSummary = sliceAcceptanceSummary(slice);
    const riskSummary = sliceRiskSummary(slice);

    return [
      `<button type="button" class="dashboard-slice-roadmap-item${currentClass}${selectedClass}" data-dashboard-slice-id="${escapeHtml(slice.id)}" aria-pressed="${selected ? 'true' : 'false'}">`,
      '  <span class="dashboard-slice-roadmap-heading">',
      `    <strong>${escapeHtml(displayValue(slice.id, 'Slice'))}</strong>`,
      `    <span>${escapeHtml(displayValue(slice.name, 'Untitled slice'))}</span>`,
      currentLabel,
      '  </span>',
      `  <span class="dashboard-slice-status dashboard-slice-status--${toClassName(slice.status)}">${escapeHtml(displayValue(slice.status, 'unknown'))}</span>`,
      '  <span class="dashboard-slice-roadmap-stats">',
      renderSliceStat('tasks', countSliceTasks(slice)),
      renderSliceStat('ACs', acSummary.total),
      '  </span>',
      '  <span class="dashboard-slice-roadmap-risks" aria-label="Risk distribution">',
      renderSliceRiskDistribution(riskSummary),
      '  </span>',
      '</button>'
    ].join('');
  }

  function renderSliceRoadmap(slices, selectedSlice) {
    const selectedId = selectedSlice ? normalizeSliceId(selectedSlice.id) : '';

    return [
      '<div class="dashboard-slice-roadmap" role="list" aria-label="Slice roadmap">',
      ...slices.map((slice) => [
        '<div role="listitem">',
        renderSliceRoadmapItem(
          slice,
          normalizeSliceId(slice && slice.id) === selectedId
        ),
        '</div>'
      ].join('')),
      '</div>'
    ].join('');
  }

  function renderSliceAcceptanceDetails(acSummary) {
    if (!acSummary.total) {
      return '<p class="dashboard-slice-detail-empty">No acceptance criteria recorded.</p>';
    }

    return [
      '<div class="dashboard-slice-detail-ac">',
      renderSliceStat('passed', acSummary.passed),
      renderSliceStat('partial', acSummary.partial),
      renderSliceStat('failed', acSummary.failed),
      renderSliceStat('pending', acSummary.pending),
      '</div>'
    ].join('');
  }

  function renderSliceArtifacts(slice) {
    const artifacts = slice && slice.artifacts ? slice.artifacts : {};
    const sources = [
      {
        label: 'Roadmap',
        path: artifacts.roadmap
      },
      {
        label: 'Plan',
        path: artifacts.plan
      },
      {
        label: 'UNIFY',
        path: artifacts.unify
      }
    ];
    const links = sources
      .map((source) => renderArtifactLink(source.path, source.label))
      .filter(Boolean);

    if (links.length === 0) {
      return '';
    }

    return [
      '<div class="dashboard-slice-detail-artifacts" aria-label="Slice artifacts">',
      ...links,
      '</div>'
    ].join('');
  }

  function taskAcceptanceItems(task) {
    const criteria = task && task.acceptance_criteria
      ? task.acceptance_criteria
      : {};

    if (Array.isArray(criteria)) {
      return criteria;
    }

    return Array.isArray(criteria.items) ? criteria.items : [];
  }

  function taskAcceptanceTotal(task) {
    const criteria = task && task.acceptance_criteria
      ? task.acceptance_criteria
      : {};
    const total = Number(criteria.total);

    if (Number.isFinite(total) && total > 0) {
      return total;
    }

    return taskAcceptanceItems(task).length;
  }

  function taskSummaryStatus(model, slice, task) {
    if (taskIsCurrent(model, slice, task)) {
      return displayValue(model.current && model.current.phase, 'current');
    }

    return displayValue(task && task.status, taskHasSummary(task) ? 'complete' : 'pending');
  }

  function renderTaskDetailBadge(label, value, tone) {
    return [
      `<span class="dashboard-task-detail-badge dashboard-task-detail-badge--${toClassName(tone || value)}">`,
      `  <span>${escapeHtml(label)}</span>`,
      `  <strong>${escapeHtml(displayValue(value, 'unknown'))}</strong>`,
      '</span>'
    ].join('');
  }

  function renderTaskDetailLines(title, values, emptyText, options = {}) {
    const lines = uniqueValues(Array.isArray(values) ? values : []);

    return [
      '<section class="dashboard-task-detail-block">',
      `  <h4>${escapeHtml(title)}</h4>`,
      lines.length === 0
        ? `  <p class="dashboard-task-detail-empty">${escapeHtml(emptyText)}</p>`
        : [
          '  <ul class="dashboard-task-detail-list">',
          ...lines.map((line) => [
            '    <li>',
            options.code
              ? `      <code>${escapeHtml(line)}</code>`
              : `      <span>${escapeHtml(line)}</span>`,
            '    </li>'
          ].join('')),
          '  </ul>'
        ].join(''),
      '</section>'
    ].join('');
  }

  function renderTaskDetailCriteria(task) {
    const items = taskAcceptanceItems(task);
    const total = taskAcceptanceTotal(task);

    if (items.length === 0) {
      const empty = total > 0
        ? `${total} acceptance criteria recorded; task-plan text is not available.`
        : 'No acceptance criteria recorded.';

      return [
        '<section class="dashboard-task-detail-block">',
        '  <h4>Acceptance criteria</h4>',
        `  <p class="dashboard-task-detail-empty">${escapeHtml(empty)}</p>`,
        '</section>'
      ].join('');
    }

    return [
      '<section class="dashboard-task-detail-block">',
      '  <h4>Acceptance criteria</h4>',
      '  <ul class="dashboard-task-detail-criteria">',
      ...items.map((criterion) => {
        const status = displayValue(criterion && criterion.status, '');
        const source = criterion && criterion.source
          ? renderArtifactLink(
            criterion.source,
            criterion.source_type ? `${criterion.source_type} source` : 'Source'
          )
          : '';

        return [
          `    <li class="dashboard-task-detail-criterion dashboard-task-detail-criterion--${toClassName(status || 'pending')}">`,
          `      <strong>${escapeHtml(displayValue(criterion && criterion.id, 'AC'))}</strong>`,
          `      <p>${escapeHtml(displayValue(
            criterion && criterion.text,
            'Acceptance criterion'
          ))}</p>`,
          status ? `      <small>${escapeHtml(status)}</small>` : '',
          criterion && criterion.evidence
            ? `      <small>${escapeHtml(criterion.evidence)}</small>`
            : '',
          source ? `      <span>${source}</span>` : '',
          '    </li>'
        ].join('');
      }),
      '  </ul>',
      '</section>'
    ].join('');
  }

  function renderTaskDetailArtifacts(model, slice, task) {
    const artifacts = task && task.artifacts ? task.artifacts : {};
    const planPath = artifacts.plan || (
      taskIsCurrent(model, slice, task)
        ? currentTaskPlanPath(model.current_task || {})
        : ''
    );
    const sources = [
      {
        label: 'Task plan',
        path: planPath
      },
      {
        label: 'Summary',
        path: artifacts.summary
      }
    ];
    const links = sources
      .map((source) => renderArtifactLink(source.path, source.label))
      .filter(Boolean);

    if (links.length === 0) {
      return '<p class="dashboard-task-detail-empty">No source artifacts discovered.</p>';
    }

    return links.join('');
  }

  function mergeCurrentTaskDetails(model, slice, task) {
    if (!taskIsCurrent(model, slice, task)) {
      return task || {};
    }

    const currentTask = model.current_task || {};

    if (!currentTask || currentTask.id === 'unknown') {
      return task || {};
    }

    return {
      ...(task || {}),
      id: task && task.id ? task.id : currentTask.id,
      task_id: currentTask.id,
      name: knownDisplayValue(currentTask.name) || (task && task.name),
      risk: currentTask.risk || (task && task.risk),
      files: Array.isArray(currentTask.files) ? currentTask.files : task && task.files,
      boundaries: Array.isArray(currentTask.boundaries)
        ? currentTask.boundaries
        : task && task.boundaries,
      acceptance_criteria: Array.isArray(currentTask.acceptance_criteria)
        ? currentTask.acceptance_criteria
        : task && task.acceptance_criteria,
      action: Array.isArray(currentTask.action) ? currentTask.action : task && task.action,
      verify: Array.isArray(currentTask.verify) ? currentTask.verify : task && task.verify,
      done: currentTask.done || (task && task.done),
      warnings: Array.isArray(currentTask.warnings)
        ? currentTask.warnings
        : task && task.warnings,
      artifacts: {
        ...(task && task.artifacts ? task.artifacts : {}),
        plan: (task && task.artifacts && task.artifacts.plan)
          || currentTaskPlanPath(currentTask)
      }
    };
  }

  function renderSelectedTaskDetail(model, slice, task) {
    if (!task) {
      return renderEmptyState(
        'No task selected',
        'Select a task in this slice to inspect its plan status.'
      );
    }

    const detailTask = mergeCurrentTaskDetails(model, slice, task);
    const state = taskState(model, slice, task);
    const status = taskSummaryStatus(model, slice, task);
    const risk = detailTask.risk || {};
    const riskLevel = normalizeRiskLevel(risk.level);

    return [
      `<section class="dashboard-task-detail dashboard-task-detail--${state}" aria-label="Task detail">`,
      '  <header class="dashboard-task-detail-header">',
      '    <div>',
      `      <span>${escapeHtml(sliceTaskPlanId(slice, detailTask) || displayValue(detailTask.id, 'Task'))}</span>`,
      `      <h3>${escapeHtml(displayValue(detailTask.name, 'Untitled task'))}</h3>`,
      '    </div>',
      `    <strong class="dashboard-task-detail-state">${escapeHtml(TASK_STATE_LABELS[state])}</strong>`,
      '  </header>',
      '  <div class="dashboard-task-detail-summary">',
      renderTaskDetailBadge('Summary status', status, state === 'current' ? 'current' : status),
      renderTaskDetailBadge('Risk', riskLevel, riskLevel),
      '    <div class="dashboard-task-detail-artifacts" aria-label="Source artifacts">',
      renderTaskDetailArtifacts(model, slice, detailTask),
      '    </div>',
      '  </div>',
      risk.reason
        ? `  <p class="dashboard-task-detail-risk">${escapeHtml(risk.reason)}</p>`
        : '',
      '  <div class="dashboard-task-detail-grid">',
      renderTaskDetailLines(
        'Files',
        detailTask.files,
        'No file list recorded.',
        { code: true }
      ),
      renderTaskDetailLines(
        'Boundaries',
        detailTask.boundaries,
        'No boundaries recorded.'
      ),
      renderTaskDetailCriteria(detailTask),
      renderTaskDetailLines(
        'Verify',
        detailTask.verify,
        'No verify command recorded.',
        { code: true }
      ),
      '  </div>',
      detailTask.done
        ? `  <p class="dashboard-task-detail-done">${escapeHtml(detailTask.done)}</p>`
        : '',
      '</section>'
    ].join('');
  }

  function renderSliceTaskList(model, slice, selectedTask) {
    const items = sliceTaskItems(slice);

    if (items.length === 0) {
      return '<p class="dashboard-slice-detail-empty">No task plans discovered for this slice.</p>';
    }

    return [
      '<ol class="dashboard-slice-task-list" aria-label="Slice tasks">',
      ...items.map((task) => {
        const acTotal = taskAcceptanceTotal(task);
        const riskLevel = normalizeRiskLevel(task && task.risk && task.risk.level);
        const state = taskState(model, slice, task);
        const selected = selectedTask && taskMatchesId(
          slice,
          task,
          taskSelectionId(slice, selectedTask)
        );
        const selectedClass = selected ? ' dashboard-slice-task--selected' : '';

        return [
          '<li>',
          `<button type="button" class="dashboard-slice-task dashboard-slice-task--${toClassName(task && task.status)} dashboard-slice-task--${state}${selectedClass}" data-dashboard-task-id="${escapeHtml(taskSelectionId(slice, task))}" aria-pressed="${selected ? 'true' : 'false'}">`,
          '    <span>',
          `      <strong>${escapeHtml(displayValue(task && task.id, 'Task'))}</strong>`,
          `      <span>${escapeHtml(displayValue(task && task.name, 'Untitled task'))}</span>`,
          '    </span>',
          '    <span class="dashboard-slice-task-meta">',
          `      <span>${escapeHtml(TASK_STATE_LABELS[state])}</span>`,
          `      <span>${escapeHtml(displayValue(task && task.status, 'pending'))}</span>`,
          `      <span>${escapeHtml(riskLevel)} risk</span>`,
          `      <span>${escapeHtml(acTotal)} ACs</span>`,
          '    </span>',
          '  </button>',
          '</li>'
        ].join('');
      }),
      '</ol>'
    ].join('');
  }

  function renderSelectedSliceDetail(model, slice) {
    if (!slice) {
      return renderEmptyState(
        'No slice selected',
        'Select a roadmap slice to inspect its progress.'
      );
    }

    const acSummary = sliceAcceptanceSummary(slice);
    const riskSummary = sliceRiskSummary(slice);
    const currentLabel = slice.current
      ? '<span class="dashboard-slice-detail-current">Current slice</span>'
      : '';
    const selectedTask = findTaskById(slice, app.selectedTaskId)
      || defaultSelectedTask(model, slice);

    return [
      '<section class="dashboard-slice-detail" aria-label="Selected slice detail">',
      '  <header class="dashboard-slice-detail-header">',
      '    <div>',
      `      <span>${escapeHtml(displayValue(slice.id, 'Slice'))}</span>`,
      `      <h3>${escapeHtml(displayValue(slice.name, 'Untitled slice'))}</h3>`,
      '    </div>',
      currentLabel,
      '  </header>',
      '  <div class="dashboard-slice-detail-grid">',
      '    <section>',
      '      <h4>Status</h4>',
      `      <span class="dashboard-slice-status dashboard-slice-status--${toClassName(slice.status)}">${escapeHtml(displayValue(slice.status, 'unknown'))}</span>`,
      '      <div class="dashboard-slice-detail-stats">',
      renderSliceStat('tasks', countSliceTasks(slice)),
      renderSliceStat('completed', slice.tasks && slice.tasks.completed),
      renderSliceStat('pending', slice.tasks && slice.tasks.pending),
      '      </div>',
      '    </section>',
      '    <section>',
      '      <h4>Acceptance criteria</h4>',
      renderSliceAcceptanceDetails(acSummary),
      '    </section>',
      '    <section>',
      '      <h4>Risk distribution</h4>',
      '      <div class="dashboard-slice-roadmap-risks">',
      renderSliceRiskDistribution(riskSummary),
      '      </div>',
      '    </section>',
      '    <section>',
      '      <h4>Artifacts</h4>',
      renderSliceArtifacts(slice) || '<p class="dashboard-slice-detail-empty">No slice artifacts discovered.</p>',
      '    </section>',
      '  </div>',
      '  <section class="dashboard-slice-task-section">',
      '    <h4>Tasks</h4>',
      renderSliceTaskList(model, slice, selectedTask),
      '  </section>',
      renderSelectedTaskDetail(model, slice, selectedTask),
      '</section>'
    ].join('');
  }

  function renderProgress(progress, current) {
    const acceptance = progress && progress.acceptance_criteria
      ? progress.acceptance_criteria
      : {};
    const slices = progress && Array.isArray(progress.slices)
      ? progress.slices
      : [];
    const selectedSlice = findSliceById(slices, app.selectedSliceId)
      || defaultSelectedSlice(slices, current);

    if (slices.length === 0 && !acceptance.total) {
      return renderEmptyState(
        'No progress data yet',
        'Slice and acceptance progress will appear after planning starts.'
      );
    }

    return [
      '<div class="dashboard-progress">',
      '  <div class="dashboard-metrics">',
      renderMetric('slices', slices.length),
      renderMetric('AC passed', acceptance.passed || 0),
      renderMetric('AC pending', acceptance.pending || 0),
      '  </div>',
      renderSliceStatusSummary(slices),
      slices.length > 0
        ? renderSliceRoadmap(slices, selectedSlice)
        : '<p class="dashboard-empty">No active slice.</p>',
      renderSelectedSliceDetail(app.model || {}, selectedSlice),
      '</div>'
    ].join('');
  }

  function renderActivityPill(value, tone) {
    const text = displayValue(value, '');

    if (!text) {
      return '';
    }

    return [
      `<span class="dashboard-activity-pill dashboard-activity-pill--${toClassName(tone || text)}">`,
      escapeHtml(text),
      '</span>'
    ].join('');
  }

  function renderActivitySummary(items) {
    const counts = items.reduce((summary, item) => {
      const category = normalizeActivityCategory(item && item.category);
      summary[category] = (summary[category] || 0) + 1;
      return summary;
    }, {});
    const categories = ACTIVITY_CATEGORY_ORDER
      .filter((category) => counts[category] > 0);

    if (categories.length === 0) {
      return '';
    }

    return [
      '<div class="dashboard-activity-summary" aria-label="Activity event groups">',
      ...categories.map((category) => [
        `<span class="dashboard-activity-count dashboard-activity-count--${category}">`,
        `  <strong>${counts[category]}</strong>`,
        `  <span>${escapeHtml(ACTIVITY_CATEGORY_LABELS[category])}</span>`,
        '</span>'
      ].join('')),
      '</div>'
    ].join('');
  }

  function activityDetailText(value) {
    if (Array.isArray(value)) {
      return uniqueValues(value).join(', ');
    }

    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }

    return displayValue(value, '');
  }

  function renderActivityDetails(details) {
    const entries = details && typeof details === 'object' && !Array.isArray(details)
      ? Object.entries(details)
      : [];
    const normalized = entries
      .map(([key, value]) => ({
        key,
        value: activityDetailText(value)
      }))
      .filter((entry) => entry.key && entry.value);

    if (normalized.length === 0) {
      return '';
    }

    return [
      '<dl class="dashboard-activity-details">',
      ...normalized.slice(0, 4).map((entry) => [
        '  <div>',
        `    <dt>${escapeHtml(entry.key)}</dt>`,
        `    <dd>${escapeHtml(entry.value)}</dd>`,
        '  </div>'
      ].join('')),
      normalized.length > 4
        ? `  <p>${normalized.length - 4} more details</p>`
        : '',
      '</dl>'
    ].join('');
  }

  function renderActivityArtifacts(item) {
    const artifacts = uniqueValues([
      item && item.artifact,
      ...(Array.isArray(item && item.artifacts) ? item.artifacts : [])
    ]);
    const links = artifacts
      .map((artifact) => renderArtifactLink(artifact))
      .filter(Boolean);

    if (links.length === 0) {
      return '';
    }

    return [
      '<div class="dashboard-activity-artifacts" aria-label="Activity artifacts">',
      ...links,
      '</div>'
    ].join('');
  }

  function renderActivityItem(item) {
    const severity = normalizeSeverity(item && item.severity);
    const category = normalizeActivityCategory(item && item.category);
    const message = displayValue(item && item.message, 'Activity recorded.');
    const type = displayValue(item && item.type, 'unknown');
    const unit = displayValue(item && item.unit, '');
    const phase = displayValue(item && item.phase, '');
    const dispatchPhase = displayValue(item && item.dispatch_phase, '');
    const line = item && item.line ? `line ${item.line}` : '';

    return [
      `<li class="dashboard-activity dashboard-activity--${severity} dashboard-activity--category-${category}">`,
      '  <div class="dashboard-activity-time">',
      `    <time${formatTimestampAttribute(item && item.timestamp)}>${escapeHtml(formatActivityTimestamp(item && item.timestamp))}</time>`,
      line ? `    <small>${escapeHtml(line)}</small>` : '',
      '  </div>',
      '  <div class="dashboard-activity-body">',
      '    <div class="dashboard-activity-title-row">',
      `      <strong>${escapeHtml(message)}</strong>`,
      `      <code>${escapeHtml(type)}</code>`,
      '    </div>',
      '    <div class="dashboard-activity-meta">',
      renderActivityPill(ACTIVITY_CATEGORY_LABELS[category], category),
      renderActivityPill(severity, severity),
      unit ? renderActivityPill(unit, 'unit') : '',
      phase ? renderActivityPill(phase, 'phase') : '',
      dispatchPhase ? renderActivityPill(dispatchPhase, 'dispatch-phase') : '',
      '    </div>',
      renderActivityDetails(item && item.details),
      renderActivityArtifacts(item),
      '  </div>',
      '</li>'
    ].join('');
  }

  function renderActivity(activity) {
    const items = Array.isArray(activity) ? activity : [];

    if (items.length === 0) {
      return renderEmptyState(
        'No recent activity yet',
        'Run events will appear here when automation writes them.'
      );
    }

    return [
      '<div class="dashboard-activity-feed">',
      renderActivitySummary(items),
      '<ol class="dashboard-activity-list" aria-label="Recent automation events">',
      ...items.map(renderActivityItem),
      '</ol>',
      '</div>'
    ].join('');
  }

  function renderAutomation(automation) {
    return [
      '<dl class="dashboard-fields dashboard-fields--stacked">',
      renderField('Status', automation.status),
      renderField('Scope', automation.scope),
      renderField('Unit', automation.unit || 'none'),
      '  </dl>'
    ].join('');
  }

  function renderProjectContext(project) {
    return [
      '<dl class="dashboard-fields dashboard-fields--stacked">',
      renderField('Language', project.language),
      renderField('Type', project.project_type),
      renderField('Rigor', project.rigor),
      renderField('Base branch', project.base_branch),
      '  </dl>'
    ].join('');
  }

  function renderMain(model, current) {
    return [
      '<main class="dashboard-main" aria-live="polite">',
      '  <section class="dashboard-region dashboard-attention-panel" id="attention">',
      renderRegionHeader('Attention', 'Blockers and required user action.'),
      renderAttentionPanel(model),
      '  </section>',
      '  <section class="dashboard-region" id="current-run">',
      renderRegionHeader('Current run', 'Active task and automation operation.'),
      renderRunSummary(current),
      renderCurrentRunPanel(model, current, model.automation || {}),
      renderWhyThisTaskPanel(model.current_task),
      '  </section>',
      '  <section class="dashboard-region" id="progress">',
      renderRegionHeader('Progress', 'Slice and acceptance status.'),
      renderProgress(model.progress, current),
      '  </section>',
      '  <section class="dashboard-region" id="activity">',
      renderRegionHeader('Recent activity', 'Latest automation events.'),
      renderActivity(model.activity),
      '  </section>',
      '</main>'
    ].join('');
  }

  function renderContext(model, project, automation) {
    return [
      '<aside class="dashboard-context" id="context" aria-label="Context panel">',
      '  <section class="dashboard-context-section">',
      renderRegionHeader('Automation', ''),
      renderAutomation(automation),
      '  </section>',
      '  <section class="dashboard-context-section">',
      renderRegionHeader('Project', ''),
      renderProjectContext(project),
      '  </section>',
      '</aside>'
    ].join('');
  }

  function render() {
    const model = app.model || {};
    const project = model.project || {};
    const current = model.current || {};
    const automation = model.automation || {};

    root.innerHTML = [
      renderTopBar(project, current, automation),
      app.error ? `<p class="dashboard-error">${escapeHtml(app.error)}</p>` : '',
      '<div class="dashboard-workspace">',
      renderSidebar(model, current),
      renderMain(model, current),
      renderContext(model, project, automation),
      '</div>'
    ].join('');
  }

  function fetchState() {
    if (typeof fetch !== 'function') {
      app.error = 'This browser cannot fetch dashboard state.';
      setConnection('disconnected');
      return Promise.resolve();
    }

    return fetch(STATE_ENDPOINT, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`State request failed with ${response.status}.`);
      }

      return response.json();
    }).then((model) => {
      setModel(model);
    }).catch((error) => {
      app.error = error && error.message
        ? error.message
        : 'Dashboard state is temporarily unavailable.';

      if (app.connection === 'loading') {
        app.connection = 'disconnected';
      }

      render();
    });
  }

  function stopPolling() {
    if (!app.pollTimer) {
      return;
    }

    clearInterval(app.pollTimer);
    app.pollTimer = null;
  }

  function startPolling() {
    if (app.pollTimer) {
      return;
    }

    app.pollTimer = setInterval(fetchState, POLL_INTERVAL_MS);
  }

  function handleEventState(event) {
    try {
      setModel(JSON.parse(event.data));
      stopPolling();
      app.connection = 'connected';
      render();
    } catch (_error) {
      app.error = 'Live dashboard event could not be read.';
      render();
    }
  }

  function connectEventStream() {
    if (typeof EventSource !== 'function') {
      setConnection('disconnected');
      startPolling();
      return;
    }

    try {
      app.eventSource = new EventSource(EVENTS_ENDPOINT);
    } catch (_error) {
      setConnection('disconnected');
      startPolling();
      return;
    }

    setConnection('reconnecting');

    app.eventSource.addEventListener('open', () => {
      stopPolling();
      setConnection('connected');
    });
    app.eventSource.addEventListener('state', handleEventState);
    app.eventSource.addEventListener('error', () => {
      const closed = app.eventSource
        && app.eventSource.readyState === EventSource.CLOSED;

      if (closed) {
        setConnection('disconnected');
        startPolling();
        return;
      }

      setConnection('reconnecting');
    });
  }

  function handleDashboardClick(event) {
    const sliceTarget = event && event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-dashboard-slice-id]')
      : null;

    if (sliceTarget && typeof root.contains === 'function' && !root.contains(sliceTarget)) {
      return;
    }

    if (sliceTarget) {
      const sliceId = sliceTarget.getAttribute('data-dashboard-slice-id');

      if (!sliceId || sliceId === app.selectedSliceId) {
        return;
      }

      app.selectedSliceId = sliceId;
      app.selectedTaskId = '';
      ensureSelectedSlice(app.model || {});
      render();
      return;
    }

    const taskTarget = event && event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-dashboard-task-id]')
      : null;

    if (!taskTarget) {
      return;
    }

    if (typeof root.contains === 'function' && !root.contains(taskTarget)) {
      return;
    }

    const taskId = taskTarget.getAttribute('data-dashboard-task-id');

    if (!taskId || taskId === app.selectedTaskId) {
      return;
    }

    app.selectedTaskId = taskId;
    render();
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('click', handleDashboardClick);
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeunload', () => {
      if (app.eventSource) {
        app.eventSource.close();
      }
      stopPolling();
    });
  }

  render();
  fetchState();
  connectEventStream();
}());
