'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createPluginManager } = require('../../src/electron/plugins/manager');
const { createDataBus } = require('../../src/shared/plugins/dataBus');
const { createWebUi } = require('../../src/electron/plugins/webUi');
const { createPluginPages } = require('../../src/electron/plugins/pages');
function fixture(options = {}) {
  const handlers = new Map(), windows = [], demands = [], messages = [];
  class Window extends EventEmitter {
    constructor() { super(); windows.push(this); this.visible = false; this.minimized = false; this.webContents = new EventEmitter();
      Object.assign(this.webContents, { id: windows.length, mainFrame: {}, getZoomFactor: () => 1, isDestroyed: () => this.isDestroyed(), setWindowOpenHandler() {}, send: (channel, payload) => messages.push({ channel, payload }) }); }
    isDestroyed() { return Boolean(this.dead); } isVisible() { return this.visible; } isMinimized() { return this.minimized; }
    show() { this.visible = true; this.emit('show'); } hide() { this.visible = false; this.emit('hide'); }
    minimize() { this.minimized = true; this.emit('minimize'); } restore() { this.minimized = false; this.emit('restore'); }
    getContentSize() { return [880, 640]; }
    contentView = { addChildView() {}, removeChildView() {} };
    static fromWebContents(sender) { return windows.find(win => win.webContents === sender); }
    focus() {} loadFile() { return Promise.resolve(); }
    destroy() { this.dead = true; this.emit('closed'); }
  }
  const plugin = { id: 'demo', name: 'Demo', status: 'active', views: [
    { ref: 'demo/first', title: 'First', surfaces: ['page'] }, { ref: 'demo/second', title: 'Second', surfaces: ['page'] }] };
  const manager = options.manager || { payload: surface => ({ surface, views: Object.fromEntries((demands.at(-1)?.[1] || []).map(ref => [ref, { ref, status: 'ok' }])) }), list: () => ({ plugins: [plugin] }), onViews: () => () => {}, onChanged: () => () => {}, setSurfaceDemand: (surface, refs) => demands.push([surface, refs]) };
  const ipcMain = { handle: (id, fn) => handlers.set(id, fn), removeHandler: id => handlers.delete(id) };
  const pages = createPluginPages({ BrowserWindow: Window, ipcMain, manager,
    getSettings: options.getSettings || (() => ({ themeColors: { accent: '#abcdef' }, interfaceFontFamily: 'Georgia', displayFontFamily: 'Arial', reduceMotion: 'on', tokenNumberAnimation: 'count', secret: 'never expose' })), getLocale: () => 'en' });
  return { pages, handlers, windows, demands, messages, manager, Window, ipcMain };
}
test('independent plugin pages follow native visibility and reuse their window', () => {
  const f = fixture(); f.pages.open('demo/first'); const win = f.windows[0]; win.emit('ready-to-show');
  assert.deepEqual(f.demands.at(-1), ['page', ['demo/first']]);
  assert.equal(f.messages.at(-1).payload.views['demo/first'].status, 'ok');
  win.minimize(); assert.deepEqual(f.demands.at(-1), ['page', []]);
  f.pages.open('demo/second'); assert.equal(f.windows.length, 1); assert.deepEqual(f.demands.at(-1), ['page', ['demo/second']]);
  win.hide(); assert.deepEqual(f.demands.at(-1), ['page', []]);
  win.show(); win.destroy(); assert.deepEqual(f.demands.at(-1), ['page', []]); f.pages.dispose();
});
test('page IPC accepts only its native sender and views of the same plugin', () => {
  const f = fixture(); f.pages.open('demo/first'); const event = { sender: f.windows[0].webContents };
  assert.throws(() => f.handlers.get('pluginPage:metadata')({ sender: {} }), /not a plugin page/);
  assert.throws(() => f.handlers.get('pluginPage:select')(event, 'other/first'), /does not belong/);
  const metadata = f.handlers.get('pluginPage:metadata')(event);
  assert.equal(metadata.secret, undefined);
  assert.deepEqual(metadata.appearance, { interfaceFontFamily: 'Georgia', displayFontFamily: 'Arial', textSize: undefined, reduceMotion: 'on', tokenNumberAnimation: 'count' });
  assert.equal(f.handlers.get('pluginPage:select')(event, 'demo/second').ref, 'demo/second'); f.pages.dispose();
});

test('page action IPC rejects other views, foreign frames and hidden windows', () => {
  const f = fixture(); f.pages.open('demo/first'); const win = f.windows[0]; win.emit('ready-to-show');
  const sent = []; f.manager.interact = (...args) => sent.push(args);
  const interact = f.handlers.get('pluginPage:interact');
  interact({ sender: win.webContents }, 'demo/first', { action: 'save', type: 'press' }, 7);
  assert.deepEqual(sent[0], ['page', 'demo/first', { action: 'save', type: 'press' }, 7]);
  assert.throws(() => interact({ sender: win.webContents }, 'demo/second', {}, 7), /visible plugin page/);
  assert.throws(() => interact({ sender: win.webContents, senderFrame: {} }, 'demo/first', {}, 7), /not a plugin page/);
  win.hide(); assert.throws(() => interact({ sender: win.webContents }, 'demo/first', {}, 7), /visible plugin page/); f.pages.dispose();
});


// Real normalized manifests and manager DTOs: placements belong to the runtime's
// main-menu list, and must never be fabricated on manager.list() in this test.
function realFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-detached-pages-'));
  const userDir = path.join(root, 'plugins');
  const manifest = {
    id: 'demo', name: 'Demo', version: '1.0.0', tmApi: 1, permissions: ['ui.web'],
    views: ['first', 'second', 'home'].map(id => ({ id, title: id, surfaces: [id === 'home' ? 'home' : 'page'], layout: { type: 'text', text: 'Fallback' } })),
    webUi: { version: 1, assets: ['body.html'], documents: ['first', 'second'].map(view => ({
      id: `${view}-rich`, view, target: 'page', slot: 'replace', entry: 'body.html', retainMs: 'until-evicted'
    })) }
  };
  const dir = path.join(userDir, manifest.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'body.html'), '<!doctype html><p>Rich page</p>');
  let settings = { pluginsEnabled: true, pluginStates: {}, pluginMainPages: [] };
  const bus = createDataBus();
  const manager = createPluginManager({ builtinDir: path.join(root, 'builtin'), userDir, dataDir: path.join(root, 'data'), bus,
    getSettings: () => settings, saveStates: pluginStates => { settings = { ...settings, pluginStates }; } });
  manager.reload(); manager.setEnabled('demo', true);
  const f = fixture({ manager, getSettings: () => settings });
  t.after(() => { f.pages.dispose(); manager.dispose(); bus.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  assert.equal(manager.list().plugins[0].status, 'active');
  assert.equal(manager.list().plugins[0].views[0].placements, undefined);
  return { ...f, bus, root, setMainPages: refs => { settings = { ...settings, pluginMainPages: refs }; } };
}

test('real manager detached authority follows explicit open independently of main-menu placement', t => {
  const f = realFixture(t);
  f.pages.open('demo/first'); const win = f.windows[0]; win.emit('ready-to-show');
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  const context = ref => f.pages.presentationContext(event, 'page', ref);
  assert.deepEqual(context('demo/first'), { visible: true }, 'explicit open needs no main-menu placement');
  f.setMainPages(['demo/first']); assert.deepEqual(context('demo/first'), { visible: true });
  f.setMainPages([]); assert.deepEqual(context('demo/first'), { visible: true }, 'removing a menu entry does not revoke a detached owner');
  assert.equal(f.pages.presentationContext(event, 'home', null), null);
  assert.equal(f.pages.presentationContext({ sender: {} }, 'page', null), null);
  assert.equal(f.pages.presentationContext({ ...event, senderFrame: {} }, 'page', 'demo/first'), null);
  assert.equal(context('demo/second'), null);
  assert.equal(context('other/first'), null);
  assert.equal(context('demo/home'), null);
  assert.throws(() => f.pages.open('demo/home'), /unavailable/);
  win.hide(); assert.deepEqual(context('demo/first'), { visible: false });
  win.show(); win.minimize(); assert.deepEqual(context('demo/first'), { visible: false });
  win.restore(); assert.deepEqual(context('demo/first'), { visible: true });
  f.handlers.get('pluginPage:select')(event, 'demo/second');
  assert.equal(context('demo/first'), null);
  assert.deepEqual(context('demo/second'), { visible: true });
  f.manager.setEnabled('demo', false); assert.equal(context('demo/second'), null);
  f.manager.setEnabled('demo', true); assert.deepEqual(context('demo/second'), { visible: true });
  win.destroy(); assert.equal(context(null), null); assert.equal(context('demo/second'), null);
});

// Only Electron primitives are faked; admission, package loading, retention and
// revocation use the production pages + manager + Web UI controllers.
function richController(f) {
  let nextId = 100;
  class View {
    constructor() {
      const wc = this.webContents = new EventEmitter();
      const debug = wc.debugger = new EventEmitter();
      Object.assign(debug, { isAttached: () => Boolean(debug.attached), attach() { debug.attached = true; },
        detach() { debug.attached = false; debug.emit('detach'); }, sendCommand: async () => {} });
      Object.assign(wc, { id: nextId++, mainFrame: {}, getOSProcessId: () => 1, setWindowOpenHandler() {}, setZoomFactor() {},
        isDestroyed: () => Boolean(wc.dead), isFocused: () => false, getURL: () => wc.url,
        loadURL: async url => { wc.url = url; }, send() {}, close() { wc.dead = true; }, executeJavaScript: async () => 0 });
    }
    setVisible(value) { this.visible = value; } setBounds() {} setBackgroundColor() {}
  }
  const session = new EventEmitter();
  Object.assign(session, { setPermissionRequestHandler() {}, setPermissionCheckHandler() {},
    webRequest: { onBeforeRequest() {} }, protocol: { handle() {}, unhandle() {} }, clearStorageData: async () => {} });
  return createWebUi({ electron: { BrowserWindow: f.Window, WebContentsView: View, ipcMain: f.ipcMain,
    session: { fromPartition: () => session }, app: { getAppMetrics: () => [{ pid: 1, memory: { workingSetSize: 1 } }] } },
  manager: f.manager, bus: f.bus, isMainSender: () => false,
  presentationContext: f.pages.presentationContext, file: path.join(f.root, 'selections.json') });
}

test('real manager detached Rich mounts, retains while hidden and destroys revoked owners', async t => {
  const f = realFixture(t), webUi = richController(f);
  t.after(() => webUi.dispose());
  f.pages.open('demo/first'); const win = f.windows[0]; win.emit('ready-to-show');
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  const input = { surface: 'page', visible: true, entries: [{ instance: 'body', viewRef: 'demo/first', ref: 'demo/first-rich', rect: { x: 10, y: 10, width: 400, height: 300 } }] };
  const sync = () => f.handlers.get('plugins:presentation:sync')(event, input);
  const call = (item, op, args) => f.handlers.get('plugins:web:call')({ sender: item.view.webContents, senderFrame: item.view.webContents.mainFrame }, op, args);
  const ready = () => {
    sync();
    assert.equal(webUi.presentations().length, 1, 'the real manager page document must mount');
    const item = webUi.presentations()[0];
    item.view.webContents.emit('did-finish-load'); call(item, 'present');
    assert.deepEqual(sync(), { mounted: ['body'] });
    return item;
  };
  const first = ready();
  win.hide(); await first.lifecycle;
  assert.deepEqual(webUi.presentations(), []);
  assert.deepEqual(webUi.cached(), [first]);
  assert.equal(first.view.visible, false);
  assert.throws(() => call(first, 'context'), /revoked/);
  sync(); assert.deepEqual(webUi.cached(), [first], 'hidden sync preserves eligible retained ownership');
  win.show(); sync(); await first.lifecycle;
  assert.equal(webUi.presentations()[0], first, 'show reuses the retained document');
  call(first, 'resumed', first.epoch); assert.deepEqual(sync(), { mounted: ['body'] });
  f.setMainPages(['demo/first']); webUi.refreshPresentations();
  f.setMainPages([]); webUi.refreshPresentations();
  assert.equal(webUi.presentations()[0], first, 'main-menu removal does not revoke an explicitly opened window');
  win.minimize(); await first.lifecycle;
  f.manager.setEnabled('demo', false);
  assert.deepEqual(webUi.cached(), []); assert.equal(first.dead, true);
  assert.throws(() => call(first, 'context'), /revoked/);
  win.restore(); f.manager.setEnabled('demo', true);
  const second = ready();
  f.handlers.get('pluginPage:select')(event, 'demo/second'); webUi.refreshPresentations();
  assert.equal(second.dead, true, 'selection change revokes the previous view');
  assert.deepEqual(sync(), { mounted: [] }, 'the old view cannot remount');
  f.pages.open('demo/first'); const third = ready();
  win.hide(); await third.lifecycle;
  win.destroy(); assert.equal(third.dead, true); assert.deepEqual(webUi.cached(), []);
});
