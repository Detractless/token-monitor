'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const semver = require('semver');
const { ID_RE, MAX_PACKAGE_BYTES, readBounded, parsePackage, packageDirectory, unpackPackage, describePackage } = require('./package');
const { removePluginPlacements } = require('./placementSettings');
const SETTING_KEYS = ['pluginStates', 'homeModuleOrder', 'hiddenHomeModules', 'edgeDockItems', 'trayCustomLayout', 'notchPluginPages', 'pluginMainPages'];
const MAX_REGISTRY_BYTES = 1024 * 1024;
const MAX_JOURNAL_BYTES = 2 * 1024 * 1024;
function boundedJson(value, limit) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > limit) throw new Error(`plugin metadata exceeds ${limit} bytes`);
  return json;
}
function atomicJson(file, value, limit = Infinity) {
  const json = boundedJson(value, limit);
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, json); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
// One synchronous transaction at a time. A prepared journal always rolls back;
// only a persisted committed journal permits removal of the recovery copies.
function createManagedPlugins({ root, userDir, dataDir, manager, getSettings, saveSettings, getLocale = () => 'en', now = Date.now, fault = () => {} }) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.mkdirSync(userDir, { recursive: true, mode: 0o700 });
  const registryFile = path.join(root, 'installed.json');
  const journalFile = path.join(root, 'transaction.json');
  const txDir = path.join(root, 'transaction');
  const historyDir = path.join(root, 'previous');
  fs.mkdirSync(historyDir, { recursive: true, mode: 0o700 });
  let registry = Object.create(null), busy = false;
  const previews = new Map();
  function readRegistry() {
    if (!fs.existsSync(registryFile)) return Object.create(null);
    const data = JSON.parse(readBounded(registryFile, MAX_REGISTRY_BYTES));
    if (!data || Array.isArray(data) || Object.keys(data).some(id => !ID_RE.test(id))) throw new Error('invalid installed plugin registry');
    return Object.assign(Object.create(null), data);
  }
  function settingsSnapshot() {
    const settings = getSettings();
    return Object.fromEntries(SETTING_KEYS.filter(key => settings[key] !== undefined).map(key => [key, structuredClone(settings[key])]));
  }
  function cleanup() {
    // Remove the journal last: a committed transaction can repeat cleanup.
    fs.rmSync(txDir, { recursive: true, force: true });
    fs.rmSync(journalFile, { force: true });
  }
  function recover() {
    if (!fs.existsSync(journalFile)) { registry = readRegistry(); return; }
    const j = JSON.parse(readBounded(journalFile, MAX_JOURNAL_BYTES));
    if (!ID_RE.test(j.id) || !['prepared', 'committed'].includes(j.phase)) throw new Error('invalid plugin recovery journal');
    if (j.phase === 'prepared') {
      const target = path.join(userDir, j.id), old = path.join(txDir, 'old'), stage = path.join(txDir, 'stage');
      if (fs.existsSync(old)) {
        fs.rmSync(target, { recursive: true, force: true }); fs.renameSync(old, target);
      } else if (!j.hadTarget && !fs.existsSync(stage) && j.operation !== 'uninstall') fs.rmSync(target, { recursive: true, force: true });
      const dataBackup = path.join(txDir, 'data.json');
      if (fs.existsSync(dataBackup)) { fs.mkdirSync(dataDir, { recursive: true }); fs.renameSync(dataBackup, path.join(dataDir, `${j.id}.json`)); }
      const previous = path.join(historyDir, `${j.id}.tmplugin`), previousBackup = path.join(txDir, 'previous.tmplugin');
      if (j.hadPrevious) fs.copyFileSync(previousBackup, previous);
      else fs.rmSync(previous, { force: true });
      atomicJson(registryFile, j.registry, MAX_REGISTRY_BYTES);
      saveSettings(j.settings);
      atomicJson(journalFile, { ...j, phase: 'committed' }, MAX_JOURNAL_BYTES);
    }
    cleanup(); registry = readRegistry();
  }
  function managed(id) {
    if (typeof id !== 'string' || !ID_RE.test(id) || !registry[id]) throw new Error('plugin is not a managed installation');
    const target = path.join(userDir, id);
    if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) throw new Error('managed plugin directory is missing or replaced');
    return registry[id];
  }
  function describe(id) { const item = registry[id]; return item ? { ...item, previousVersion: item.previousVersion || null } : null; }
  function assertInstallable(pkg, origin) {
    const id = pkg.manifest.id, installed = manager.list().plugins.find(p => p.id === id);
    if (installed?.source === 'builtin') throw new Error('built-in plugins are updated with the application');
    if (!registry[id] && (installed || fs.existsSync(path.join(userDir, id)))) throw new Error('a development plugin already uses this id; remove or rename that folder first');
    if (registry[id]) {
      managed(id);
      if (registry[id].origin.id !== origin.id) throw new Error('update source differs from the installed source; uninstall first to switch sources');
      if (!semver.gt(pkg.manifest.version, registry[id].version)) throw new Error('update must have a newer version; use Roll back for the saved previous version');
    }
    if (!registry[id] && manager.list().plugins.length >= 64) throw new Error('plugin limit reached');
  }
  function preview(pkg, origin = { id: 'local', kind: 'local', label: 'Local package' }) {
    assertInstallable(pkg, origin);
    const token = crypto.randomUUID();
    for (const [key, item] of previews) if (item.expires < now()) previews.delete(key);
    if (previews.size >= 8) previews.delete(previews.keys().next().value);
    previews.set(token, { pkg, origin: structuredClone(origin), expires: now() + 10 * 60 * 1000, baseline: JSON.stringify(registry[pkg.manifest.id] || null) });
    return { ...describePackage(pkg, { locale: getLocale(), grant: getSettings().pluginStates?.[pkg.manifest.id]?.grant }), token,
      operation: registry[pkg.manifest.id] ? 'update' : 'install', installedVersion: registry[pkg.manifest.id]?.version || null, origin };
  }
  function transact(id, operation, pkg, origin, options = {}) {
    if (busy) throw new Error('another plugin operation is in progress');
    if (fs.existsSync(journalFile)) throw new Error('plugin recovery is pending; restart the application before changing plugins');
    busy = true;
    let prepared = false, began = false, committed = false, recovered = true;
    try {
      fs.rmSync(txDir, { recursive: true, force: true }); fs.mkdirSync(txDir, { mode: 0o700 });
      const target = path.join(userDir, id), stage = path.join(txDir, 'stage');
      if (pkg) unpackPackage(pkg, stage);
      const previous = path.join(historyDir, `${id}.tmplugin`), hadPrevious = fs.existsSync(previous);
      if (hadPrevious) fs.copyFileSync(previous, path.join(txDir, 'previous.tmplugin'));
      let current = null;
      if (operation === 'update' || operation === 'rollback') {
        try {
          current = packageDirectory(target, { checkCompatibility: false });
          if (current.manifest.id !== id || current.manifest.version !== registry[id].version) throw new Error('installed package was changed outside the manager');
        } catch (error) {
          if (operation !== 'rollback') throw error;
          // Rescue may discard an unreadable current version. The saved target
          // was independently checked; never advertise corrupt code as a backup.
          current = null;
        }
      }
      const next = Object.assign(Object.create(null), registry);
      if (operation === 'uninstall') delete next[id];
      else next[id] = { version: pkg.manifest.version, sha256: pkg.hash, origin, installedAt: now(), previousVersion: current?.manifest.version || null, previousSha256: current?.hash || null };
      boundedJson(next, MAX_REGISTRY_BYTES);
      manager.beginMutation(); began = true;
      const before = settingsSnapshot();
      const j = { id, operation, phase: 'prepared', hadTarget: fs.existsSync(target), hadPrevious, registry, settings: before };
      boundedJson({ ...j, phase: 'committed' }, MAX_JOURNAL_BYTES);
      atomicJson(journalFile, j, MAX_JOURNAL_BYTES); prepared = true; fault('prepared');
      if (j.hadTarget) fs.renameSync(target, path.join(txDir, 'old'));
      fault('old-moved');
      if (pkg) fs.renameSync(stage, target);
      fault('new-moved');
      const patch = settingsSnapshot();
      patch.pluginStates = { ...(patch.pluginStates || {}) };
      if (operation === 'uninstall') {
        delete patch.pluginStates[id];
        if (!options.keepPlacements) Object.assign(patch, removePluginPlacements(getSettings(), id));
        if (!options.keepData && fs.existsSync(path.join(dataDir, `${id}.json`))) fs.renameSync(path.join(dataDir, `${id}.json`), path.join(txDir, 'data.json'));
        fs.rmSync(previous, { force: true });
      } else {
        if (current) fs.writeFileSync(previous, current.bytes, { mode: 0o600 });
        else fs.rmSync(previous, { force: true });
        if (operation === 'install') patch.pluginStates[id] = { enabled: false, background: false, grant: { permissions: [], hosts: [] } };
        // Updating never grants new capabilities. The manager pauses an enabled
        // plugin when its new manifest exceeds the previously accepted grant.
      }
      atomicJson(registryFile, next, MAX_REGISTRY_BYTES); fault('registry-written');
      saveSettings(patch); fault('settings-written');
      manager.reload(); fault('reloaded');
      atomicJson(journalFile, { ...j, phase: 'committed' }, MAX_JOURNAL_BYTES); committed = true; registry = next;
      cleanup();
      return describe(id);
    } catch (error) {
      if (prepared && !committed) {
        try { recover(); manager.reload(); } catch (recoveryError) { recovered = false; throw new Error(`${error.message}; recovery pending: ${recoveryError.message}`, { cause: recoveryError }); }
      }
      throw error;
    } finally {
      if (began && recovered) manager.endMutation();
      busy = false;
    }
  }
  return {
    recover, describe,
    preview,
    previewFile: file => preview(parsePackage(readBounded(file, MAX_PACKAGE_BYTES))),
    previewDirectory: dir => preview(packageDirectory(dir)),
    cancel(token) { previews.delete(token); },
    cancelSource(id) { for (const [token, preview] of previews) if (preview.origin.id === id) previews.delete(token); },
    install(token) {
      const item = previews.get(token); previews.delete(token);
      if (!item || item.expires < now()) throw new Error('package preview expired; select the package again');
      if (item.baseline !== JSON.stringify(registry[item.pkg.manifest.id] || null)) throw new Error('installed version changed; preview again');
      assertInstallable(item.pkg, item.origin);
      return transact(item.pkg.manifest.id, registry[item.pkg.manifest.id] ? 'update' : 'install', item.pkg, item.origin);
    },
    rollback(id) {
      const old = managed(id);
      if (!old.previousVersion) throw new Error('no previous version is available');
      const pkg = parsePackage(readBounded(path.join(historyDir, `${id}.tmplugin`), MAX_PACKAGE_BYTES));
      if (pkg.manifest.id !== id || pkg.manifest.version !== old.previousVersion || pkg.hash !== old.previousSha256) throw new Error('previous package identity mismatch');
      return transact(id, 'rollback', pkg, old.origin);
    },
    uninstall(id, options = {}) { managed(id); return transact(id, 'uninstall', null, null, { keepData: options.keepData !== false, keepPlacements: options.keepPlacements === true }); },
    dispose() { previews.clear(); }
  };
}
module.exports = { createManagedPlugins, atomicJson, MAX_REGISTRY_BYTES, MAX_JOURNAL_BYTES };
