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
    pollTimer: null
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

  function normalizeSeverity(value) {
    const severity = toClassName(value);

    return ATTENTION_SEVERITY_ORDER.includes(severity) ? severity : 'info';
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

  function renderCurrentTask(currentTask) {
    if (!currentTask || currentTask.id === 'unknown') {
      return renderEmptyState(
        'No current task plan loaded',
        'Load a GSD task plan to see the active work package.'
      );
    }

    const criteria = currentTask.acceptance_criteria || [];
    const visibleCriteria = criteria.slice(0, 3);

    return [
      '<div class="dashboard-task">',
      `  <p>${escapeHtml(displayValue(currentTask.id, 'unknown'))}</p>`,
      `  <h3>${escapeHtml(displayValue(currentTask.name, 'Untitled task'))}</h3>`,
      `  <span>Risk: ${escapeHtml(displayValue(
        currentTask.risk && currentTask.risk.level,
        'unknown'
      ))}</span>`,
      criteria.length > 0 ? [
        '  <ul class="dashboard-criteria">',
        ...visibleCriteria.map((criterion) => [
          `    <li class="dashboard-criterion dashboard-criterion--${toClassName(criterion.status)}">`,
          `      <span>${escapeHtml(displayValue(criterion.id, 'AC'))}</span>`,
          `      <p>${escapeHtml(displayValue(criterion.text, 'Acceptance criterion'))}</p>`,
          '    </li>'
        ].join('')),
        criteria.length > visibleCriteria.length
          ? `    <li class="dashboard-more">${criteria.length - visibleCriteria.length} more</li>`
          : '',
        '  </ul>'
      ].join('') : '',
      '</div>'
    ].join('');
  }

  function renderProgress(progress) {
    const acceptance = progress && progress.acceptance_criteria
      ? progress.acceptance_criteria
      : {};
    const slices = progress && Array.isArray(progress.slices)
      ? progress.slices
      : [];
    const currentSlice = slices.find((slice) => slice.current) || null;

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
      currentSlice ? [
        '<p class="dashboard-current-slice">',
        `  <strong>${escapeHtml(currentSlice.id)}</strong>`,
        `  <span>${escapeHtml(displayValue(currentSlice.name, 'Current slice'))}</span>`,
        `  <em>${escapeHtml(displayValue(currentSlice.status, 'unknown'))}</em>`,
        '</p>'
      ].join('') : '<p class="dashboard-empty">No active slice.</p>',
      '</div>'
    ].join('');
  }

  function renderActivityItem(item) {
    const severity = toClassName(item && item.severity);
    const message = displayValue(item && item.message, 'Activity recorded.');
    const meta = [
      displayValue(item && item.category, 'event'),
      displayValue(item && item.type, 'unknown')
    ].join(' - ');

    return [
      `<li class="dashboard-activity dashboard-activity--${severity}">`,
      `  <time>${escapeHtml(formatActivityTime(item && item.timestamp))}</time>`,
      '  <span>',
      `    <strong>${escapeHtml(message)}</strong>`,
      `    <small>${escapeHtml(meta)}</small>`,
      '  </span>',
      '</li>'
    ].join('');
  }

  function renderActivity(activity) {
    const items = Array.isArray(activity) ? activity.slice(0, 6) : [];

    if (items.length === 0) {
      return renderEmptyState(
        'No recent activity yet',
        'Run events will appear here when automation writes them.'
      );
    }

    return [
      '<ol class="dashboard-activity-list">',
      ...items.map(renderActivityItem),
      '</ol>'
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
      renderRegionHeader('Current run', 'The active package and next action.'),
      renderRunSummary(current),
      renderCurrentTask(model.current_task),
      '  </section>',
      '  <section class="dashboard-region" id="progress">',
      renderRegionHeader('Progress', 'Slice and acceptance status.'),
      renderProgress(model.progress),
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
