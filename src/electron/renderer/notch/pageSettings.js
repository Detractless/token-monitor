'use strict';
(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorNotchPageSettings = api;
})(typeof window !== 'undefined' ? window : null, () => {
  const builtin = ['home', 'limits', 'sessions', 'breakdown'];
  // The same names the Notch tab row paints, so a chip reads like its tab.
  const BUILTIN_ICONS = { home: 'home', limits: 'limits', sessions: 'session', breakdown: 'model' };
  function entries(settings = {}, catalog, t) {
    const chosen = Array.isArray(settings.notchBuiltinPages) ? settings.notchBuiltinPages : builtin;
    return [
      ...builtin.map(id => ({ id, label: t(`notch.tab.${id}`), title: t(`notch.tab.${id}`),
        icon: { kind: 'builtin', name: BUILTIN_ICONS[id] }, checked: chosen.includes(id) })),
      ...(catalog?.plugins || []).flatMap(plugin => (plugin.views || []).filter(view => view.surfaces.includes('notch')).map(view => ({
        id: `plugin:${view.ref}`, ref: view.ref, label: view.title,
        title: plugin.name === view.title ? view.title : `${plugin.name} · ${view.title}`,
        icon: { kind: 'plugin', name: view.icon || 'dot' },
        checked: view.placements?.notch === true, unavailable: plugin.status !== 'active' || settings.pluginsEnabled === false
      })))
    ];
  }
  const contexts = new WeakMap();
  function render(options) {
    const { document, container, settings, catalog, t, save, place, onError, pluginIcon } = options;
    if (!container) return;
    contexts.set(container, options);
    if (container.dataset.saving === 'true') return;
    const focused = container.contains(document.activeElement) ? document.activeElement?.dataset.page : null;
    const chips = entries(settings, catalog, t).map(entry => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'notch-page-chip';
      chip.dataset.page = entry.id;
      chip.setAttribute('aria-pressed', String(entry.checked));
      if (entry.title !== entry.label) { chip.title = entry.title; chip.setAttribute('aria-label', entry.title); }
      chip.disabled = Boolean(entry.unavailable && !entry.checked);
      const icon = entry.icon?.kind === 'plugin' && typeof pluginIcon === 'function' ? pluginIcon(entry.icon.name)
        : entry.icon?.kind === 'builtin' ? document.createElement('span') : null;
      if (entry.icon?.kind === 'builtin') {
        icon.className = `view-switcher-icon view-icon-${entry.icon.name}`;
        icon.setAttribute('aria-hidden', 'true');
      }
      const label = document.createElement('span');
      label.textContent = entry.label;
      chip.append(...(icon ? [icon] : []), label);
      chip.addEventListener('click', async () => {
        const restoreFocus = document.activeElement === chip;
        const next = !entry.checked;
        chip.setAttribute('aria-pressed', String(next));
        container.dataset.saving = 'true';
        for (const control of container.querySelectorAll('button')) control.disabled = true;
        try {
          if (entry.ref) await place(entry.ref, next);
          else {
            const chosen = entries(settings, catalog, t).filter(e => !e.ref && (e.id === entry.id ? next : e.checked)).map(e => e.id);
            await save({ notchBuiltinPages: chosen });
          }
        } catch (error) { chip.setAttribute('aria-pressed', String(entry.checked)); onError(error); }
        finally {
          delete container.dataset.saving;
          const canRestore = restoreFocus && (document.activeElement === document.body || container.contains(document.activeElement));
          render(contexts.get(container));
          if (canRestore) [...container.querySelectorAll('button')].find(control => control.dataset.page === entry.id)?.focus({ preventScroll: true });
        }
      });
      chip.dataset.unavailable = String(Boolean(entry.unavailable));
      return chip;
    });
    container.replaceChildren(...chips);
    if (focused) [...container.querySelectorAll('button')].find(chip => chip.dataset.page === focused)?.focus({ preventScroll: true });
  }
  return { entries, render };
});
