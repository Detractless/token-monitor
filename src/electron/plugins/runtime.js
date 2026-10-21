'use strict';

// Wires the plugin platform into the widget: the Data Bus and its built-in
// sources, the sandbox, the manager, and the IPC each surface uses. main.js
// supplies settings access and the transports; nothing here reaches into
// collection, limits or credentials.

const fs = require('node:fs');
const path = require('node:path');
const { createDataBus } = require('../../shared/plugins/dataBus');
const { createCpuSampler, createMemorySampler } = require('./systemMetrics');
const { createAppSources } = require('./appSources');
const { createPluginSandbox, registerPluginScheme } = require('./sandbox');
const { createPluginPages } = require('./pages');
const { createManagedPlugins } = require('./managed');
const { createPluginAppearance } = require('./appearance');
const { createPluginCatalog } = require('./catalog');
const { createPluginManager } = require('./manager');
const { placementPatch, placementsFor } = require('./placementSettings');
const { createElectronNetFetch } = require('../limits/fetch');
const { createOutboundFetch, resolveProxyConfig } = require('../../shared/outboundFetch');

const NET_PARTITION = 'tm-plugin-net';
const CHANGED_THROTTLE_MS = 1000;
const MAIN_SURFACES = new Set(['home', 'tray', 'page']);
const { createSurfaceDemand } = require('./surfaceDemand');

function safeModeRequested(argv = process.argv, env = process.env) {
  return argv.includes('--plugins-safe-mode') || env.TOKEN_MONITOR_PLUGINS_SAFE_MODE === '1';
}

function createPluginRuntime({
  electron,
  userDataDir,
  getSettings,
  applySettingsPatch,
  persistPluginStates,
  persistManagementSettings,
  getLocale,
  getContext,
  isMainSender,
  isSurfaceSender = () => false,
  placementContext = () => ({}),
  tokenRateApi,
  presentation,
  log = (message) => console.log(message),
  env = process.env
}) {
  const { app, BrowserWindow, Notification, ipcMain, session, shell, dialog } = electron;
  const safeMode = safeModeRequested(process.argv, env);
  const bus = createDataBus({ onError: (error) => log(`[plugins] source failed: ${error.message}`) });
  bus.defineSource('sys.cpu', { sample: createCpuSampler(), minIntervalMs: 1000 });
  bus.defineSource('sys.memory', { sample: createMemorySampler(), minIntervalMs: 1000 });
  const appSources = createAppSources({ bus, tokenRateApi, presentation, getContext });
  const userDir = path.join(userDataDir, 'plugins');

  // Requests leave from a cookie-less in-memory session through the same
  // proxy policy as provider calls; the sandbox session itself has no network.
  const proxy = resolveProxyConfig(env);
  const netFetch = proxy.httpProxy || proxy.httpsProxy
    ? createOutboundFetch(env)
    : createElectronNetFetch({ fetch: (input, init) => session.fromPartition(NET_PARTITION, { cache: false }).fetch(input, init) });

  function notify({ title, body }) {
    try {
      if (Notification?.isSupported?.() === false) return;
      new Notification({ title, body, silent: false }).show();
    } catch (error) {
      log(`[plugins] notification failed: ${error.message}`);
    }
  }

  const appearance = createPluginAppearance({ file: path.join(userDataDir, 'plugin-appearance.json') });
  let manager = null;
  const sandbox = safeMode ? null : createPluginSandbox({
    electron: { BrowserWindow, session, app },
    onMessage: (pluginId, message) => manager?.handleMessage(pluginId, message),
    onExit: (pluginId, reason) => manager?.handleExit(pluginId, reason),
    log
  });
  manager = createPluginManager({
    builtinDir: path.join(__dirname, 'builtin'),
    userDir,
    dataDir: path.join(userDataDir, 'plugin-data'),
    bus,
    sandbox,
    notify,
    netFetch,
    getSettings,
    saveStates: persistPluginStates,
    getLocale,
    getAppearance: appearance.get,
    safeMode,
    log
  });

  const managed = createManagedPlugins({ root: path.join(userDataDir, 'plugin-manager'), userDir,
    dataDir: path.join(userDataDir, 'plugin-data'), manager, getSettings, saveSettings: persistManagementSettings, getLocale });
  managed.recover();
  const catalog = createPluginCatalog({ manager, managed, getLocale, root: path.join(userDataDir, 'plugin-catalogs'), fetchImpl: netFetch });
  const demand = createSurfaceDemand((surface, refs) => manager.setSurfaceDemand(surface, refs));
  const detachedPageOwner = Symbol('detached-pages');
  const pages = createPluginPages({ BrowserWindow, ipcMain, manager, getSettings, getLocale,
    onDemand: refs => demand.set(detachedPageOwner, 'page', refs) });

  // Each window that draws plugin views registers which refs it shows on
  // which surface; a surface's demand is the union across its windows.
  const subscribers = new Map();
  function setDemand(webContents, surface, refs) {
    let subscriber = subscribers.get(webContents.id);
    if (!subscriber) {
      subscriber = { webContents, demands: new Map() };
      subscribers.set(webContents.id, subscriber);
      webContents.once('destroyed', () => {
        subscribers.delete(webContents.id);
        demand.remove(webContents.id);
      });
    }
    const allowed = new Set(manager.list().plugins.filter(plugin => plugin.status === 'active')
      .flatMap(plugin => (plugin.views || []).filter(view => view.surfaces.includes(surface)
        && (surface !== 'page' || placementsFor(getSettings(), view.ref).page)).map(view => view.ref)));
    const selected = Array.isArray(refs) ? refs.filter(ref => typeof ref === 'string' && allowed.has(ref)).slice(0, 32) : [];
    subscriber.demands.set(surface, selected);
    demand.set(webContents.id, surface, selected);
  }
  manager.onViews((surface, payload) => {
    for (const subscriber of subscribers.values()) {
      if (!subscriber.demands.has(surface) || subscriber.webContents.isDestroyed()) continue;
      subscriber.webContents.send('plugins:views', payload);
    }
  });

  let changedTimer = null;
  const listListeners = new Set();
  manager.onChanged(() => {
    if (changedTimer) return;
    changedTimer = setTimeout(() => {
      changedTimer = null;
      for (const webContents of [...listListeners]) {
        if (webContents.isDestroyed()) listListeners.delete(webContents);
        else webContents.send('plugins:changed');
      }
    }, CHANGED_THROTTLE_MS);
    changedTimer.unref?.();
  });

  function listWithPlacements() {
    const list = manager.list();
    const settings = getSettings() || {};
    for (const plugin of list.plugins) {
      plugin.installation = managed.describe(plugin.id);
      for (const view of plugin.views || []) view.placements = placementsFor(settings, view.ref);
    }
    return list;
  }

  function mainSender(event) {
    return isMainSender(event) && (!event.senderFrame || event.senderFrame === event.sender.mainFrame);
  }

  function requireMain(event) {
    if (!mainSender(event)) throw new Error('plugins can only be managed from the main window');
    if (!listListeners.has(event.sender)) {
      listListeners.add(event.sender);
      event.sender.once('destroyed', () => listListeners.delete(event.sender));
    }
  }

  function registerIpc() {
    ipcMain.handle('plugins:list', (event) => {
      requireMain(event);
      return listWithPlacements();
    });
    ipcMain.handle('plugins:setEnabled', (event, { id, enabled } = {}) => {
      requireMain(event);
      manager.setEnabled(String(id), enabled === true);
      return listWithPlacements();
    });
    ipcMain.handle('plugins:setBackground', (event, { id, enabled } = {}) => {
      requireMain(event);
      manager.setBackground(String(id), enabled === true);
      return listWithPlacements();
    });
    ipcMain.handle('plugins:restart', (event, { id } = {}) => {
      requireMain(event);
      manager.restart(String(id));
      return listWithPlacements();
    });
    ipcMain.handle('plugins:reload', (event) => {
      requireMain(event);
      manager.reload();
      return listWithPlacements();
    });
    ipcMain.handle('plugins:addSource', (event, input) => { requireMain(event); return catalog.addSource(input); });
    ipcMain.handle('plugins:refreshSource', (event, id) => { requireMain(event); return catalog.refreshSource(id); });
    ipcMain.handle('plugins:removeSource', (event, id) => { requireMain(event); return catalog.removeSource(id); });
    ipcMain.handle('plugins:catalog', event => { requireMain(event); return catalog.list(); });
    ipcMain.handle('plugins:catalogPreview', (event, source, id, version) => { requireMain(event); return catalog.preview(source, id, version); });
    ipcMain.handle('plugins:import', async (event, kind) => {
      requireMain(event);
      const selection = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        properties: kind === 'directory' ? ['openDirectory'] : ['openFile'],
        ...(kind === 'directory' ? {} : { filters: [{ name: 'Token Monitor plugin', extensions: ['tmplugin'] }] })
      });
      if (selection.canceled || !selection.filePaths.length) return null;
      return kind === 'directory' ? managed.previewDirectory(selection.filePaths[0]) : managed.previewFile(selection.filePaths[0]);
    });
    ipcMain.handle('plugins:install', (event, token) => { requireMain(event); managed.install(token); return listWithPlacements(); });
    ipcMain.handle('plugins:cancelInstall', (event, token) => { requireMain(event); managed.cancel(token); });
    ipcMain.handle('plugins:rollback', (event, id) => { requireMain(event); managed.rollback(id); return listWithPlacements(); });
    ipcMain.handle('plugins:uninstall', (event, id, options) => { requireMain(event); managed.uninstall(id, options); return listWithPlacements(); });
    ipcMain.handle('plugins:openPage', (event, ref) => { requireMain(event); pages.open(ref); return { ok: true }; });
    ipcMain.handle('plugins:openFolder', async (event) => {
      requireMain(event);
      fs.mkdirSync(userDir, { recursive: true });
      const error = await shell.openPath(userDir);
      return { ok: !error, error };
    });
    ipcMain.handle('plugins:place', (event, { ref, surface, placed } = {}) => {
      requireMain(event);
      const view = manager.list().plugins.flatMap((plugin) => plugin.views || []).find((entry) => entry.ref === ref);
      if (!view?.surfaces.includes(surface)) throw new Error('unsupported plugin placement');
      const patch = placementPatch(getSettings() || {}, { ref: String(ref || ''), surface: String(surface || ''), placed: placed === true }, placementContext());
      applySettingsPatch(patch);
      return listWithPlacements();
    });
    ipcMain.handle('plugins:appearance', event => { requireMain(event); return appearance.state(); });
    ipcMain.handle('plugins:setAppearance', (event, value) => { requireMain(event); const next = appearance.set(value); manager.settingsChanged(); return next; });
    ipcMain.handle('plugins:skins', (event) => {
      requireMain(event);
      return manager.skins();
    });
    ipcMain.handle('plugins:interact', (event, { surface, ref, input, revision } = {}) => {
      const allowed = ['home', 'page'].includes(surface) ? mainSender(event) : ['edgeDock', 'notch'].includes(surface) && isSurfaceSender(event, surface);
      if (!allowed || !subscribers.get(event.sender.id)?.demands.get(surface)?.includes(ref)) throw new Error('interaction is not from an active plugin view');
      if (surface === 'page' && !placementsFor(getSettings(), ref).page) throw new Error('plugin page placement was removed');
      return manager.interact(surface, ref, input, revision);
    });
    ipcMain.handle('plugins:views', (event, { surface } = {}) => {
      if (!MAIN_SURFACES.has(surface) || !mainSender(event)) return { surface, views: {} };
      return manager.payload(surface);
    });
    ipcMain.on('plugins:demand', (event, { surface, refs } = {}) => {
      if (!MAIN_SURFACES.has(surface) || !mainSender(event)) return;
      setDemand(event.sender, surface, refs);
    });
    for (const [channel, surface] of [['edgeDock:pluginDemand', 'edgeDock'], ['topNotch:pluginDemand', 'notch']]) {
      ipcMain.on(channel, (event, { refs } = {}) => {
        if (isSurfaceSender(event, surface)) setDemand(event.sender, surface, refs);
      });
    }
  }

  return {
    manager,
    bus,
    safeMode,
    start() {
      registerIpc();
      manager.reload();
    },
    publishStats(stats) {
      appSources.publish(stats);
    },
    settingsChanged() {
      manager.settingsChanged();
      pages.refresh();
      for (const subscriber of subscribers.values()) {
        if (subscriber.demands.has('page')) setDemand(subscriber.webContents, 'page', subscriber.demands.get('page'));
      }
    },
    // Rendered tray items need view state synchronously with the bitmap.
    payload: (surface) => manager.payload(surface),
    // Hidden plugin host windows must not count as app windows.
    owns: (win) => Boolean(sandbox?.owns(win)),
    dispose() {
      if (changedTimer) clearTimeout(changedTimer);
      catalog.dispose();
      managed.dispose();
      pages.dispose();
      manager.dispose();
      bus.dispose();
    }
  };
}

module.exports = { createPluginRuntime, registerPluginScheme, safeModeRequested };
