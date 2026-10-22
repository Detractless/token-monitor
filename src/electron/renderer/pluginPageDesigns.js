'use strict';
(function expose(root) {
  function create({ document, window, api, t, breakdown, update, isActive = () => true }) {
    const container = document.createElement('section'); container.className = 'plugin-page-designs'; container.hidden = true;
    const toolbar = document.createElement('label'); toolbar.className = 'settings-item';
    const label = document.createElement('span'); label.className = 'settings-item-text';
    const select = document.createElement('select'); toolbar.append(label, select);
    const panel = document.createElement('div'); panel.className = 'plugin-web-panel';
    const status = document.createElement('p'); status.className = 'settings-note'; status.setAttribute('role', 'status'); status.hidden = true;
    container.append(toolbar, status); breakdown.before(container);
    const selectControl = window.TokenMonitorSelectControl?.enhance(select);
    let lastCatalog = null, failedReason = '', lastTarget = null, readyRef = '', retryTimer = null, retries = 0;
    let selections = {}, latest = null, key = '', revision = 0, busy = false, failed = false, requestPending = false, queued = false;
    const active = () => latest?.visible && !document.hidden && isActive();
    const theme = () => {
      const css = getComputedStyle(document.documentElement);
      const rgb = (name, fallback) => /^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/.test(css.getPropertyValue(name)) ? `rgb(${css.getPropertyValue(name).trim()})` : fallback;
      return { colors: { background: rgb('--glass-rgb', '#17191c'), text: css.getPropertyValue('--text').trim() || '#eee', muted: css.getPropertyValue('--muted').trim() || '#999', accent: css.getPropertyValue('--accent').trim() || '#8aafff', border: getComputedStyle(document.querySelector('.shell') || document.body).borderTopColor }, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches || latest?.reducedMotion, dark: css.colorScheme !== 'light', font: getComputedStyle(document.body).fontFamily };
    };
    function layout(selected) {
      const ready = selected?.ref === readyRef;
      panel.style.position = ready ? '' : 'absolute';
      panel.style.width = ready ? '' : `${container.getBoundingClientRect().width}px`;
      panel.style.visibility = ready ? '' : 'hidden';
      breakdown.classList.toggle('plugin-web-replaced', Boolean(ready && selected?.slot === 'replace'));
    }
    async function sync() {
      if (!latest) return;
      clearTimeout(retryTimer); retryTimer = null;
      if (requestPending) { queued = true; return; }
      requestPending = true;
      const serial = revision, input = latest;
      const rect = panel.getBoundingClientRect();
      const footer = document.querySelector('.footer')?.getBoundingClientRect();
      const visible = active() && !failed && panel.isConnected && rect.y >= 0 && rect.y < (footer?.top || window.innerHeight) && !document.querySelector('[popover]:popover-open');
      if (!visible) { readyRef = ''; layout(null); }
      try {
        const result = await api.webSync({ visible: Boolean(visible), snapshot: input?.snapshot, rect: { x: rect.x, y: rect.y, width: rect.width, height: Math.min(rect.height, (footer?.top || window.innerHeight) - rect.y) }, theme: theme() });
        if (serial === revision) {
          const changed = JSON.stringify(selections) !== JSON.stringify(result.selections || {});
          selections = result.selections || {};
          if (result.error) { readyRef = ''; layout(null); failed = true; status.textContent = t('plugins.web.failed'); status.hidden = false; breakdown.classList.remove('plugin-web-replaced'); }
          else if (changed) update();
          else {
            const selected = (latest?.catalog?.plugins || []).filter(p => p.status === 'active').flatMap(p => p.webDocuments || []).find(d => d.ref === selections[input.snapshot.target]);
            const nextReady = visible && result.mounted ? selected?.ref || '' : '';
            const handoff = readyRef !== nextReady;
            readyRef = nextReady; layout(selected);
            if (handoff) { queued = true; retries = 0; }
            else if (visible && selected && !result.mounted && retries++ < 50) retryTimer = setTimeout(() => void sync(), 100);
            else retries = 0;
          }
        }
      } catch { if (serial === revision) { readyRef = ''; layout(null); failed = true; status.textContent = t('plugins.web.failed'); status.hidden = false; breakdown.classList.remove('plugin-web-replaced'); } }
      finally { requestPending = false; if (queued) { queued = false; void sync(); } }
    }
    select.addEventListener('change', async () => {
      busy = true; select.disabled = true;
      try { selections = await api.webSelect(latest.snapshot.target, select.value); failed = false; status.hidden = true; }
      catch { status.textContent = t('plugins.web.failed'); status.hidden = false; }
      finally { busy = false; select.disabled = false; update(); }
    });
    api.onWebReady?.(() => { retries = 0; void sync(); });
    api.onWebRestore(() => { selections = {}; failed = false; update(); (toolbar.querySelector('.select-control-trigger') || select).focus(); });
    api.onWebFailed(reason => { failedReason = reason; readyRef = ''; layout(null); failed = true; status.textContent = t('plugins.web.failed'); status.hidden = false; breakdown.classList.remove('plugin-web-replaced'); });
    window.addEventListener('pagehide', () => { clearTimeout(retryTimer); latest = null; void api.webSync({ visible: false }).catch(() => {}); }, { once: true });
    window.addEventListener('resize', () => void sync());
    document.addEventListener('scroll', () => void sync(), true);
    document.addEventListener('visibilitychange', () => void sync());
    document.addEventListener('toggle', () => void sync(), true);
    const observer = new MutationObserver(() => { if (latest) void sync(); });
    observer.observe(document.querySelector('.shell') || document.body, { attributes: true, attributeFilter: ['class'] });
    const settings = document.getElementById('settingsPanel'); if (settings) observer.observe(settings, { attributes: true, attributeFilter: ['class'] });
    return {
      render(input) {
        if (input.snapshot.target !== lastTarget || (input.catalog !== lastCatalog && ['unavailable', 'changed'].includes(failedReason))) { failed = false; status.hidden = true; }
        lastTarget = input.snapshot.target; lastCatalog = input.catalog;
        if (!input.visible) readyRef = '';
        latest = input; revision++;
        const docs = (input.catalog?.plugins || []).filter(p => p.status === 'active').flatMap(p => (p.webDocuments || []).filter(d => d.target === input.snapshot.target).map(d => ({ ...d, name: `${p.name} · ${d.title}` })));
        container.hidden = !input.visible || !docs.length;
        label.textContent = t('plugins.web.design');
        const nextKey = JSON.stringify(docs);
        if (nextKey !== key) { key = nextKey; select.replaceChildren(); for (const doc of [{ ref: '', name: t('plugins.web.original') }, ...docs]) { const option = document.createElement('option'); option.value = doc.ref; option.textContent = doc.name; select.append(option); } }
        const selected = docs.find(d => d.ref === selections[input.snapshot.target]);
        select.value = selected?.ref || ''; select.disabled = busy; selectControl?.sync();
        panel.remove(); breakdown.classList.remove('plugin-web-replaced');
        if (input.visible && selected && !failed) {
          panel.style.height = `${selected.height}px`;
          if (selected.slot === 'after') breakdown.after(panel); else container.after(panel);
          layout(selected);
        }
        void sync();
      }
    };
  }
  root.TokenMonitorPluginPageDesigns = { create };
})(window);
