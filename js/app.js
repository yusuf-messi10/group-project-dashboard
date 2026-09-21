/**
 * app.js
 * -----------------------------------------------------------------------
 * Wires the mock team data to the SVG chart from charts.js and keeps the
 * member cards' percentages/bars in sync with whatever the chart shows.
 *
 * Mock data stands in for the real per-task time tracking that will come
 * from the backend later — the point of this phase is proving the chart
 * math and animation work, not the data source.
 * ----------------------------------------------------------------------- */

(function () {
  'use strict';

  // Mirrors the task board's mock cards where it makes sense; hours are
  // invented but sum to numbers that match the percentages used in the
  // earlier static mockup (34 / 28 / 23 / 15) so the first paint matches
  // what's already been reviewed.
  const mockTeamData = [
    {
      id: 'priya',
      name: 'Priya Nair',
      color: '#7C5CFF',
      tasks: [
        { title: 'Build contribution API endpoint', hours: 8 },
        { title: 'Set up staging database', hours: 5 },
        { title: 'Backend architecture review', hours: 4 },
      ],
    },
    {
      id: 'jonah',
      name: 'Jonah Fischer',
      color: '#2DD4BF',
      tasks: [
        { title: 'Component styling pass', hours: 6 },
        { title: 'Wireframe implementation', hours: 5 },
        { title: 'Responsive QA', hours: 3 },
      ],
    },
    {
      id: 'ade',
      name: 'Ade Okafor',
      color: '#F2B155',
      tasks: [
        { title: 'Draft literature review outline', hours: 5 },
        { title: 'Finalize survey questions', hours: 4 },
        { title: 'Research synthesis', hours: 2.5 },
      ],
    },
    {
      id: 'sam',
      name: 'Sam Boyd',
      color: '#E86FA0',
      tasks: [
        { title: 'Approve color palette', hours: 3 },
        { title: 'Wireframe settings screen', hours: 2.5 },
        { title: 'Icon set', hours: 2 },
      ],
    },
  ];

  const chartContainer = document.getElementById('workload-chart');
  const legendContainer = document.getElementById('workload-legend');
  const chartSub = document.getElementById('workload-chart-sub');
  const refreshBtn = document.getElementById('simulate-update-btn');

  /** Push current contributions into the chart, legend, and member cards. */
  function renderAll(teamData) {
    const contributions = window.ChartsModule.computeContributions(teamData);
    window.ChartsModule.renderDonutChart(chartContainer, contributions);
    window.ChartsModule.renderLegend(legendContainer, contributions);
    syncMemberCards(contributions);
    return contributions;
  }

  /** Update each member card's percentage text and bar width to match. */
  function syncMemberCards(contributions) {
    contributions.forEach((contribution) => {
      const card = document.querySelector(
        `.member-card[data-member-id="${contribution.id}"]`
      );
      if (!card) return;

      const roundedPercent = Math.round(contribution.percent);
      const statValue = card.querySelector('.member-card__stat-value');
      const barFill = card.querySelector('.member-card__bar-fill');

      if (statValue) statValue.textContent = `${roundedPercent}%`;
      if (barFill) barFill.style.width = `${roundedPercent}%`;
    });
  }

  /**
   * Simulate new time-tracking data coming in: nudge each member's hours
   * on a random task by a small random amount (never below 0), then
   * re-render. This is what exercises the stroke-dasharray/dashoffset
   * transition on an *update* rather than the initial draw-in.
   */
  function simulateDataUpdate(teamData) {
    teamData.forEach((member) => {
      const task = member.tasks[Math.floor(Math.random() * member.tasks.length)];
      const delta = Math.random() * 4 - 2; // -2 to +2 hours
      task.hours = Math.max(0.5, Math.round((task.hours + delta) * 2) / 2);
    });
    return teamData;
  }

  function init() {
    if (!chartContainer || !legendContainer) return;

    renderAll(mockTeamData);

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.disabled = true;
        simulateDataUpdate(mockTeamData);
        renderAll(mockTeamData);
        if (chartSub) chartSub.textContent = 'Updated just now';
        // Re-enable once the 700ms transition has had time to finish.
        window.setTimeout(() => {
          refreshBtn.disabled = false;
        }, 750);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* -----------------------------------------------------------------------
 * PWA: register the service worker (sw.js) once the page has loaded so it
 * doesn't compete with first paint. Requires localhost or HTTPS, which the
 * local dev server (`npx serve`) provides.
 * ----------------------------------------------------------------------- */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((registration) => {
        console.log('[PWA] Service worker registered, scope:', registration.scope);
      })
      .catch((error) => {
        console.error('[PWA] Service worker registration failed:', error);
      });
  });
})();
