'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { createPluginPages } = require('../../src/electron/plugins/pages');
function fixture() {
  const handlers = new Map(), windows = [], demands = [], messages = [];
  class Window extends EventEmitter {
    constructor() { super(); windows.push(this); this.visible = false; this.minimized = false; this.webContents = new EventEmitter();
      Object.assign(this.webContents, { setWindowOpenHandler() {}, send: (channel, payload) => messages.push({ channel, payload }) }); }
    isDestroyed() { return Boolean(this.dead); } isVisible() { return this.visible; } isMinimized() { return this.minimized; }
    show() { this.visible = true; this.emit('show'); } hide() { this.visible = false; this.emit('hide'); }
    minimize() { this.minimized = true; this.emit('minimize'); } restore() { this.minimized = false; this.emit('restore'); }
    focus() {} loadFile() { return Promise.resolve(); }
    destroy() { this.dead = true; this.emit('closed'); }
  }
  const plugin = { id: 'demo', name: 'Demo', status: 'active', views: [
    { ref: 'demo/first', title: 'First', surfaces: ['page'] }, { ref: 'demo/second', title: 'Second', surfaces: ['page'] }] };
  const manager = { payload: surface => ({ surface, views: Object.fromEntries((demands.at(-1)?.[1] || []).map(ref => [ref, { ref, status: 'ok' }])) }), list: () => ({ plugins: [plugin] }), onViews: () => () => {}, onChanged: () => () => {}, setSurfaceDemand: (surface, refs) => demands.push([surface, refs]) };
  const pages = createPluginPages({ BrowserWindow: Window, ipcMain: { handle: (id, fn) => handlers.set(id, fn), removeHandler: id => handlers.delete(id) }, manager,
    getSettings: () => ({ themeColors: { accent: '#abcdef' }, interfaceFontFamily: 'Georgia', displayFontFamily: 'Arial', reduceMotion: 'on', tokenNumberAnimation: 'count', secret: 'never expose' }), getLocale: () => 'en' });
  return { pages, handlers, windows, demands, messages, manager };
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
