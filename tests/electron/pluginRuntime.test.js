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
  const nativeRequire = createRequire(file), handlers = new Map(), events = new Map(), calls = [], messages = [], demands = new Map();
  const sender = new EventEmitter(); sender.id = 1; sender.mainFrame = {}; sender.isDestroyed = () => false; sender.send = (channel, payload) => messages.push({ channel, payload });
  const native = { visible: true };
  const settings = { notchPluginPages: ['demo/native'], pluginMainPages: ['demo/page'], pluginsEnabled: true };
  const manager = { list: () => ({ plugins: [{ id: 'demo', status: 'active', views: [
    { ref: 'demo/native', surfaces: ['notch'] }, { ref: 'demo/page', surfaces: ['page'] }, { ref: 'demo/tray', surfaces: ['tray'] }, { ref: 'demo/optional', surfaces: ['page'] } ] }] }),
  onViews: () => () => {}, onChanged: () => () => {}, reload() {}, settingsChanged() {}, dispose() {},
  interact: (...args) => calls.push(args), setSurfaceDemand: (surface, refs) => demands.set(surface, refs), payload: surface => ({ surface, views: Object.fromEntries((demands.get(surface) || []).map(ref => [ref, { ref, status: "ok" }])) }) };
  const mocks = {
    '../../shared/plugins/dataBus': { createDataBus: () => ({ defineSource() {}, defineAlias() {}, dispose() {} }) },
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
  isSurfaceSender: event => event.sender === sender, surfaceContext: () => native, isMainSender: event => event.sender === sender, env: { TOKEN_MONITOR_PLUGINS_SAFE_MODE: '1' } });
  runtime.start();
  return { native, runtime, handlers, events, sender, settings, calls, demands, messages, event: { sender, senderFrame: sender.mainFrame } };
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

test('faded native surfaces release saved demand without a renderer visibility event and resume once', () => {
  const f = fixture();
  f.events.get('topNotch:pluginDemand')(f.event, { refs: ['demo/native'] });
  assert.deepEqual(Array.from(f.demands.get('notch')), ['demo/native']);
  f.native.visible = false; f.runtime.refreshWebSurfaces();
  assert.deepEqual(Array.from(f.demands.get('notch')), []);
  f.events.get('topNotch:pluginDemand')(f.event, { refs: ['demo/native'] });
  assert.deepEqual(Array.from(f.demands.get('notch')), []);
  f.native.visible = true; f.runtime.refreshWebSurfaces();
  assert.deepEqual(Array.from(f.demands.get('notch')), ['demo/native']);
  f.settings.notchPluginPages = []; f.runtime.settingsChanged();
  assert.deepEqual(Array.from(f.demands.get('notch')), []);
  f.runtime.dispose();
});

test('opening and reopening delivers current authoritative data without the update throttle', () => {
  const f = fixture(), send = f.events.get('plugins:demand');
  for (const surface of ['page', 'tray']) {
    const ref = `demo/${surface}`;
    send(f.event, { surface, refs: [ref] });
    assert.equal(f.messages.at(-1)?.payload.views[ref]?.status, 'ok');
    send(f.event, { surface, refs: [] });
    send(f.event, { surface, refs: [ref] });
    assert.equal(f.messages.at(-1)?.payload.views[ref]?.status, 'ok');
  }
  f.events.get('topNotch:pluginDemand')(f.event, { refs: ['demo/native'] });
  assert.equal(f.messages.at(-1)?.payload.views['demo/native']?.status, 'ok');
  f.native.visible = false;
  f.events.get('topNotch:pluginDemand')(f.event, { refs: ['demo/native'] });
  assert.equal(Object.keys(f.messages.at(-1).payload.views).length, 0);
  f.settings.pluginMainPages = [];
  send(f.event, { surface: 'page', refs: ['demo/page'] });
  assert.equal(Object.keys(f.messages.at(-1).payload.views).length, 0);
  f.runtime.dispose();
});


test('explicit native opening prepares data but collapse releases demand immediately', () => {
  const f = fixture();
  f.native.visible = false; f.native.preparing = true;
  f.events.get('topNotch:pluginDemand')(f.event, { refs: ['demo/native'] });
  assert.deepEqual(Array.from(f.demands.get('notch')), ['demo/native']);
  assert.equal(f.messages.at(-1).payload.views['demo/native'].status, 'ok');
  f.native.preparing = false; f.runtime.refreshWebSurfaces();
  assert.deepEqual(Array.from(f.demands.get('notch')), []);
  f.runtime.dispose();
});
