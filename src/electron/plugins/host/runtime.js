'use strict';

// Trusted host page for one plugin. It owns the plugin's Worker, relays
// messages in both directions and watches the Worker's event loop. Everything
// the Worker sends is treated as untrusted data: main validates it again by
// sender, so this page only bounds size and liveness.
(() => {
  const bridge = window.tmPluginHost;
  const PING_MS = 1000;
  const HANG_MS = 5000;
  let worker = null;
  let workerUrl = '';
  let lastPong = 0;
  let pingSeq = 0;
  let tokens = 200;
  let tokenAt = performance.now();
  let dropped = 0;

  function stop() {
    if (worker) worker.terminate();
    worker = null;
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = '';
  }

  function fail(reason, detail) {
    stop();
    bridge.send({ type: 'fatal', reason, detail: String(detail || '').slice(0, 500) });
  }

  function boot(message) {
    stop();
    workerUrl = URL.createObjectURL(new Blob([String(message.source || '')], { type: 'text/javascript' }));
    try {
      worker = new Worker(workerUrl, { name: 'plugin' });
    } catch (error) {
      fail('boot', error && error.message);
      return;
    }
    lastPong = Date.now();
    worker.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      if (data.type === 'pong') {
        lastPong = Date.now();
        return;
      }
      // A plugin cannot impersonate the trusted host heartbeat, or flood IPC
      // before main gets an opportunity to enforce its own budget.
      if (!['ready', 'tick-done', 'interaction-done', 'publish', 'subscribe', 'call', 'log', 'error'].includes(data.type)) return;
      const at = performance.now();
      tokens = Math.min(200, tokens + (at - tokenAt) / 10);
      tokenAt = at;
      if (tokens < 1) {
        if (++dropped >= 400) fail('flooding', 'worker message budget exceeded');
        return;
      }
      tokens -= 1;
      if (!window.TokenMonitorPluginMessage.validMessage(data)) {
        if (data.type === 'call' && Number.isSafeInteger(data.id)) worker.postMessage({ type: 'result', id: data.id, ok: false, error: 'invalid message or message quota exceeded' });
        bridge.send({ type: 'dropped', reason: 'invalid-message', kind: String(data.type).slice(0, 32) });
        return;
      }
      bridge.send(data);
    };
    worker.onmessageerror = () => bridge.send({ type: 'dropped', reason: 'unserializable' });
    worker.onerror = (event) => {
      event.preventDefault();
      bridge.send({ type: 'error', message: String(event.message || 'Uncaught error').slice(0, 500), line: Number(event.lineno) || 0 });
    };
  }

  bridge.onMessage((message) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'boot') {
      boot(message);
      return;
    }
    if (message.type === 'stop') {
      stop();
      return;
    }
    if (worker) worker.postMessage(message);
  });

  // A Worker stuck in synchronous code never answers a ping. Async waits keep
  // the event loop free, so they are not mistaken for a hang.
  setInterval(() => {
    if (!worker) return;
    if (Date.now() - lastPong > HANG_MS) {
      fail('hung', `no response for ${HANG_MS} ms`);
      return;
    }
    pingSeq += 1;
    worker.postMessage({ type: 'ping', seq: pingSeq });
  }, PING_MS);

  setInterval(() => bridge.send({ type: 'heartbeat' }), 2000);
  bridge.send({ type: 'host-ready' });
})();
