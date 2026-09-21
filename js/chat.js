/**
 * chat.js
 * -----------------------------------------------------------------------
 * Phase 2: team chat wired to a *mock* WebSocket.
 *
 * MockWebSocket mirrors the browser WebSocket surface we rely on
 * (readyState, send, close, onopen/onmessage/onclose/onerror, string
 * payloads), so swapping in the real thing later is a one-line change in
 * createSocket(). The mock "server" acks every message, then a teammate
 * shows a typing indicator and replies.
 *
 * Client behavior worth testing (see testing.md "Network check"):
 *   - Status pill: connecting → connected → reconnecting / offline
 *   - "Simulate offline" drops the socket; messages typed while offline
 *     are queued and flushed after the automatic reconnect
 *   - Reconnect uses exponential backoff (1s, 2s, 4s, capped at 8s)
 * ----------------------------------------------------------------------- */

(function () {
  'use strict';

  const thread = document.getElementById('chat-thread');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const statusEl = document.getElementById('chat-status');
  const statusLabel = document.getElementById('chat-status-label');
  const typingEl = document.getElementById('chat-typing');
  const netBtn = document.getElementById('chat-network-toggle');
  if (!thread || !form || !input) return;

  /* ====================================================================
   * Mock WebSocket + mock server
   * ==================================================================== */

  const TEAMMATES = [
    { name: 'Jonah Fischer', color: '#2DD4BF' },
    { name: 'Ade Okafor', color: '#F2B155' },
    { name: 'Sam Boyd', color: '#E86FA0' },
  ];

  const REPLIES = [
    'Nice, I just logged my hours for that.',
    'Can we cover it in Thursday’s meeting?',
    'Pushed my changes — take a look when you can.',
    'Agreed. I’ll pick up the next task from the board.',
    'Good catch. I’ll update the doc.',
    'Give me ten minutes and I’ll have it done.',
  ];

  const network = { online: true };
  const liveSockets = new Set();
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      this._timers = [];

      this._later(500, () => {
        if (!network.online) {
          this._emit('onerror', { type: 'error' });
          this._finish(1006);
          return;
        }
        this.readyState = 1; // OPEN
        liveSockets.add(this);
        this._emit('onopen', { type: 'open' });
        this._push({ type: 'message', author: TEAMMATES[0], text: 'Hey! Chat is live — try sending a message.' }, 700);
      });
    }

    send(data) {
      if (this.readyState !== 1) throw new Error('MockWebSocket is not open');
      const msg = JSON.parse(data);
      this._push({ type: 'ack', id: msg.id }, 250);

      const teammate = pick(TEAMMATES);
      this._push({ type: 'typing', author: teammate }, 700);
      this._push({ type: 'message', author: teammate, text: pick(REPLIES) }, 2000 + Math.random() * 1200);
    }

    close(code) {
      if (this.readyState === 3) return;
      this._finish(code || 1000);
    }

    /** Called by the network toggle: connection dies without a clean close. */
    _drop() {
      if (this.readyState === 1) this._finish(1006);
    }

    _push(payload, delay) {
      this._later(delay, () => {
        if (this.readyState === 1) this._emit('onmessage', { data: JSON.stringify(payload) });
      });
    }

    _later(ms, fn) {
      this._timers.push(setTimeout(fn, ms));
    }

    _emit(handler, event) {
      if (typeof this[handler] === 'function') this[handler](event);
    }

    _finish(code) {
      this._timers.forEach(clearTimeout);
      this.readyState = 3; // CLOSED
      liveSockets.delete(this);
      this._emit('onclose', { type: 'close', code, wasClean: code === 1000 });
    }
  }

  function createSocket() {
    // To go live later: return new WebSocket('wss://your-server/chat');
    return new MockWebSocket('wss://mock.contribution-dashboard.local/chat');
  }

  /* ====================================================================
   * Client
   * ==================================================================== */

  const STATUS_LABELS = {
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
    offline: 'Offline',
  };

  let socket = null;
  let attempt = 0;
  let reconnectTimer = null;
  const awaitingAck = new Map(); // id -> { text, el }
  let outbox = []; // [{ id, text, el }] waiting for a live socket

  function setStatus(state, label) {
    statusEl.dataset.state = state;
    statusLabel.textContent = label || STATUS_LABELS[state];
  }

  function connect() {
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
    socket = createSocket();

    socket.onopen = () => {
      attempt = 0;
      setStatus('connected');
      flushOutbox();
    };

    socket.onmessage = (event) => handleServerEvent(JSON.parse(event.data));

    socket.onerror = () => {}; // onclose always follows; handled there

    socket.onclose = () => {
      socket = null;
      hideTyping();
      // Anything sent but never acked goes back in the queue (at-least-once).
      awaitingAck.forEach((item, id) => outbox.push({ id, ...item }));
      awaitingAck.forEach((item) => setMessageState(item.el, 'queued', 'Queued — waiting to reconnect'));
      awaitingAck.clear();
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    attempt += 1;
    const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
    setStatus('offline', `Offline · retrying in ${delay / 1000}s`);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
  }

  function handleServerEvent(event) {
    if (event.type === 'ack') {
      const item = awaitingAck.get(event.id);
      if (item) setMessageState(item.el, 'sent', 'Delivered');
      awaitingAck.delete(event.id);
    } else if (event.type === 'typing') {
      typingEl.textContent = `${event.author.name} is typing…`;
    } else if (event.type === 'message') {
      hideTyping();
      addMessage({ author: event.author.name, color: event.author.color, text: event.text });
    }
  }

  function hideTyping() {
    typingEl.textContent = '';
  }

  function transmit(item) {
    awaitingAck.set(item.id, { text: item.text, el: item.el });
    setMessageState(item.el, 'sending', 'Sending…');
    socket.send(JSON.stringify({ type: 'message', id: item.id, text: item.text }));
  }

  function flushOutbox() {
    const queued = outbox;
    outbox = [];
    queued.forEach(transmit);
  }

  function sendMessage(text) {
    const id = `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const el = addMessage({ author: 'You', text, mine: true });
    const item = { id, text, el };

    if (socket && socket.readyState === 1) {
      transmit(item);
    } else {
      outbox.push(item);
      setMessageState(el, 'queued', 'Queued — waiting to reconnect');
    }
  }

  /* ====================================================================
   * DOM
   * ==================================================================== */

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function setMessageState(el, state, label) {
    el.dataset.state = state;
    el.querySelector('.chat-msg__state').textContent = label;
  }

  /** Build a message bubble. Text goes in via textContent, never innerHTML. */
  function addMessage({ author, color, text, mine }) {
    const el = document.createElement('div');
    el.className = 'chat-msg' + (mine ? ' chat-msg--mine' : '');

    const meta = document.createElement('div');
    meta.className = 'chat-msg__meta';

    const name = document.createElement('span');
    name.className = 'chat-msg__author';
    if (color) name.style.setProperty('--author-color', color);
    name.textContent = author;

    const time = document.createElement('time');
    time.textContent = formatTime(new Date());

    meta.append(name, time);

    const body = document.createElement('p');
    body.className = 'chat-msg__text';
    body.textContent = text;

    const state = document.createElement('span');
    state.className = 'chat-msg__state';

    el.append(meta, body, state);

    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  }

  /* ====================================================================
   * Wiring
   * ==================================================================== */

  function updateSendButton() {
    sendBtn.disabled = input.value.trim() === '';
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    sendMessage(text);
    input.value = '';
    updateSendButton();
    input.focus();
  });

  input.addEventListener('input', updateSendButton);

  if (netBtn) {
    netBtn.addEventListener('click', () => {
      network.online = !network.online;
      netBtn.setAttribute('aria-pressed', String(!network.online));
      netBtn.textContent = network.online ? 'Simulate offline' : 'Go back online';
      if (!network.online) Array.from(liveSockets).forEach((s) => s._drop());
    });
  }

  updateSendButton();
  connect();
})();
