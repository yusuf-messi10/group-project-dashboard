/**
 * charts.js
 * -----------------------------------------------------------------------
 * Native SVG donut chart for the workload distribution panel.
 *
 * Responsibilities:
 *   1. computeContributions(members) — turn mock task/hours data into
 *      sorted { id, name, color, hours, percent } records.
 *   2. renderDonutChart(...)         — draw (or update) a multi-segment
 *      SVG ring, animating each segment's stroke-dasharray /
 *      stroke-dashoffset whenever the underlying data changes.
 *   3. renderLegend(...)             — keep the legend list in sync with
 *      whatever the chart is currently showing.
 *
 * No framework, no build step — plain functions attached to
 * `window.ChartsModule` so app.js (loaded after this file) can call them.
 * ----------------------------------------------------------------------- */

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Sum each member's task hours into a total, then derive each member's
   * percentage share of the whole team's tracked hours.
   *
   * @param {Array<{id:string,name:string,color:string,tasks:Array<{title:string,hours:number}>}>} members
   * @returns {Array<{id:string,name:string,color:string,hours:number,percent:number}>}
   *          Sorted by percent, descending.
   */
  function computeContributions(members) {
    const withHours = members.map((member) => {
      const hours = member.tasks.reduce((sum, task) => sum + task.hours, 0);
      return { id: member.id, name: member.name, color: member.color, hours };
    });

    const totalHours = withHours.reduce((sum, m) => sum + m.hours, 0);

    return withHours
      .map((m) => ({
        ...m,
        percent: totalHours === 0 ? 0 : (m.hours / totalHours) * 100,
      }))
      .sort((a, b) => b.percent - a.percent);
  }

  /**
   * Render (first call) or update (subsequent calls) a multi-segment
   * donut chart inside `container`. Each contribution gets one <circle>
   * segment; segments are stacked via stroke-dashoffset around a shared
   * background "track" circle.
   *
   * First render: every segment animates in from 0 length.
   * Later renders: existing segments animate from their old length/offset
   * to the new ones (the CSS transition on .pie-segment handles this
   * automatically as long as we're changing attributes on the *same*
   * <circle> element rather than replacing it).
   *
   * @param {HTMLElement} container   Empty wrapper element to draw into.
   * @param {Array} contributions     Output of computeContributions().
   * @param {{size?:number, strokeWidth?:number}} [options]
   */
  function renderDonutChart(container, contributions, options) {
    if (!container) return;
    const opts = options || {};
    const size = opts.size || 120;
    const strokeWidth = opts.strokeWidth || 16;
    const radius = size / 2 - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    let svg = container.querySelector('svg.donut-chart');

    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'donut-chart');
      svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      svg.setAttribute('width', '180');
      svg.setAttribute('height', '180');
      svg.setAttribute('role', 'img');

      const track = document.createElementNS(SVG_NS, 'circle');
      track.setAttribute('cx', center);
      track.setAttribute('cy', center);
      track.setAttribute('r', radius);
      track.setAttribute('fill', 'none');
      track.setAttribute('stroke', '#1B2338');
      track.setAttribute('stroke-width', strokeWidth);
      svg.appendChild(track);

      container.innerHTML = '';
      container.appendChild(svg);
    }

    svg.setAttribute('aria-label', buildAriaLabel(contributions));

    let cumulative = 0;

    contributions.forEach((contribution) => {
      const segmentLength = (contribution.percent / 100) * circumference;
      const gapLength = circumference - segmentLength;
      // Segments are drawn clockwise starting at 12 o'clock, so each one's
      // dashoffset is the negative of everything drawn before it.
      const dashOffset = -cumulative;

      let segment = svg.querySelector(
        `circle[data-member-id="${contribution.id}"]`
      );

      if (!segment) {
        segment = document.createElementNS(SVG_NS, 'circle');
        segment.setAttribute('data-member-id', contribution.id);
        segment.setAttribute('class', 'pie-segment');
        segment.setAttribute('cx', center);
        segment.setAttribute('cy', center);
        segment.setAttribute('r', radius);
        segment.setAttribute('fill', 'none');
        segment.setAttribute('stroke', contribution.color);
        segment.setAttribute('stroke-width', strokeWidth);
        segment.setAttribute('stroke-linecap', 'butt');
        // Rotate -90deg so the ring starts at 12 o'clock instead of 3 o'clock.
        segment.setAttribute('transform', `rotate(-90 ${center} ${center})`);
        svg.appendChild(segment);

        // Start collapsed to 0 length, then animate to full length on the
        // next frame so the browser has a "before" state to transition from.
        segment.setAttribute('stroke-dasharray', `0 ${circumference}`);
        segment.setAttribute('stroke-dashoffset', String(dashOffset));

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            segment.setAttribute(
              'stroke-dasharray',
              `${segmentLength} ${gapLength}`
            );
          });
        });
      } else {
        // Existing segment: just set the new target attributes. The
        // `.pie-segment` CSS transition (see css/layout.css) animates the
        // change smoothly from whatever the current values are.
        segment.setAttribute('stroke-dasharray', `${segmentLength} ${gapLength}`);
        segment.setAttribute('stroke-dashoffset', String(dashOffset));
      }

      cumulative += segmentLength;
    });

    // Remove segments for members who no longer appear in the data set.
    const currentIds = contributions.map((c) => c.id);
    svg.querySelectorAll('circle[data-member-id]').forEach((el) => {
      if (!currentIds.includes(el.getAttribute('data-member-id'))) {
        el.remove();
      }
    });
  }

  /**
   * Rebuild the legend rows to match the current contributions.
   * Reuses the .legend-row markup/classes already styled in layout.css.
   *
   * @param {HTMLElement} container
   * @param {Array} contributions
   */
  function renderLegend(container, contributions) {
    if (!container) return;
    container.innerHTML = '';

    contributions.forEach((contribution) => {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.style.setProperty('--legend-color', contribution.color);

      const dot = document.createElement('span');
      dot.className = 'legend-row__dot';

      const label = document.createElement('span');
      label.className = 'legend-row__label';
      label.textContent = contribution.name;

      const value = document.createElement('span');
      value.className = 'legend-row__value';
      value.textContent = `${Math.round(contribution.percent)}%`;

      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(value);
      container.appendChild(row);
    });
  }

  /** Build a plain-language summary of the chart for screen readers. */
  function buildAriaLabel(contributions) {
    const parts = contributions.map(
      (c) => `${c.name} ${Math.round(c.percent)} percent`
    );
    return `Workload distribution: ${parts.join(', ')}`;
  }

  window.ChartsModule = {
    computeContributions,
    renderDonutChart,
    renderLegend,
  };
})();
