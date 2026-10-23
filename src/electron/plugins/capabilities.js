'use strict';
const { randomUUID } = require('node:crypto');

function capabilityError(error) {
  const fields = {};
  for (const [key, value] of Object.entries(error?.fields || {}).slice(0, 64)) {
    if (/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) && typeof value === 'string') Object.defineProperty(fields, key, { value: value.slice(0, 80), enumerable: true });
  }
  return { message: String(error?.message || error || 'Request failed').slice(0, 300),
    code: typeof error?.code === 'string' ? error.code.slice(0, 80) : 'capability-failed', fields };
}

// Transport-neutral author capabilities. Worker and web controllers retain
// authority/lifecycle ownership; this adapter only scopes subscriptions and
// fences async replies. It never selects a window, starts a collector or logs in.
function createPluginCapabilities({ businessData }) {
  const owners = new Map();
  function release(owner) {
    const state = owners.get(owner);
    if (state) state.live = false;
    owners.delete(owner);
    if (state) businessData.releaseOwner(state.serviceOwner);
  }
  async function call(owner, op, args = {}, context) {
    const initial = context.auth();
    if (!initial?.active) throw new Error('capability revoked');
    const identity = value => JSON.stringify([value.pluginId, value.revision, [...(value.permissions || [])].sort(), value.scope]);
    const stamp = identity(initial);
    let state = owners.get(owner);
    if (state && state.stamp !== stamp) { release(owner); state = null; }
    if (!state) { state = { live: true, stamp, serviceOwner: randomUUID(), subscriptions: new Map() }; owners.set(owner, state); }
    const auth = () => {
      const value = context.auth();
      return { ...value, active: state.live && value.active === true && identity(value) === stamp };
    };
    if (!auth().active) throw new Error('capability revoked');
    let result;
    if (op === 'data.query') result = await businessData.query(args.query, auth);
    else if (op === 'data.subscribe') {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(args.id || '')) throw new Error('invalid subscription id');
      if (!state.subscriptions.has(args.id) && state.subscriptions.size >= 16) throw new Error('subscription limit');
      const previous = state.subscriptions.get(args.id);
      if (previous !== undefined) businessData.unsubscribe(state.serviceOwner, previous);
      const id = businessData.subscribe(state.serviceOwner, args.query, auth, value => {
        if (auth().active) context.send({ id: args.id, value });
      });
      state.subscriptions.set(args.id, id);
      result = true;
    } else if (op === 'data.unsubscribe') {
      const id = state.subscriptions.get(args.id);
      if (id !== undefined) businessData.unsubscribe(state.serviceOwner, id);
      state.subscriptions.delete(args.id);
      result = true;
    } else if (op === 'settings.get') result = await context.settings.get();
    else if (op === 'settings.update') result = await context.settings.update(args);
    else if (op === 'settings.reset') result = await context.settings.reset(args);
    else throw new Error('unsupported capability');
    if (!auth().active) throw new Error('capability revoked');
    return result;
  }
  return { call, release, async invoke(...args) {
    try { return { __tmCapability: 1, ok: true, value: await call(...args) }; }
    catch (error) { return { __tmCapability: 1, ok: false, error: capabilityError(error) }; }
  }, dispose() { for (const owner of owners.keys()) release(owner); } };
}
module.exports = { createPluginCapabilities, capabilityError };
