'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');

function fixture() {
  const file = path.resolve(__dirname, '../../src/electron/plugins/runtime.js');
  const nativeRequire = createRequire(file), handlers = new Map(), events = new Map(), calls = [], demands = new Map();
  const sender = new EventEmitter(); sender.id = 1; sender.mainFrame = {}; sender.isDestroyed = () => false; sender.send = () => {};
  const settings = { pluginMainPages: ['demo/page'], pluginsEnabled: true };
  const manager = { list: () => ({ plugins: [{ id: 'demo', status: 'active', views: [
    { ref: 'demo/page', surfaces: ['page'] }, { ref: 'demo/tray', surfaces: ['tray'] }, { ref: 'demo/optional', surfaces: ['page'] } ] }] }),
  onViews: () => () => {}, onChanged: () => () => {}, reload() {}, settingsChanged() {}, dispose() {},
  interact: (...args) => calls.push(args), setSurfaceDemand: (surface, refs) => demands.set(surface, refs), payload: surface => ({ surface, views: {} }) };
  const mocks = {
    '../../shared/plugins/dataBus': { createDataBus: () => ({ defineSource() {}, dispose() {} }) },
    './appSources': { createAppSources: () => ({ publish() {} }) },
    './manager': { createPluginManager: () => manager },
    './appearance': { createPluginAppearance: () => ({ get: () => ({}) }) },
    './managed': { createManagedPlugins: () => ({ recover() {}, describe() {}, dispose() {} }) },
    './catalog': { createPluginCatalog: () => ({ dispose() {} }) },
    '../limits/fetch': { createElectronNetFetch: () => () => {} },
    '../../shared/outboundFetch': { resolveProxyConfig: () => ({}) }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: id => mocks[id] || nativeRequire(id), __dirname: path.dirname(file), process, console, setTimeout, clearTimeout });
  const runtime = module.exports.createPluginRuntime({ electron: { app: {}, ipcMain: {
    handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => events.set(name, fn), removeHandler: name => handlers.delete(name)
  } }, userDataDir: '/unused-plugin-runtime-fixture', getSettings: () => settings, getLocale: () => 'en',
  isMainSender: event => event.sender === sender, env: { TOKEN_MONITOR_PLUGINS_SAFE_MODE: '1' } });
  runtime.start();
  return { runtime, handlers, events, sender, settings, calls, demands, event: { sender, senderFrame: sender.mainFrame } };
}
test('main page IPC requires its main frame, declared surface, opted-in placement and active demand', () => {
  const f = fixture();
  const send = f.events.get('plugins:demand'), action = f.handlers.get('plugins:interact');
  assert.throws(() => action(f.event, { surface: 'page', ref: 'demo/page' }), /active plugin view/);
  send({ sender: f.sender, senderFrame: {} }, { surface: 'page', refs: ['demo/page'] });
  assert.equal(f.demands.has('page'), false);
  send(f.event, { surface: 'page', refs: ['demo/page', 'demo/tray', 'demo/optional', { toString: 0 }] });
  assert.deepEqual(Array.from(f.demands.get('page')), ['demo/page']);
  action(f.event, { surface: 'page', ref: 'demo/page', input: { type: 'press', action: 'go' }, revision: 7 });
  assert.equal(f.calls.length, 1);
  assert.throws(() => action({ sender: f.sender, senderFrame: {} }, { surface: 'page', ref: 'demo/page' }), /active plugin view/);
  f.settings.pluginMainPages = [];
  assert.throws(() => action(f.event, { surface: 'page', ref: 'demo/page' }), /placement was removed/);
  f.runtime.settingsChanged(); assert.deepEqual(Array.from(f.demands.get('page')), []);
  f.runtime.dispose();
});
test('destroying the main sender releases its demand', () => {
  const f = fixture(); f.events.get('plugins:demand')(f.event, { surface: 'page', refs: ['demo/page'] });
  f.sender.emit('destroyed'); assert.deepEqual(Array.from(f.demands.get('page')), []); f.runtime.dispose();
});
