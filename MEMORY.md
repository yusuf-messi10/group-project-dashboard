# MEMORY.md

## Current Task
- Browser-verify the PWA setup (installability, offline load) — the last
  open item before the app is done.

## Current Phase
- **Phase 1: Environment Setup & Core UI — COMPLETE.**
- **Phase 2: Real-time Chat + Meeting Scheduler — COMPLETE.**
- **Phase 3: PWA finalization — BUILT, awaiting browser verification.**

## Phase 1 — Completed
- Initialized project directory with `index.html`, `css/variables.css`,
  `css/layout.css`.
- Dark mode palette, Montserrat/Lato typography, and dashboard grid/flexbox
  shell scaffolded.
- Static team member cards: fit into the 12-column `.main` grid via
  `.member-row`, left accent bar per member, presence status dots on
  avatars. Cards carry `data-member-id` and are kept in sync by `app.js`.
- `js/charts.js` + `js/app.js`: mock task/hours data drives a native
  multi-segment SVG donut chart, animated on load and on data updates via
  CSS-transitioned `stroke-dasharray`/`stroke-dashoffset`. Verified in a
  headless browser — correct math, no console errors, genuine
  interpolation (not an instant jump).
- `js/ui.js`: Task Filter tabs (To Do / Doing / Done) are now fully wired.
  Clicking a tab (or using Left/Right arrow keys, per the ARIA tablist
  pattern) shows only the matching task-column, expanded to full width
  and fading/sliding in; the other two are removed from grid flow.
  - Note for future self: the outgoing column is hidden *instantly*
    rather than fading out — animating both an exit and an expanding
    entrance at the same time caused the two columns to fight over CSS
    Grid placement and leave a blank gap mid-transition. Caught this in
    headless-browser testing before shipping; don't reintroduce a
    simultaneous exit animation without solving that placement conflict
    first (e.g. by overlaying both in the same grid cell with
    `grid-row/grid-column` + `position` instead of letting one shrink
    while the other expands).
- All Phase 1 review checklist items (dark mode/typography, responsive
  layout, task filtering) are satisfied except the WebSocket chat item,
  which is explicitly Phase 2 scope.

## Phase 2 — Completed
### Chat (verified working in browser)
- `index.html`: chat panel has a `role="log"` thread (`#chat-thread`), typing
  line (`#chat-typing`), `<form id="chat-form">` (Enter or Send submits),
  status pill (`#chat-status`), and a "Simulate offline" toggle.
- `css/layout.css`: scrolling thread with `:empty` placeholder, message
  bubbles (teammates: member-color author name; "You": right-aligned purple
  tint), status-dot states (connecting/reconnecting amber, offline red).
- `js/chat.js`: `MockWebSocket` mirrors the browser API (readyState, send,
  close, onopen/onmessage/onclose/onerror, JSON string payloads). Mock server
  acks each message, then a teammate "types" and replies. Client does
  exponential-backoff reconnect (1s, 2s, 4s, cap 8s), queues messages sent
  while offline, and re-queues unacked ones on drop (at-least-once; a real
  server should dedupe by message `id`). Text is rendered via `textContent`
  only. Going live = change `createSocket()` to `new WebSocket(url)`.

### Meeting scheduler
- `index.html`: `.scheduler-panel` now holds a meeting-length `<select>`
  (`#scheduler-duration`, 1/2/3 hours), the weekly grid (`#scheduler-grid`,
  ARIA grid), a legend, and a suggested-windows list (`#scheduler-results`).
  `#scheduler-sub` shows the top pick. `js/scheduler.js` loads after
  `chat.js`.
- `css/layout.css`: grid is a time column + Mon–Fri columns, 9 AM–6 PM in
  1-hour slots. Cell tint = share of members free (`--heat`, set per cell in
  JS); `.has-overlap` = inside a suggested window (solid teal);
  `.is-selected` = the window chosen in the list (purple ring). Slot buttons
  use `aria-pressed`.
- `js/scheduler.js`: hardcoded `AVAILABILITY` (free ranges per member per
  day, ids match the member cards). `findBestWindows(slots, duration)` checks
  every start time, keeps windows with the most attendees free for the
  whole meeting, merges back-to-back starts with the same attendees, and
  ranks longest first. If no all-free window exists it falls back to the
  best partial window and names who is missing. Top 3 are listed; click one
  to highlight it in the grid. Pure functions are exposed on
  `window.SchedulerModule` for testing.
- Verified with Node against the mock data: 1h → Wed 1–4 PM, Tue 10 AM–12 PM,
  Fri 2–4 PM, Mon 11 AM, Thu 11 AM (all 4 free); 2h → Wed, Tue, Fri;
  3h → Wed only; 4h → falls back to Wed 1–5 PM with 3 of 4 free.
  Visual layout not yet checked in a browser.
- Not built (out of scope for the mock): editing availability, timezones,
  and actually booking a meeting.

## Phase 3 — PWA (built; not yet verified in a browser)
- `manifest.json`: name "Group Project Contribution Dashboard", short_name
  "GP Dashboard", `display: standalone`, `background_color` / `theme_color`
  `#0F1420`, `start_url` / `scope` `./`, icons (192 + 512 "any", 512
  "maskable").
- `icons/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png` — the sidebar "GP" mark (purple → teal gradient)
  generated with Python/PIL. Regenerate or replace with real branding
  whenever a final logo exists.
- `sw.js`: precaches `./`, manifest, all CSS/JS, and icons on install;
  deletes old `gp-*` caches on activate; same-origin GETs are network-first
  with cache fallback (fresh during dev, works offline); Google Fonts use
  stale-while-revalidate in a separate cache; offline navigations fall back
  to the cached app shell. **Bump `CACHE_VERSION` in `sw.js` when adding new
  files to the precache list** (and add the file to `APP_SHELL`).
  WebSockets are not intercepted, so chat offline/reconnect stays in
  `js/chat.js`.
- `index.html` head: description, `theme-color`, manifest link,
  `mobile-web-app-capable`, Apple PWA meta tags (status bar `black`, so no
  safe-area padding needed), favicon, and `apple-touch-icon`.
- `js/app.js`: registers `sw.js` on window `load` (logs scope or the error
  to the console).
- Served pages must be on `localhost` or HTTPS for the service worker to
  register.

## Next Step
- Verify with `npx serve` in Chrome: DevTools → Application → Manifest (no
  errors, icons load), Service Workers (activated), then tick "Offline" (or
  Network → Offline) and reload — the dashboard should still render. Try
  the install prompt, and check Firefox/Safari and a mobile device
  (`testing.md`).
- Still open: check the scheduler layout at the 560px / 768px / 1024px
  breakpoints, and swap the mock WebSocket for a real server when one exists
  (REVIEW-CHECKLIST real-time chat item stays open until then).

## Blockers
- None currently.