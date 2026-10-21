'use strict';
(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorNotchPageSettings = api;
})(typeof window !== 'undefined' ? window : null, () => {
  const builtin = ['home', 'limits', 'sessions', 'breakdown'];
  function entries(settings = {}, catalog, t) {
    const chosen = Array.isArray(settings.notchBuiltinPages) ? settings.notchBuiltinPages : builtin;
    return [
      ...builtin.map(id => ({ id, title: t(`notch.tab.${id}`), checked: chosen.includes(id) })),
      ...(catalog?.plugins || []).flatMap(plugin => (plugin.views || []).filter(view => view.surfaces.includes('notch')).map(view => ({
        id: `plugin:${view.ref}`, ref: view.ref, title: `${plugin.name} · ${view.title}`,
        checked: view.placements?.notch === true, unavailable: plugin.status !== 'active' || settings.pluginsEnabled === false
      })))
    ];
  }
  const contexts = new WeakMap();
  function render(options) {
    const { document, container, settings, catalog, t, save, place, onError } = options;
    if (!container) return;
    contexts.set(container, options);
    if (container.dataset.saving === 'true') return;
    const focused = container.contains(document.activeElement) ? document.activeElement?.dataset.page : null;
    const rows = entries(settings, catalog, t).map(entry => {
      const row = document.createElement('label'); row.className = 'checkbox-label settings-item';
      const text = document.createElement('span'); text.className = 'settings-item-title'; text.textContent = entry.title;
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = entry.checked; input.dataset.page = entry.id;
      input.disabled = Boolean(entry.unavailable && !entry.checked);
      input.addEventListener('change', async () => {
        const restoreFocus = document.activeElement === input;
        container.dataset.saving = 'true';
        for (const control of container.querySelectorAll('input')) control.disabled = true;
        try {
          if (entry.ref) await place(entry.ref, input.checked);
          else {
            const chosen = entries(settings, catalog, t).filter(e => !e.ref && (e.id === entry.id ? input.checked : e.checked)).map(e => e.id);
            await save({ notchBuiltinPages: chosen });
          }
        } catch (error) { input.checked = entry.checked; onError(error); }
        finally {
          delete container.dataset.saving;
          const canRestore = restoreFocus && (document.activeElement === document.body || container.contains(document.activeElement));
          render(contexts.get(container));
          if (canRestore) [...container.querySelectorAll('input')].find(control => control.dataset.page === entry.id)?.focus({ preventScroll: true });
        }
      });
      input.dataset.unavailable = String(Boolean(entry.unavailable));
      row.append(text, input); return row;
    });
    container.replaceChildren(...rows);
    if (focused) [...container.querySelectorAll('input')].find(input => input.dataset.page === focused)?.focus({ preventScroll: true });
  }
  return { entries, render };
});
