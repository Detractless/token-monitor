'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createPluginSandbox } = require('../../src/electron/plugins/sandbox');
const wire = require('../../src/electron/plugins/host/message');

test('bounded JSON envelopes reject binary, cycles, excessive depth and malformed scalars', () => {
  const circular = {}; circular.self = circular;
  let deep = 1; for (let i = 0; i < 30; i++) deep = { child: deep };
  for (const extra of [new ArrayBuffer(8 * 1024 * 1024), new Map(), new Set(), new Uint8Array(8), circular, deep, 'x'.repeat(70 * 1024)]) {
    assert.equal(wire.validMessage({ type: 'log', text: 'binary', extra }), false);
  }
  assert.equal(wire.validMessage({ type: 'subscribe', source: { toString: 0 } }), false);
  assert.equal(wire.validMessage({ type: 'publish', metric: 'cpu', value: 42 }), true);
  assert.equal(wire.validMessage({ type: 'heartbeat' }), false);
});

test('trusted host never forwards structured-clone binary across the bridge', () => {
  const forwarded = [];
  let receive, worker;
  class Worker {
    constructor() { worker = this; }
    terminate() {}
    postMessage() {}
  }
  const context = vm.createContext({ window: { tmPluginHost: { send: m => forwarded.push(m), onMessage: cb => { receive = cb; } } },
    TextEncoder, performance, Worker, Blob, URL, setInterval() {} });
  const host = path.resolve(__dirname, '../../src/electron/plugins/host');
  vm.runInContext(fs.readFileSync(path.join(host, 'message.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(host, 'runtime.js'), 'utf8'), context);
  receive({ type: 'boot', source: '' });
  // Build payloads in the same realm as the browser-side validator.
  context.deliver = message => worker.onmessage({ data: message });
  vm.runInContext("deliver({type:'log',text:'binary',extra:new ArrayBuffer(8*1024*1024)}); deliver({type:'log',text:'valid'});", context);
  assert.equal(forwarded.some(m => m.extra), false);
  assert.equal(forwarded.filter(m => m.type === 'log').length, 1);
});

test('late failure callbacks from a retired host cannot stop its replacement', async () => {
  const windows = [];
  class Window {
    constructor() {
      windows.push(this);
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, { ipc: new EventEmitter(), setWindowOpenHandler() {}, setWebRTCIPHandlingPolicy() {}, send() {}, isDestroyed: () => this.destroyed });
    }
    loadURL() { return new Promise((resolve, reject) => { this.rejectLoad = reject; }); }
    destroy() { this.destroyed = true; }
    isDestroyed() { return Boolean(this.destroyed); }
  }
  const session = { fromPartition: () => ({ protocol: { handle() {} }, webRequest: { onBeforeRequest() {} },
    setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, on() {} }) };
  const exits = [];
  const sandbox = createPluginSandbox({ electron: { BrowserWindow: Window, session, app: { getAppMetrics: () => [] } }, onMessage() {}, onExit: (...args) => exits.push(args) });
  const options = { codeFile: path.resolve(__dirname, '../../docs/plugins/examples/token-pulse/main.js') };
  sandbox.start('pulse', options);
  sandbox.start('pulse', options);
  windows[0].rejectLoad(new Error('retired'));
  windows[0].webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  windows[0].webContents.emit('did-fail-load', {}, -1, 'retired');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(windows[1].isDestroyed(), false);
  assert.equal(sandbox.isRunning('pulse'), true);
  assert.deepEqual(exits, []);
  sandbox.stopAll();
});
