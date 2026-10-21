'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { normalizeAppearance } = require('../../shared/plugins/appearance');
function createPluginAppearance({ file, fsImpl = fs }) {
  let value = normalizeAppearance(), error = '';
  try {
    if (fsImpl.statSync(file).size > 8192) throw new Error('saved plugin style is too large');
    value = normalizeAppearance(JSON.parse(fsImpl.readFileSync(file, 'utf8')));
  } catch (reason) { if (reason.code !== 'ENOENT') error = reason.message; }
  return {
    get: () => structuredClone(value),
    state: () => ({ value: structuredClone(value), error }),
    set(raw) {
      const next = normalizeAppearance(raw);
      fsImpl.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      try { fsImpl.writeFileSync(temp, JSON.stringify(next), { mode: 0o600 }); fsImpl.renameSync(temp, file); }
      catch (reason) { try { fsImpl.unlinkSync(temp); } catch {} throw reason; }
      value = next; error = ''; return this.state();
    }
  };
}
module.exports = { createPluginAppearance };
