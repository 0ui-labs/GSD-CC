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

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
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

    return [
      `<div class="dashboard-connection dashboard-connection--${app.connection}" role="status">`,
      '  <span class="dashboard-connection-dot" aria-hidden="true"></span>',
      '  <span>',
      `    <strong>${escapeHtml(connection.label)}</strong>`,
      `    <span>${escapeHtml(connection.detail)}</span>`,
      '  </span>',
      `  <time>${escapeHtml(formatDate(app.lastUpdatedAt))}</time>`,
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

  function renderAttention(attention) {
    if (!attention || attention.length === 0) {
      return '<p class="dashboard-empty">No attention items.</p>';
    }

    return [
      '<ul class="dashboard-attention-list">',
      ...attention.map((item) => [
        `<li class="dashboard-attention dashboard-attention--${toClassName(item.severity)}">`,
        `  <strong>${escapeHtml(displayValue(item.title, 'Attention'))}</strong>`,
        `  <p>${escapeHtml(displayValue(item.message, 'Review project state.'))}</p>`,
        item.recommended_action
          ? `  <small>${escapeHtml(item.recommended_action)}</small>`
          : '',
        '</li>'
      ].join('')),
      '</ul>'
    ].join('');
  }

  function renderCurrentTask(currentTask) {
    if (!currentTask || currentTask.id === 'unknown') {
      return '<p class="dashboard-empty">No current task plan loaded.</p>';
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

  function render() {
    const model = app.model || {};
    const project = model.project || {};
    const current = model.current || {};
    const automation = model.automation || {};
    const title = displayValue(project.name, 'Dashboard loading');
    const phase = displayValue(current.phase, 'unknown');

    root.innerHTML = [
      '<section class="dashboard-panel" aria-live="polite">',
      '  <header class="dashboard-header">',
      '    <div>',
      '      <p class="dashboard-kicker">GSD-CC</p>',
      `      <h1>${escapeHtml(title)}</h1>`,
      '    </div>',
      renderConnection(),
      '  </header>',
      app.error ? `<p class="dashboard-error">${escapeHtml(app.error)}</p>` : '',
      '  <section class="dashboard-summary" aria-label="Current state">',
      '    <dl class="dashboard-fields">',
      renderField('Milestone', current.milestone),
      renderField('Slice', current.slice),
      renderField('Task', current.task),
      renderField('Phase', phase),
      '    </dl>',
      `    <p class="dashboard-next-action">${escapeHtml(displayValue(
        current.next_action,
        'Waiting for project state.'
      ))}</p>`,
      '  </section>',
      '  <section class="dashboard-grid">',
      '    <div class="dashboard-section">',
      '      <h2>Progress</h2>',
      renderProgress(model.progress),
      '    </div>',
      '    <div class="dashboard-section">',
      '      <h2>Automation</h2>',
      '      <dl class="dashboard-fields dashboard-fields--compact">',
      renderField('Status', automation.status),
      renderField('Scope', automation.scope),
      renderField('Unit', automation.unit || 'none'),
      '      </dl>',
      '    </div>',
      '    <div class="dashboard-section dashboard-section--wide">',
      '      <h2>Current task</h2>',
      renderCurrentTask(model.current_task),
      '    </div>',
      '    <div class="dashboard-section dashboard-section--wide">',
      '      <h2>Attention</h2>',
      renderAttention(model.attention),
      '    </div>',
      '  </section>',
      '</section>'
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
