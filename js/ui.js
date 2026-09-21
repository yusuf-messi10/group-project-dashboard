/**
 * ui.js
 * -----------------------------------------------------------------------
 * Generic UI interaction logic that isn't chart- or chat-specific.
 * Phase 1: the Task Filter tabs (To Do / Doing / Done).
 *
 * Behavior: clicking a tab shows only the matching task-column, expanded
 * to fill the row and fading/sliding in. The other two are hidden
 * immediately (no exit animation) — see the comment above
 * `.task-column.is-entering` in css/layout.css for why animating both an
 * exit and an expanding entrance at once causes a layout glitch with
 * CSS Grid.
 *
 * Implements the ARIA tablist keyboard pattern (Left/Right to move focus
 * and switch filter) since the markup already declares role="tablist".
 * -----------------------------------------------------------------------
 */

(function () {
  'use strict';

  const tabList = document.querySelector('.task-filter-tabs');
  if (!tabList) return; // nothing to wire up on this page

  const tabs = Array.from(tabList.querySelectorAll('.filter-tab'));
  const columns = Array.from(document.querySelectorAll('.task-column'));

  let currentFilter = null;

  /** Show the matching column (expanded, fading/sliding in) and hide the rest. */
  function applyFilter(status) {
    columns.forEach((column) => {
      const isMatch = column.dataset.status === status;

      if (!isMatch) {
        column.classList.remove('is-active-filter', 'is-entering');
        column.classList.add('is-hidden');
        return;
      }

      // Set the pre-animation state, force a reflow so the browser
      // registers it, then flip to the final state on the next frame —
      // otherwise the two class changes get batched and there's nothing
      // to transition from.
      column.classList.remove('is-hidden');
      column.classList.add('is-entering');
      void column.offsetWidth;

      requestAnimationFrame(() => {
        column.classList.remove('is-entering');
        column.classList.add('is-active-filter');
      });
    });
  }

  /** Update tab visual/ARIA state and trigger the column filter. */
  function selectFilter(status, options) {
    const opts = options || {};
    if (status === currentFilter) return;
    currentFilter = status;

    tabs.forEach((tab) => {
      const isActive = tab.dataset.filter === status;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      if (isActive && opts.focus) tab.focus();
    });

    applyFilter(status);
  }

  /** Set the initial state instantly (no transition) to match the tab
   *  already marked is-active in the HTML, so there's no flash of all
   *  three columns before the first filter kicks in. */
  function initializeFilterState() {
    const activeTab = tabs.find((tab) => tab.classList.contains('is-active')) || tabs[0];
    if (!activeTab) return;
    const status = activeTab.dataset.filter;
    currentFilter = status;

    tabs.forEach((tab) => {
      const isActive = tab === activeTab;
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    columns.forEach((column) => {
      const isMatch = column.dataset.status === status;
      column.classList.toggle('is-active-filter', isMatch);
      column.classList.toggle('is-hidden', !isMatch);
      column.classList.remove('is-entering');
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => selectFilter(tab.dataset.filter));
  });

  // ARIA tablist keyboard pattern: Left/Right arrows move focus between
  // tabs and switch the active filter to match.
  tabList.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();

    const currentIndex = tabs.findIndex((tab) => tab.classList.contains('is-active'));
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;

    selectFilter(tabs[nextIndex].dataset.filter, { focus: true });
  });

  initializeFilterState();
})();
