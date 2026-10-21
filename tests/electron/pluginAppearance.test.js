'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { normalizeAppearance } = require('../../src/shared/plugins/appearance');
const { createPluginAppearance } = require('../../src/electron/plugins/appearance');
test('style persistence keeps the last valid saved style after rejected input or failed writes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-style-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'appearance.json'); const store = createPluginAppearance({ file });
  const expected = store.set({ font: 'mono', density: 'comfortable', colors: { accent: '#ABCDEF' } }).value;
  assert.deepEqual(createPluginAppearance({ file }).get(), expected);
  for (const bad of [{ font: 'url(https://bad.test)' }, { colors: { accent: 'red;display:none' } }, [], null]) assert.throws(() => store.set(bad));
  assert.deepEqual(store.get(), expected);
  const broken = createPluginAppearance({ file, fsImpl: { ...fs, renameSync() { throw new Error('write blocked'); } } });
  assert.throws(() => broken.set({ panel: 'soft' }), /write blocked/);
  assert.deepEqual(broken.get(), expected); assert.deepEqual(createPluginAppearance({ file }).get(), expected);
  const clone = store.get(); clone.colors.accent = '#000000'; assert.equal(store.get().colors.accent, '#abcdef');
});
test('style import cannot carry markup, arbitrary CSS or network assets', () => {
  const value = normalizeAppearance({ css: 'body{display:none}', fontUrl: 'https://example.test/a.woff', colors: { text: '#ffffff', arbitrary: 'url(x)' } });
  assert.deepEqual(Object.keys(value).sort(), ['colors','corners','density','font','panel']);
  assert.deepEqual(value.colors, { text: '#ffffff' });
});
test('malformed stored style is reported without silently replacing the original', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-style-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'appearance.json'); fs.writeFileSync(file, '{broken');
  const store = createPluginAppearance({ file }); assert(store.state().error); assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  store.set({}); assert.equal(createPluginAppearance({ file }).state().error, '');
});
