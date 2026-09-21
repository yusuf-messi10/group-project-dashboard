/**
 * scheduler.js
 * -----------------------------------------------------------------------
 * Meeting scheduler: turns mock per-member availability into a weekly
 * heat grid and highlights the best overlapping windows.
 *
 * How the calculation works (findBestWindows):
 *   1. Slots are one hour long (9 AM–6 PM, Mon–Fri).
 *   2. For the chosen meeting length, every possible start time is checked
 *      and we record which members are free for the *whole* meeting.
 *   3. The highest attendee count wins. If no window works for the whole
 *      team, the best partial windows are shown instead, with the
 *      missing members named.
 *   4. Back-to-back starts with the same attendees are merged into one
 *      window, and windows are ranked longest first.
 *
 * The pure functions are exported on window.SchedulerModule so they can be
 * tested with hardcoded data (see testing.md "Component check").
 * ----------------------------------------------------------------------- */

(function () {
  'use strict';

  const DAYS = [
    { id: 'mon', label: 'Mon' },
    { id: 'tue', label: 'Tue' },
    { id: 'wed', label: 'Wed' },
    { id: 'thu', label: 'Thu' },
    { id: 'fri', label: 'Fri' },
  ];

  const START_HOUR = 9;
  const END_HOUR = 18; // exclusive: the last slot is 5–6 PM
  const MAX_LISTED = 3;

  // Same ids as the member cards / chart data in app.js.
  const TEAM = [
    { id: 'priya', name: 'Priya Nair', short: 'Priya' },
    { id: 'jonah', name: 'Jonah Fischer', short: 'Jonah' },
    { id: 'ade', name: 'Ade Okafor', short: 'Ade' },
    { id: 'sam', name: 'Sam Boyd', short: 'Sam' },
  ];

  // Free ranges as [start, end) in 24h hours, per member per day.
  const AVAILABILITY = {
    priya: { mon: [[9, 13]], tue: [[10, 16]], wed: [[13, 18]], thu: [[9, 12], [15, 18]], fri: [[11, 17]] },
    jonah: { mon: [[11, 17]], tue: [[9, 12], [14, 18]], wed: [[12, 16]], thu: [[10, 14]], fri: [[9, 12], [14, 18]] },
    ade: { mon: [[9, 12], [15, 18]], tue: [[10, 14]], wed: [[9, 11], [13, 17]], thu: [[9, 13]], fri: [[13, 18]] },
    sam: { mon: [[10, 14]], tue: [[10, 13], [15, 17]], wed: [[13, 18]], thu: [[11, 15]], fri: [[12, 16]] },
  };

  /* ====================================================================
   * Calculation (pure)
   * ==================================================================== */

  function isFree(ranges, hour) {
    return (ranges || []).some(([start, end]) => hour >= start && hour < end);
  }

  /** @returns {{[dayId:string]: {[hour:number]: string[]}}} member ids free per slot */
  function buildSlots(availability, team, days) {
    const slots = {};
    days.forEach((day) => {
      slots[day.id] = {};
      for (let hour = START_HOUR; hour < END_HOUR; hour++) {
        slots[day.id][hour] = team
          .filter((m) => isFree(availability[m.id] && availability[m.id][day.id], hour))
          .map((m) => m.id);
      }
    });
    return slots;
  }

  /**
   * @param {ReturnType<typeof buildSlots>} slots
   * @param {number} duration  meeting length in hours
   * @returns {Array<{day:string,start:number,end:number,attendees:string[]}>}
   *          Best windows, longest first. Empty if no one is ever free.
   */
  function findBestWindows(slots, duration, days) {
    const candidates = [];
    days.forEach((day) => {
      for (let start = START_HOUR; start + duration <= END_HOUR; start++) {
        let common = slots[day.id][start];
        for (let h = start + 1; h < start + duration; h++) {
          common = common.filter((id) => slots[day.id][h].includes(id));
        }
        candidates.push({ day: day.id, start, attendees: common });
      }
    });

    const best = Math.max(0, ...candidates.map((c) => c.attendees.length));
    if (best === 0) return [];

    const windows = [];
    candidates
      .filter((c) => c.attendees.length === best)
      .forEach((c) => {
        const last = windows[windows.length - 1];
        const sameRun =
          last &&
          last.day === c.day &&
          last.end === c.start + duration - 1 &&
          last.attendees.join() === c.attendees.join();
        if (sameRun) last.end = c.start + duration;
        else windows.push({ day: c.day, start: c.start, end: c.start + duration, attendees: c.attendees });
      });

    return windows.sort((a, b) => b.end - b.start - (a.end - a.start));
  }

  /* ====================================================================
   * Formatting helpers
   * ==================================================================== */

  const formatHour = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  const formatRange = (start, end) => `${formatHour(start)}–${formatHour(end)}`;
  const dayLabel = (id) => DAYS.find((d) => d.id === id).label;
  const namesOf = (ids) => ids.map((id) => TEAM.find((m) => m.id === id).short);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ====================================================================
   * Rendering
   * ==================================================================== */

  function init() {
    const gridEl = document.getElementById('scheduler-grid');
    const resultsEl = document.getElementById('scheduler-results');
    const subEl = document.getElementById('scheduler-sub');
    const durationEl = document.getElementById('scheduler-duration');
    if (!gridEl || !resultsEl) return;

    const slots = buildSlots(AVAILABILITY, TEAM, DAYS);
    const cells = new Map(); // "mon-9" -> element
    let windows = [];
    let selected = 0;

    // Grid is built once; highlights are toggled afterwards.
    gridEl.appendChild(headerRow());
    for (let hour = START_HOUR; hour < END_HOUR; hour++) gridEl.appendChild(hourRow(hour));

    function headerRow() {
      const row = el('div', 'scheduler-grid__row');
      row.setAttribute('role', 'row');
      const corner = el('span', 'scheduler-grid__corner');
      corner.setAttribute('role', 'columnheader');
      corner.setAttribute('aria-label', 'Time');
      row.appendChild(corner);
      DAYS.forEach((day) => {
        const head = el('span', 'scheduler-grid__day', day.label);
        head.setAttribute('role', 'columnheader');
        row.appendChild(head);
      });
      return row;
    }

    function hourRow(hour) {
      const row = el('div', 'scheduler-grid__row');
      row.setAttribute('role', 'row');
      const label = el('span', 'scheduler-grid__time', formatHour(hour));
      label.setAttribute('role', 'rowheader');
      row.appendChild(label);

      DAYS.forEach((day) => {
        const free = slots[day.id][hour];
        const cell = el('div', 'scheduler-grid__cell');
        cell.setAttribute('role', 'gridcell');
        cell.style.setProperty('--heat', String(free.length / TEAM.length));
        const summary = `${day.label} ${formatHour(hour)}: ${free.length} of ${TEAM.length} free` +
          (free.length ? ` (${namesOf(free).join(', ')})` : '');
        cell.title = summary;
        cell.setAttribute('aria-label', summary);
        cells.set(`${day.id}-${hour}`, cell);
        row.appendChild(cell);
      });
      return row;
    }

    function paintHighlights() {
      cells.forEach((cell) => cell.classList.remove('has-overlap', 'is-selected'));
      windows.slice(0, MAX_LISTED).forEach((win, index) => {
        for (let h = win.start; h < win.end; h++) {
          const cell = cells.get(`${win.day}-${h}`);
          cell.classList.add('has-overlap');
          if (index === selected) cell.classList.add('is-selected');
        }
      });
    }

    function attendanceText(win) {
      if (win.attendees.length === TEAM.length) return `All ${TEAM.length} free`;
      const missing = TEAM.filter((m) => !win.attendees.includes(m.id)).map((m) => m.short);
      return `${win.attendees.length} of ${TEAM.length} free · missing ${missing.join(', ')}`;
    }

    function renderResults() {
      resultsEl.innerHTML = '';
      const listed = windows.slice(0, MAX_LISTED);

      if (listed.length === 0) {
        resultsEl.appendChild(el('p', 'scheduler-results__empty', 'No shared availability this week.'));
        subEl.textContent = 'No shared availability this week';
        return;
      }

      const top = listed[0];
      subEl.textContent = `Best: ${dayLabel(top.day)} ${formatRange(top.start, top.end)} · ${attendanceText(top).toLowerCase()}`;

      listed.forEach((win, index) => {
        const btn = el('button', 'slot-option');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(index === selected));
        btn.appendChild(el('span', 'slot-option__day', dayLabel(win.day)));
        const body = el('span', 'slot-option__body');
        body.appendChild(el('span', 'slot-option__time', formatRange(win.start, win.end)));
        body.appendChild(el('span', 'slot-option__meta', attendanceText(win)));
        btn.appendChild(body);
        btn.appendChild(el('span', 'slot-option__len', `${win.end - win.start}h open`));
        btn.addEventListener('click', () => {
          selected = index;
          paintHighlights();
          resultsEl.querySelectorAll('.slot-option').forEach((b, i) => b.setAttribute('aria-pressed', String(i === selected)));
        });
        resultsEl.appendChild(btn);
      });
    }

    function recalculate() {
      const duration = durationEl ? Number(durationEl.value) : 2;
      windows = findBestWindows(slots, duration, DAYS);
      selected = 0;
      paintHighlights();
      renderResults();
    }

    if (durationEl) durationEl.addEventListener('change', recalculate);
    recalculate();
  }

  window.SchedulerModule = { buildSlots, findBestWindows, TEAM, DAYS, AVAILABILITY };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
