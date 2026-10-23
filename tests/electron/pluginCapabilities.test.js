'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginCapabilities } = require('../../src/electron/plugins/capabilities');
const { createBusinessDataService } = require('../../src/electron/plugins/businessData');

test('capability owners isolate IDs and release cancels delayed replies across resume', async () => {
  let resolve;
  const registrations = new Map(); let sequence = 0;
  const service = {
    query: () => new Promise(done => { resolve = done; }),
    subscribe(owner, query, auth, send) { const id = ++sequence; registrations.set(id, { owner, auth, send }); return id; },
    unsubscribe(owner, id) { if (registrations.get(id)?.owner === owner) registrations.delete(id); },
    releaseOwner(owner) { for (const [id, value] of registrations) if (value.owner === owner) registrations.delete(id); }
  };
  const api = createPluginCapabilities({ businessData: service });
  const a = {}, b = {}, received = [];
  let revision = 1;
  const context = { auth: () => ({ pluginId: 'alpha', active: true, revision, permissions: ['tm.data.usage'] }), send: event => received.push(event) };
  await api.call(a, 'data.subscribe', { id: 'same', query: {} }, context);
  await api.call(b, 'data.subscribe', { id: 'same', query: {} }, context);
  assert.equal(registrations.size, 2);
  const stale = [...registrations.values()][0];
  const pending = api.call(a, 'data.query', {}, context);
  api.release(a);
  assert.equal(registrations.size, 1);
  await api.call(a, 'data.subscribe', { id: 'same', query: {} }, context);
  stale.send({ secret: 'late' }); assert.deepEqual(received, []);
  resolve({ secret: 'late' }); await assert.rejects(pending, /revoked/);
  revision++;
  for (const value of registrations.values()) value.send({ secret: 'old generation' });
  assert.deepEqual(received, []);
  api.dispose(); assert.equal(registrations.size, 0);
});

test('structured settings errors survive Rich envelope and awaited writes are fenced', async () => {
  const api = createPluginCapabilities({ businessData: { releaseOwner() {} } });
  let active = true, finish;
  const context = { auth: () => ({ active, pluginId: 'alpha', revision: 1 }), settings: {
    get() { throw Object.assign(new Error('invalid'), { code: 'invalid-settings-values', fields: { count: 'range' } }); },
    update() { return new Promise(done => { finish = done; }); }
  } };
  const result = await api.invoke({}, 'settings.get', {}, context);
  assert.deepEqual(result, { __tmCapability: 1, ok: false, error: { message: 'invalid', code: 'invalid-settings-values', fields: { count: 'range' } } });
  const pending = api.call({}, 'settings.update', {}, context); active = false; finish({ revision: 2 });
  await assert.rejects(pending, /revoked/); api.dispose();
});

test('release before initial subscription delivery prevents cache reads', async () => {
  let reads = 0;
  const businessData = createBusinessDataService({ loadHistory: () => { reads++; return {}; } });
  businessData.publish({});
  const api = createPluginCapabilities({ businessData }); const owner = {};
  const pending = api.call(owner, 'data.subscribe', { id: 'history', query: { version: 1, resource: 'history' } }, {
    auth: () => ({ active: true, pluginId: 'alpha', permissions: ['tm.data.history'] }), send() { assert.fail('late delivery'); }
  });
  api.release(owner); await pending; await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0); api.dispose(); businessData.dispose();
});
