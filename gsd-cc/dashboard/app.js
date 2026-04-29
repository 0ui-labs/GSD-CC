(function () {
  const root = document.querySelector('[data-dashboard-root]');

  if (!root) {
    return;
  }

  root.innerHTML = [
    '<section class="dashboard-panel" aria-live="polite">',
    '  <p class="dashboard-kicker">GSD-CC</p>',
    '  <h1>Dashboard loading</h1>',
    '</section>'
  ].join('');
}());
