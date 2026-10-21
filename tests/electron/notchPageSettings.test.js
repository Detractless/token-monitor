'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Element } = require('../helpers/notchPanel');
const { entries, render } = require('../../src/electron/renderer/notch/pageSettings');
const i18n = require('../../src/electron/renderer/i18n');
const pluginViews = require('../../src/electron/renderer/pluginViews');

const t = (key, params) => i18n.translate('en', key, params);
const flush = () => new Promise(setImmediate);

function documentStub() {
  const document = { activeElement: null };
  document.createElement = tag => new Element(tag, document);
  document.createElementNS = (_ns, tag) => new Element(tag, document);
  document.body = new Element('body', document);
  return document;
}

const catalog = {
  plugins: [
    { id: 'pulse', name: 'Token Pulse', status: 'active', views: [
      { ref: 'pulse/main', title: 'Token Pulse', icon: 'cpu', surfaces: ['notch'], placements: { notch: true } },
      { ref: 'pulse/mini', title: 'Mini', icon: 'memory', surfaces: ['notch', 'page'], placements: { notch: false } },
      { ref: 'pulse/elsewhere', title: 'Elsewhere', surfaces: ['page'], placements: {} }
    ] },
    { id: 'idle', name: 'Idle', status: 'error', views: [
      { ref: 'idle/main', title: 'Idle View', surfaces: ['notch'], placements: { notch: false } }
    ] }
  ]
};

test('entries pair a short label, a de-duplicated title and the tab icon', () => {
  const list = entries({}, catalog, t);
  assert.deepEqual(list.map(entry => entry.id),
    ['home', 'limits', 'sessions', 'breakdown', 'plugin:pulse/main', 'plugin:pulse/mini', 'plugin:idle/main']);
  assert.deepEqual(list.slice(0, 4).map(entry => [entry.label, entry.icon.name]),
    [['Home', 'home'], ['Limits', 'limits'], ['Sessions', 'session'], ['Breakdown', 'model']]);
  const same = list.find(entry => entry.id === 'plugin:pulse/main');
  assert.equal(same.title, 'Token Pulse', 'a view named like its plugin is not doubled');
  assert.equal(same.label, 'Token Pulse');
  const mini = list.find(entry => entry.id === 'plugin:pulse/mini');
  assert.equal(mini.title, 'Token Pulse · Mini');
  assert.equal(mini.label, 'Mini');
  assert.deepEqual(mini.icon, { kind: 'plugin', name: 'memory' });
  assert.equal(mini.checked, false);
  assert.equal(same.checked, true);
});

test('entries disable unavailable plugins but keep a checked one removable', () => {
  const list = entries({}, catalog, t);
  const idle = list.find(entry => entry.id === 'plugin:idle/main');
  assert.equal(idle.unavailable, true);
  assert.equal(idle.checked, false);
  const disabled = entries({ pluginsEnabled: false }, catalog, t);
  assert.equal(disabled.find(entry => entry.id === 'plugin:pulse/main').unavailable, true,
    'the plugins-enabled master switch gates every plugin entry');
  const chosen = entries({ notchBuiltinPages: ['home'] }, catalog, t);
  assert.deepEqual(chosen.slice(0, 4).map(entry => entry.checked), [true, false, false, false]);
});

test('chips toggle through click, restore state on failure and keep focus', async () => {
  const document = documentStub();
  const container = new Element('div', document);
  document.body.append(container);
  let errors = 0, fail = false;
  const options = {
    document, container, settings: {}, catalog, t,
    save: async patch => { if (fail) throw new Error('disk'); Object.assign(options.settings, patch); },
    place: async (ref, placed) => {
      for (const plugin of catalog.plugins) {
        const view = (plugin.views || []).find(candidate => candidate.ref === ref);
        if (view) view.placements.notch = placed;
      }
    },
    pluginIcon: name => pluginViews.iconNode(document, name, null, 14),
    onError: () => { errors += 1; }
  };
  render(options);
  const chip = id => container.querySelectorAll('button').find(node => node.dataset.page === id);
  assert.equal(container.querySelectorAll('button').length, 7);
  assert.equal(chip('home').children[0].className, 'view-switcher-icon view-icon-home');
  assert.equal(chip('home').children[1].textContent, 'Home');
  assert.equal(chip('home').attributes['aria-pressed'], 'true');
  assert.equal(chip('plugin:pulse/main').title, undefined, 'label and title agree, so no tooltip');
  assert.equal(chip('plugin:pulse/mini').title, 'Token Pulse · Mini');
  assert.equal(chip('plugin:pulse/mini').attributes['aria-label'], 'Token Pulse · Mini');
  assert.ok(chip('plugin:pulse/mini').querySelector('.pv-icon'), 'plugin chips paint the plugin icon');
  assert.equal(chip('plugin:idle/main').disabled, true, 'an unchecked unavailable page cannot be enabled');

  chip('limits').focus();
  chip('limits').fire('click', {});
  await flush(); await flush();
  assert.deepEqual(options.settings.notchBuiltinPages, ['home', 'sessions', 'breakdown']);
  assert.equal(chip('limits').attributes['aria-pressed'], 'false');

  chip('plugin:pulse/mini').fire('click', {});
  await flush(); await flush();
  assert.equal(catalog.plugins[0].views[1].placements.notch, true);
  assert.equal(chip('plugin:pulse/mini').attributes['aria-pressed'], 'true');

  fail = true;
  chip('sessions').focus();
  chip('sessions').fire('click', {});
  await flush(); await flush();
  assert.equal(errors, 1);
  assert.equal(chip('sessions').attributes['aria-pressed'], 'true', 'a failed save rolls the chip back');
  assert.equal(document.activeElement?.dataset.page, 'sessions', 'focus lands back on the toggled chip');
});

test('a focused chip survives re-renders while the container is saving', async () => {
  const document = documentStub();
  const container = new Element('div', document);
  document.body.append(container);
  const options = {
    document, container, settings: {}, catalog, t,
    save: async () => {}, place: async () => {}, onError: () => {}
  };
  render(options);
  const home = container.querySelectorAll('button').find(node => node.dataset.page === 'home');
  home.focus();
  render(options);
  assert.equal(document.activeElement?.dataset.page, 'home', 're-rendering restores focus by page key');
  container.dataset.saving = 'true';
  const before = container.querySelectorAll('button').length;
  render(options);
  assert.equal(container.querySelectorAll('button').length, before, 'a save in flight does not rebuild mid-gesture');
});
