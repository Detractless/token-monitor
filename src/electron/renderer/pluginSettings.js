'use strict';

// Settings → Plugins. Lists discovered plugins, asks for consent before the
// first enable (and again when an update widens access), places each view on
// the surfaces it supports, and shows a code plugin's process state. All
// writes go through the main-process plugin API; nothing here edits settings
// keys a plugin could abuse.
(function exposePluginSettings(root, factory) {
  const positionApi = typeof module === 'object' && module.exports ? require('./selectControl') : root?.TokenMonitorSelectControl;
  const api = factory(positionApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorPluginSettings = api;
})(typeof window !== 'undefined' ? window : null, function createPluginSettingsApi(positionApi) {
  const SURFACE_ORDER = ['home', 'page', 'tray', 'edgeDock', 'notch'];

  function el(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
    return node;
  }

  function permissionLabel(t, permission, hosts) {
    return t(`settings.plugins.permission.${permission}`, { hosts: hosts.join(', ') });
  }

  function createPluginSettingsPanel({ document, container, t, api, setDetailTooltip = null, onError = () => {}, onApplySkin = () => {}, onPlaced = () => {}, onSetEnabled = null, getEnabled = null }) {
    let list = null;
    let consentFor = '';
    let busy = false;
    let revealConsent = false;
    let packagePreview = null;
    let operation = null;
    let catalogData = null, activeTab = 'installed', query = '', sourcesOpen = false;
    let selectedPluginId = '', diagnostics = false, installedPosition = null;
    let catalogReview = null, menuId = 0, aboutOpen = false;
    const sourceDraft = { url: '', publicKey: '' };
    const chosenVersions = new Map();
    const detailState = new Map();
    let tabs = null, content = null, renderedTab = 'installed';
    const tabControls = new Map();

    // Keep navigation alive. Async actions must not insert a loading row or
    // discard the focused control before the response arrives.
    function setBusy() {
      container.setAttribute('aria-busy', String(busy));
      for (const control of container.querySelectorAll('button, input, select, textarea')) {
        control.setAttribute('aria-disabled', String(busy || control.disabled));
        if (busy && control !== document.activeElement && !tabs?.contains(control)) control.disabled = true;
      }
    }

    function rememberPosition() {
      const focus = document.activeElement;
      const scroll = [];
      for (let node = container.parentElement; node; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight) scroll.push([node, node.scrollTop]);
      }
      return { focus, key: focus?.dataset?.pluginFocus, scroll };
    }

    function restorePosition(saved) {
      // Don't steal focus if the user moved elsewhere during the request.
      if (document.activeElement === saved.focus || document.activeElement === document.body) {
        const target = saved.focus?.isConnected ? saved.focus : [...container.querySelectorAll('[data-plugin-focus]')].find(node => node.dataset.pluginFocus === saved.key);
        if (target && !target.disabled) target.focus({ preventScroll: true });
      }
      for (const [node, top] of saved.scroll) node.scrollTop = top;
    }

    function identifyContent() {
      const counts = new Map();
      for (const node of content.querySelectorAll('button, input, select, textarea, summary')) {
        const owner = node.closest('[data-plugin-id], [data-catalog-id]');
        const scope = owner?.dataset.pluginId || owner?.dataset.catalogId || activeTab;
        const identity = node.dataset.controlKey ? JSON.stringify([scope, node.dataset.controlKey]) : JSON.stringify([scope, node.tagName, node.type, node.dataset.styleKey, node.dataset.styleColor, node.getAttribute('aria-label'), node.dataset.controlKey || node.title, node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' ? node.className : node.textContent]);
        const count = counts.get(identity) || 0;
        counts.set(identity, count + 1); node.dataset.pluginFocus = `${identity}/${count}`;
      }
    }

    // Guard the still-focused action and persistent tabs while a write is in
    // flight. Other controls are disabled; Tab navigation remains available.
    container.addEventListener('click', event => {
      if (busy) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);

    async function run(action) {
      if (busy) return;
      busy = true;
      setBusy();
      try {
        const next = await action();
        if (next) { list = next; if (catalogData) catalogData = await api.catalog(); }
      } catch (error) {
        onError(error);
      } finally {
        busy = false;
        if (revealConsent && consentFor) { selectedPluginId = consentFor; diagnostics = false; }
        render();
        if (revealConsent) {
          container.querySelector(`[data-plugin-id="${consentFor}"] .plugin-consent`)?.scrollIntoView({ block: 'nearest' });
          revealConsent = false;
        }
      }
    }

    function button(label, action, className = '') {
      const node = el(document, 'button', className, label);
      node.type = 'button'; node.disabled = busy; node.addEventListener('click', action); return node;
    }

    function identity(name, author, origin, iconName, image, originKind) {
      const group = el(document, 'div', 'plugin-identity');
      const art = el(document, 'span', 'plugin-identity-art'); art.setAttribute('aria-hidden', 'true');
      if (typeof image === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= 90000) {
        const img = el(document, 'img'); img.alt = ''; img.src = image;
        img.addEventListener('error', () => { img.remove(); art.append(window.TokenMonitorPluginViews.renderTree(document, { type: 'icon', name: iconName || 'dot', size: 20 })); }, { once: true });
        art.append(img);
      } else art.append(window.TokenMonitorPluginViews.renderTree(document, { type: 'icon', name: iconName || 'dot', size: 20 }));
      const title = el(document, 'div', 'plugin-card-title');
      const source = el(document, 'span', 'plugin-source');
      if (author) source.append(el(document, 'span', 'plugin-author', author));
      if (origin) {
        const label = el(document, 'span', 'plugin-origin-label', origin);
        // Trust decoration is host-owned, never inferred from the author's text.
        if (originKind === 'official' || originKind === 'builtin') {
          label.classList.add('plugin-origin-official');
          source.classList.add('plugin-source-official');
          const shield = el(document, 'span', 'plugin-shield'); shield.setAttribute('aria-hidden', 'true');
          source.prepend(shield);
        }
        source.append(label);
      }
      title.append(el(document, 'span', 'plugin-name', name), source);
      group.append(art, title); return group;
    }

    function actionMenu(label, entries, leadingControl = null) {
      const wrap = el(document, 'div', 'plugin-menu-wrap');
      const popover = el(document, 'div', 'plugin-menu'); popover.id = `plugin-menu-${++menuId}`; popover.setAttribute('popover', 'auto');
      const trigger = button('', () => {}, 'plugin-more'); trigger.setAttribute('aria-label', label);
      const icon = el(document, 'span', 'plugin-more-icon'); icon.setAttribute('aria-hidden', 'true'); trigger.append(icon);
      trigger.setAttribute('popovertarget', popover.id); trigger.setAttribute('aria-controls', popover.id); trigger.setAttribute('aria-expanded', 'false');
      let keyboardOpen = false, focusLast = false;
      const menuItems = () => [...popover.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
      trigger.addEventListener('click', event => { keyboardOpen = event.detail === 0; focusLast = false; });
      trigger.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault(); keyboardOpen = true; focusLast = event.key === 'ArrowUp';
        if (popover.matches(':popover-open')) (focusLast ? menuItems().at(-1) : menuItems()[0])?.focus({ preventScroll: true });
        else popover.showPopover();
      });
      popover.addEventListener('toggle', () => {
        trigger.setAttribute('aria-expanded', String(popover.matches(':popover-open')));
        if (popover.matches(':popover-open')) {
          const rect = trigger.getBoundingClientRect();
          const position = positionApi.popupPosition(rect, { width: window.innerWidth, height: window.innerHeight }, {
            width: popover.offsetWidth, height: popover.scrollHeight + 2, align: 'end', heightLimit: window.innerHeight
          });
          Object.assign(popover.style, { left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px`, maxHeight: `${position.maxHeight}px` });
          if (keyboardOpen) (focusLast ? menuItems().at(-1) : menuItems()[0])?.focus({ preventScroll: true });
        }
      });
      popover.addEventListener('keydown', (event) => {
        const direction = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' }[event.key];
        if (direction === undefined) return;
        event.preventDefault();
        const items = menuItems();
        const next = positionApi.navigate(items, items.indexOf(document.activeElement), direction);
        items[next]?.focus();
      });
      if (leadingControl) popover.append(leadingControl);
      for (const [text, action] of entries) popover.append(button(text, () => { popover.hidePopover(); trigger.focus({ preventScroll: true }); action(); }));
      wrap.append(trigger, popover); return wrap;
    }

    // Runtime enabled also includes safe mode. The switch edits the saved
    // preference, independently of whether activation is currently allowed.
    function masterPreference() { return getEnabled ? getEnabled() : list.enabled; }

    function globalSwitch() {
      const row = el(document, 'label', 'checkbox-label plugin-global-switch');
      row.append(el(document, 'span', '', t('settings.plugins.enableAll')));
      const toggle = el(document, 'input'); toggle.type = 'checkbox'; toggle.setAttribute('role', 'switch');
      toggle.dataset.controlKey = 'plugins-enabled'; toggle.checked = masterPreference();
      toggle.disabled = busy || !onSetEnabled;
      toggle.addEventListener('change', () => {
        if (busy) { toggle.checked = masterPreference(); return; }
        const enabled = toggle.checked;
        const menu = toggle.closest('.plugin-menu');
        menu.hidePopover(); menu.parentElement.querySelector('.plugin-more').focus({ preventScroll: true });
        void run(async () => {
          try { return await onSetEnabled(enabled); }
          catch (error) { list = await api.list(); throw error; }
        });
      });
      row.append(toggle); return row;
    }

    async function previewCatalog(entry, version) {
      if (packagePreview) { const token = packagePreview.token; packagePreview = null; await api.cancelInstall(token); }
      packagePreview = await api.catalogPreview(entry.origin.id, entry.id, version);
    }

    function catalogReviewPanel() {
      const entry = catalogReview;
      const wrap = el(document, 'section', 'plugin-detail plugin-catalog-review');
      wrap.append(button(t('plugins.ui.backCatalog'), () => {
        if (packagePreview) void api.cancelInstall(packagePreview.token);
        packagePreview = null; catalogReview = null; render(); tabControls.get(activeTab)?.focus({ preventScroll: true });
      }, 'plugin-back'));
      const key = `${entry.origin.id}/${entry.id}`;
      const version = chosenVersions.get(key) || entry.version;
      if (entry.versions?.length) {
        const row = el(document, 'label', 'plugin-version-picker', t('plugins.catalog.version'));
        const select = el(document, 'select'); select.dataset.controlKey = 'review-version';
        for (const v of entry.versions) {
          const option = el(document, 'option', '', `${v.version}${v.compatible ? '' : ` · ${t('plugins.catalog.incompatible')}`}`);
          option.value = v.version; option.disabled = !v.installable; option.selected = v.version === version; select.append(option);
        }
        select.addEventListener('change', () => {
          chosenVersions.set(key, select.value);
          void run(async () => {
            // A focused native select can change again while the request is
            // pending. Drain to its latest choice before enabling installation.
            let requested;
            do {
              requested = chosenVersions.get(key);
              await previewCatalog(entry, requested);
            } while (requested !== chosenVersions.get(key));
            return null;
          });
        });
        row.append(select); wrap.append(row);
        const selected = entry.versions.find(v => v.version === version);
        if (selected?.changelog) wrap.append(el(document, 'p', 'plugin-description', selected.changelog));
      }
      if (packagePreview) wrap.append(packagePanel());
      else wrap.append(button(t('plugins.ui.previewPackage'), () => void run(async () => { await previewCatalog(entry, version); return null; })));
      return wrap;
    }

    function packagePanel() {
      const p = packagePreview;
      const panel = el(document, 'section', 'plugin-consent plugin-package-preview');
      panel.setAttribute('aria-label', t('plugins.package.review'));
      panel.append(identity(p.name, p.author || p.id, t(`plugins.origin.${p.origin.kind}`), p.icon, p.identityIcon, p.origin.kind));
      panel.append(el(document, 'span', 'plugin-version', `${p.installedVersion ? `${p.installedVersion} → ` : ''}${p.version}`));
      panel.append(el(document, 'p', 'plugin-description', p.description));
      if (p.origin.kind !== 'local') panel.append(el(document, 'p', 'plugin-description', p.origin.label));
      if (p.origin.url) panel.append(el(document, 'code', 'plugin-log', p.origin.url));
      if (p.origin.packageUrl) panel.append(el(document, 'code', 'plugin-log', p.origin.packageUrl));
      const permissions = el(document, 'ul', 'plugin-permission-list');
      for (const permission of p.permissions) permissions.append(el(document, 'li', '', permissionLabel(t, permission, p.hosts)));
      if (!p.permissions.length) permissions.append(el(document, 'li', '', t('settings.plugins.permission.none')));
      panel.append(permissions);
      if (p.risk.exfiltrationWarning) panel.append(el(document, 'p', 'plugin-risk', t('settings.plugins.riskEgress', { hosts: p.hosts.join(', ') })));
      panel.append(el(document, 'p', 'settings-note', t(p.operation === 'install' ? 'plugins.package.enableLater' : 'plugins.package.grants')));
      const details = el(document, 'details', 'plugin-logs'); details.append(el(document, 'summary', '', t('plugins.package.integrity')));
      details.append(el(document, 'code', 'plugin-log', p.sha256)); panel.append(details);
      const actions = el(document, 'div', 'settings-actions plugin-consent-actions');
      actions.append(button(t('settings.plugins.cancel'), () => { void api.cancelInstall(p.token); packagePreview = null; catalogReview = null; render(); }),
        button(t(`plugins.package.${p.operation}`), () => void run(async () => {
          const next = await api.install(p.token); packagePreview = null; catalogReview = null;
          activeTab = 'installed';
          if (p.operation === 'install' || next.plugins.find(plugin => plugin.id === p.id)?.status === 'needsApproval') { consentFor = p.id; revealConsent = true; }
          return next;
        }), 'plugin-allow'));
      panel.append(actions); return panel;
    }

    function operationPanel(plugin) {
      const panel = el(document, 'div', 'plugin-consent');
      const isRemove = operation.kind === 'uninstall';
      panel.append(el(document, 'strong', 'plugin-consent-title', t(isRemove ? 'plugins.package.removeTitle' : 'plugins.package.rollbackTitle', { name: plugin.name, version: plugin.installation.previousVersion })));
      if (isRemove) {
        for (const [key, label] of [['keepData', 'plugins.package.keepData'], ['keepPlacements', 'plugins.package.keepPlacements']]) {
          const row = el(document, 'label', 'checkbox-label');
          const input = el(document, 'input'); input.type = 'checkbox'; input.checked = operation[key];
          input.addEventListener('change', () => { operation[key] = input.checked; });
          row.append(input, el(document, 'span', '', t(label))); panel.append(row);
        }
        panel.append(el(document, 'p', 'settings-note', t('plugins.package.themeKept')));
      } else panel.append(el(document, 'p', 'settings-note', t('plugins.package.rollbackNote')));
      const actions = el(document, 'div', 'settings-actions plugin-consent-actions');
      actions.append(button(t('settings.plugins.cancel'), () => { operation = null; render(); }),
        button(t(isRemove ? 'plugins.package.uninstall' : 'plugins.package.rollback'), () => void run(async () => {
          const next = isRemove ? await api.uninstall(plugin.id, operation) : await api.rollback(plugin.id);
          operation = null; return next;
        })));
      panel.append(actions); return panel;
    }

    function catalogPanel() {
      const wrap = el(document, 'div', 'plugin-catalog');
      if (!catalogData) { wrap.append(el(document, 'p', 'settings-note', t('plugins.view.loading'))); return wrap; }
      if (catalogData.error) wrap.append(el(document, 'p', 'plugin-risk', catalogData.error));
      const search = el(document, 'input', 'plugin-catalog-search');
      search.type = 'search'; search.value = query;
      search.placeholder = t('plugins.catalog.search'); search.setAttribute('aria-label', t('plugins.catalog.search'));
      const results = el(document, 'div', 'plugin-catalog-results');
      function renderResults() {
        const entries = catalogData.entries.filter(p => p.origin.kind === activeTab && `${p.name} ${p.description} ${p.author} ${p.id}`.toLowerCase().includes(query.toLowerCase()));
        const cards = entries.map(entry => {
          const card = el(document, 'article', 'plugin-card'); card.dataset.catalogId = entry.id;
          const head = el(document, 'div', 'plugin-card-head');
          head.append(identity(entry.name, entry.author || entry.id, t(`plugins.origin.${entry.origin.kind}`), entry.icon, entry.identityIcon, entry.origin.kind));
          card.append(head, el(document, 'p', 'plugin-description', entry.description));
          const meta = el(document, 'div', 'plugin-card-meta');
          meta.append(el(document, 'span', 'plugin-version', `v${entry.version}`));
          if (entry.origin.kind === 'community') meta.append(el(document, 'span', 'plugin-origin-note', entry.origin.label));
          card.append(meta);
          const key = `${entry.origin.id}/${entry.id}`;
          const version = entry.versions?.find(v => v.version === chosenVersions.get(key)) || entry.versions?.find(v => v.version === entry.version);
          const actions = el(document, 'div', 'settings-actions');
          const available = version ? version.installable : ['available', 'update'].includes(entry.status);
          if (available) actions.append(button(t(entry.installedVersion ? 'plugins.package.update' : 'plugins.package.install'), () => void run(async () => {
            catalogReview = entry; await previewCatalog(entry, version?.version || entry.version); return null;
          })));
          if (entry.installedVersion) actions.append(button(t(entry.status === 'builtin' ? 'plugins.catalog.builtin' : 'plugins.catalog.installed'), () => { activeTab = 'installed'; selectedPluginId = ''; diagnostics = false; render(); container.querySelector(`[data-plugin-id="${entry.id}"]`)?.scrollIntoView({ block: 'nearest' }); }, 'plugin-installed-link plugin-installed-check'));
          if (!entry.installedVersion && !available) actions.append(el(document, 'span', 'settings-note', t('plugins.catalog.incompatible')));
          head.append(actions); return card;
        });
        if (!cards.length) cards.push(el(document, 'p', 'settings-note', t(activeTab === 'community' && !catalogData.communityConfigured ? 'plugins.catalog.noCommunity' : 'plugins.catalog.noResults')));
        results.replaceChildren(...cards);
        if (content?.contains(results)) identifyContent();
      }
      search.addEventListener('input', () => { query = search.value; renderResults(); });
      wrap.append(search, results); renderResults();
      if (activeTab === 'official') wrap.prepend(el(document, 'p', 'settings-note', t('plugins.catalog.offlineOfficial')));
      if (activeTab === 'community') wrap.prepend(button(t('plugins.catalog.sources'), () => { sourcesOpen = true; render(); content.querySelector('.plugin-back')?.focus({ preventScroll: true }); }, 'plugin-manage plugin-source-route'));
      return wrap;
    }

    function sourcesPanel() {
      const details = el(document, 'section', 'plugin-detail plugin-sources');
      details.append(button(t('plugins.ui.backCatalog'), () => { sourcesOpen = false; render(); content.querySelector('.plugin-source-route')?.focus({ preventScroll: true }); }, 'plugin-back'));
        details.append(el(document, 'p', 'settings-note', t('plugins.catalog.sourceNote')));
        for (const source of catalogData.sources.filter(s => s.kind === 'community')) {
          const row = el(document, 'section', 'plugin-source-row'); row.append(el(document, 'strong', 'plugin-consent-title', source.label), el(document, 'code', 'plugin-log', source.url));
          row.append(el(document, 'p', 'settings-note', source.lastFetched ? t('plugins.catalog.cached', { time: new Date(source.lastFetched).toLocaleString() }) : t('plugins.catalog.notFetched')));
          if (source.signed) row.append(el(document, 'p', 'settings-note', t('plugins.catalog.signed')));
          if (source.fingerprint) row.append(el(document, 'code', 'plugin-log', source.fingerprint));
          if (source.error) row.append(el(document, 'p', 'plugin-risk', source.error));
          const actions = el(document, 'div', 'settings-actions');
          actions.append(button(t('plugins.catalog.refresh'), () => void run(async () => { catalogData = await api.refreshSource(source.id); return null; })),
            button(t('plugins.catalog.removeSource'), () => void run(async () => { catalogData = await api.removeSource(source.id); return null; })));
          row.append(actions); details.append(row);
        }
        const form = el(document, 'form', 'plugin-source-form');
        const urlLabel = el(document, 'label', '', t('plugins.catalog.url'));
        const url = el(document, 'input'); url.type = 'url'; url.required = true; url.placeholder = 'https://'; url.value = sourceDraft.url;
        url.addEventListener('input', () => { sourceDraft.url = url.value; }); urlLabel.append(url);
        const advanced = el(document, 'div', 'plugin-source-optional');
        const keyLabel = el(document, 'label', '', t('plugins.catalog.optionalKey'));
        const key = el(document, 'textarea'); key.rows = 3; key.value = sourceDraft.publicKey;
        key.addEventListener('input', () => { sourceDraft.publicKey = key.value; }); keyLabel.append(key); advanced.append(keyLabel);
        const actions = el(document, 'div', 'settings-actions'); const submit = button(t('plugins.catalog.addSource'), () => {}); submit.type = 'submit'; actions.append(submit);
        form.append(urlLabel, advanced, actions);
        form.addEventListener('submit', event => { event.preventDefault(); void run(async () => {
          catalogData = await api.addSource({ ...sourceDraft }); sourceDraft.url = ''; sourceDraft.publicKey = ''; return null;
        }); });
        details.append(form);
      return details;
    }

    function statusChip(plugin) {
      const status = plugin.status;
      const chip = el(document, 'span', `plugin-status plugin-status-${status}`, t(`settings.plugins.status.${status}`));
      if (status === 'active' && plugin.runtime?.state === 'running') chip.classList.add('is-live');
      return chip;
    }

    function consentPanel(plugin) {
      const panel = el(document, 'div', 'plugin-consent');
      panel.append(el(document, 'div', 'plugin-consent-title', t('settings.plugins.consentTitle', { name: plugin.name })));
      const items = el(document, 'ul', 'plugin-permission-list');
      const permissions = plugin.permissions.length ? plugin.permissions : [];
      for (const permission of permissions) {
        const item = el(document, 'li', `plugin-permission plugin-permission-${permission.replace('.', '-')}`);
        item.textContent = permissionLabel(t, permission, plugin.hosts);
        if (plugin.missing?.permissions?.includes(permission) && plugin.enabled) item.classList.add('is-new');
        items.append(item);
      }
      if (!permissions.length) items.append(el(document, 'li', 'plugin-permission', t('settings.plugins.permission.none')));
      panel.append(items);
      if (plugin.risk?.exfiltrationWarning) {
        panel.append(el(document, 'p', 'plugin-risk', t('settings.plugins.riskEgress', { hosts: plugin.hosts.join(', ') })));
      }
      if (plugin.hasCode) panel.append(el(document, 'p', 'settings-note plugin-sandbox-note', t('settings.plugins.sandboxNote')));
      const actions = el(document, 'div', 'settings-actions plugin-consent-actions');
      const cancel = el(document, 'button', '', t('settings.plugins.cancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => { consentFor = ''; render(); });
      const allow = el(document, 'button', 'plugin-allow', t('settings.plugins.allow'));
      allow.type = 'button';
      allow.addEventListener('click', () => {
        consentFor = '';
        void run(() => api.setEnabled(plugin.id, true));
      });
      actions.append(cancel, allow);
      panel.append(actions);
      return panel;
    }

    function viewRows(plugin) {
      const wrap = el(document, 'div', 'plugin-views');
      wrap.append(el(document, 'div', 'plugin-subhead', t('settings.plugins.views')));
      for (const view of plugin.views.filter(view => view.surfaces.some(surface => SURFACE_ORDER.includes(surface)))) {
        const row = el(document, 'div', 'plugin-view-row');
        row.append(el(document, 'span', 'plugin-view-title', view.title));
        const chips = el(document, 'div', 'plugin-surface-chips');
        for (const surface of SURFACE_ORDER.filter((name) => view.surfaces.includes(name))) {
          const placed = view.placements?.[surface] === true;
          const chip = el(document, 'button', `plugin-surface-chip${placed ? ' is-on' : ''}`, t(`settings.plugins.surface.${surface}`));
          chip.type = 'button';
          chip.dataset.controlKey = `place/${view.ref}/${surface}`;
          chip.setAttribute('aria-pressed', String(placed));
          chip.title = t(placed ? 'settings.plugins.unplace' : 'settings.plugins.place', { view: view.title, surface: t(`settings.plugins.surface.${surface}`) });
          chip.addEventListener('click', () => void run(async () => {
            const next = await api.place(view.ref, surface, !placed);
            onPlaced(surface, view.ref, !placed);
            return next;
          }));
          chips.append(chip);
        }
        row.append(chips);
        wrap.append(row);
      }
      return wrap;
    }

    function runtimeRow(plugin) {
      const runtime = plugin.runtime;
      const row = el(document, 'div', 'plugin-runtime');
      const parts = [t(`settings.plugins.runtimeState.${runtime.state}`)];
      if (runtime.mode) parts.push(t(`settings.plugins.mode.${runtime.mode}`));
      if (runtime.cpuPercent !== null && runtime.state === 'running') parts.push(`CPU ${runtime.cpuPercent}%`);
      if (runtime.memoryMB !== null && runtime.state === 'running') parts.push(`${Math.round(runtime.memoryMB)} MB`);
      row.append(el(document, 'span', 'plugin-runtime-text', parts.join(' · ')));
      if (runtime.lastError) row.append(el(document, 'span', 'plugin-runtime-error', runtime.lastError));
      const restartWrap = el(document, 'div', 'settings-actions');
      const restart = el(document, 'button', 'plugin-restart', t('settings.plugins.restart'));
      restart.type = 'button';
      restart.addEventListener('click', () => void run(() => api.restart(plugin.id)));
      restartWrap.append(restart);
      row.append(restartWrap);
      return row;
    }

    function openPlugin(id, placements = false) {
      if (!selectedPluginId) installedPosition = rememberPosition();
      selectedPluginId = id; diagnostics = false; render();
      const target = (placements && content.querySelector('.plugin-views')) || content.querySelector('.plugin-back');
      if (placements && target?.classList.contains('plugin-views')) target.tabIndex = -1;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    }

    function closePlugin() {
      const saved = installedPosition;
      selectedPluginId = ''; diagnostics = false; installedPosition = null;
      render();
      const target = saved && [...content.querySelectorAll('[data-plugin-focus]')].find(node => node.dataset.pluginFocus === saved.key);
      (target || tabControls.get('installed'))?.focus({ preventScroll: true });
      if (saved) for (const [node, top] of saved.scroll) node.scrollTop = top;
    }

    function pluginIdentity(plugin) {
      const head = el(document, 'div', 'plugin-card-head');
      head.append(identity(plugin.name, plugin.author, t(plugin.installation ? `plugins.origin.${plugin.installation.origin.kind}` : `settings.plugins.source.${plugin.source}`), plugin.views?.[0]?.icon, plugin.identityIcon, plugin.installation?.origin.kind || plugin.source));
      if (plugin.status !== 'invalid') {
        const toggle = el(document, 'input', 'plugin-enable');
        toggle.type = 'checkbox'; toggle.checked = plugin.enabled; toggle.disabled = !list?.enabled;
        toggle.setAttribute('aria-label', t('settings.plugins.enable', { name: plugin.name }));
        toggle.addEventListener('change', () => {
          if (toggle.checked) { consentFor = plugin.id; openPlugin(plugin.id); }
          else void run(() => api.setEnabled(plugin.id, false));
        });
        const label = el(document, 'label', 'checkbox-label plugin-toggle'); label.append(toggle); head.append(label);
      }
      return head;
    }

    function pluginProblems(plugin) {
      const wrap = el(document, 'div', 'plugin-errors');
      for (const error of plugin.errors || []) wrap.append(el(document, 'code', 'plugin-error', error));
      return wrap;
    }

    function pluginCard(plugin) {
      const card = el(document, 'section', `plugin-card plugin-installed-card plugin-card-${plugin.status}`);
      card.dataset.pluginId = plugin.id;
      card.append(pluginIdentity(plugin));
      if (plugin.description) card.append(el(document, 'p', 'plugin-description', plugin.description));
      const footer = el(document, 'div', 'plugin-card-footer');
      const surfaces = SURFACE_ORDER.filter(surface => plugin.views?.some(view => view.placements?.[surface]));
      const exceptional = !['active', 'disabled'].includes(plugin.status);
      if (exceptional) footer.append(statusChip(plugin));
      else {
        const summary = el(document, 'span', 'plugin-placement-summary');
        if (plugin.version) summary.append(el(document, 'span', 'plugin-version', `v${plugin.version} · `));
        const count = button(t('plugins.ui.locationCount', { count: surfaces.length }), () => openPlugin(plugin.id, true), 'plugin-location-count');
        count.dataset.controlKey = 'placements';
        const details = surfaces.length
          ? [{ full: t('plugins.ui.selectedLocations'), heading: true }, ...surfaces.map(surface => ({ full: t(`settings.plugins.surface.${surface}`) }))]
          : [{ full: t('plugins.ui.noPlacements') }];
        if (setDetailTooltip) {
          setDetailTooltip(count, details, { centered: true });
          const tooltip = count.querySelector('[role="tooltip"]');
          if (tooltip) { tooltip.id = `plugin-placements-${++menuId}`; count.setAttribute('aria-describedby', tooltip.id); }
        } else {
          count.title = details.map(entry => entry.full).join(', ');
          count.setAttribute('aria-description', count.title);
        }
        count.setAttribute('aria-label', `${t('settings.plugins.views')}: ${t('plugins.ui.locationCount', { count: surfaces.length })}`);
        summary.append(count); footer.append(summary);
      }
      const manage = button(t(plugin.status === 'needsApproval' ? 'settings.plugins.reapprove' : 'plugins.ui.manage'), () => {
        if (plugin.status === 'needsApproval') consentFor = plugin.id;
        openPlugin(plugin.id);
      }, 'plugin-manage');
      manage.setAttribute('aria-label', t('plugins.ui.manageNamed', { name: plugin.name }));
      if (plugin.status === 'crashed') footer.append(button(t('settings.plugins.restart'), () => void run(() => api.restart(plugin.id)), 'plugin-restart plugin-inline-action'));
      footer.append(manage); card.append(footer);
      return card;
    }

    function detailSection(title, ...children) {
      const section = el(document, 'section', 'plugin-detail-section');
      section.append(el(document, 'h3', 'plugin-detail-heading', title), ...children);
      return section;
    }

    function pluginDetail(plugin) {
      const wrap = el(document, 'section', 'plugin-detail'); wrap.dataset.pluginId = plugin.id;
      const toolbar = el(document, 'div', 'plugin-detail-toolbar');
      const back = button(t('plugins.ui.back'), closePlugin, 'plugin-back');
      toolbar.append(back); wrap.append(toolbar, pluginIdentity(plugin));
      if (plugin.version) wrap.append(el(document, 'span', 'plugin-version', `v${plugin.version}`));
      if (!['active', 'disabled'].includes(plugin.status)) wrap.append(statusChip(plugin));
      if (plugin.description) wrap.append(el(document, 'p', 'plugin-description', plugin.description));
      if (plugin.author) wrap.append(el(document, 'p', 'settings-note', plugin.author));
      if (consentFor === plugin.id) wrap.append(consentPanel(plugin));
      else if (plugin.status === 'needsApproval') {
        const actions = el(document, 'div', 'settings-actions');
        actions.append(button(t('settings.plugins.reapprove'), () => { consentFor = plugin.id; diagnostics = false; render(); })); wrap.append(actions);
      }
      if (plugin.errors?.length) wrap.append(pluginProblems(plugin));
      if (diagnostics) {
        const actions = el(document, 'div', 'settings-actions');
        actions.append(button(t('plugins.ui.toSettings'), () => { diagnostics = false; render(); content.querySelector('.plugin-diagnostics')?.focus({ preventScroll: true }); }));
        wrap.append(actions);
        if (plugin.runtime) wrap.append(detailSection(t('plugins.ui.diagnostics'), runtimeRow(plugin)));
        if (plugin.logs?.length) {
          const lines = el(document, 'div', 'plugin-log-lines');
          for (const entry of plugin.logs.slice(-12)) lines.append(el(document, 'code', `plugin-log plugin-log-${entry.level}`, `${new Date(entry.at).toLocaleTimeString()} ${entry.text}`));
          wrap.append(detailSection(t('settings.plugins.logs', { count: plugin.logs.length }), lines));
        }
        return wrap;
      }
      // Disabled plugins keep their saved placements visible, without offering
      // mutations until enabled. The count is a selection, not runtime activity.
      if (plugin.status === 'disabled') {
        const selected = SURFACE_ORDER.filter(surface => plugin.views?.some(view => view.placements?.[surface]));
        const placements = el(document, 'div', 'plugin-views');
        placements.append(el(document, 'div', 'plugin-subhead', t('plugins.ui.selectedLocations')));
        for (const surface of selected) placements.append(el(document, 'span', 'settings-note', t(`settings.plugins.surface.${surface}`)));
        if (!selected.length) placements.append(el(document, 'span', 'settings-note', t('plugins.ui.noPlacements')));
        wrap.append(placements);
      }
      if (plugin.status === 'active') {
        if (plugin.views?.some(view => view.surfaces.some(surface => SURFACE_ORDER.includes(surface)))) wrap.append(viewRows(plugin));
        if (plugin.background?.supported) {
          const label = el(document, 'label', 'checkbox-label settings-item plugin-background');
          const text = el(document, 'span', 'settings-item-text'); text.append(el(document, 'span', 'settings-item-title', t('settings.plugins.background')));
          const input = el(document, 'input'); input.type = 'checkbox'; input.checked = plugin.background.enabled;
          input.addEventListener('change', () => void run(() => api.setBackground(plugin.id, input.checked)));
          label.append(text, input, el(document, 'span', 'settings-note settings-item-desc', t('settings.plugins.backgroundNote'))); wrap.append(label);
        }
        if (plugin.skins?.length) {
          const skins = el(document, 'div', 'plugin-skins');
          for (const skin of plugin.skins) {
            const chip = button('', () => onApplySkin(skin), 'theme-preset-chip plugin-skin-chip');
            const dot = el(document, 'span', 'theme-preset-dot'); dot.style.background = skin.colors.accent || skin.colors.chart || 'currentColor';
            chip.append(dot, el(document, 'span', '', skin.name)); chip.title = t('settings.plugins.applySkin', { name: skin.name }); skins.append(chip);
          }
          wrap.append(detailSection(t('settings.plugins.skins'), skins));
        }
        const pages = (plugin.views || []).filter(view => view.surfaces.includes('page'));
        if (pages.length) {
          const actions = el(document, 'div', 'settings-actions plugin-page-actions');
          for (const page of pages) {
            const open = button(t('plugins.page.open', { name: page.title }), () => void run(async () => { await api.openPage(page.ref); return null; }));
            open.disabled = busy || !page.placements?.page;
            if (!page.placements?.page) open.title = t('plugins.page.enableFirst');
            actions.append(open);
          }
          wrap.append(detailSection(t('plugins.ui.pages'), el(document, 'p', 'settings-note', t('plugins.ui.pagesNote')), actions));
        }
      }
      const utility = el(document, 'div', 'settings-actions plugin-detail-utilities');
      if (plugin.runtime || plugin.logs?.length) utility.append(button(t('plugins.ui.diagnostics'), () => { diagnostics = true; render(); content.querySelector('.plugin-back')?.focus({ preventScroll: true }); }, 'plugin-diagnostics'));
      if (plugin.installation) {
        if (plugin.installation.previousVersion) utility.append(button(t('plugins.package.rollback'), () => { operation = { id: plugin.id, kind: 'rollback' }; render(); }));
        utility.append(button(t('plugins.package.uninstall'), () => { operation = { id: plugin.id, kind: 'uninstall', keepData: true, keepPlacements: false }; render(); }));
      }
      if (utility.childElementCount) wrap.append(utility);
      if (operation?.id === plugin.id) wrap.append(operationPanel(plugin));
      return wrap;
    }

    function replaceContent(nodes) {
      const saved = rememberPosition();
      for (const detail of content.querySelectorAll('details')) {
        const key = detail.dataset.detailKey || `${renderedTab}/${detail.className}/${detail.querySelector('summary')?.textContent}`;
        detailState.set(key, detail.open);
      }
      // Keep the current scroll range while swapping, then release all space
      // beyond what the current ancestor scroll positions actually require.
      const previousHeight = content.getBoundingClientRect().height;
      content.style.minHeight = `${Math.ceil(previousHeight)}px`;
      content.replaceChildren(...nodes);
      const spareScroll = saved.scroll.length ? Math.min(...saved.scroll.map(([node, top]) => Math.max(0, node.scrollHeight - node.clientHeight - top))) : previousHeight;
      content.style.minHeight = `${Math.max(0, Math.ceil(previousHeight - spareScroll + (saved.scroll.length ? 1 : 0)))}px`;
      renderedTab = activeTab;
      for (const detail of content.querySelectorAll('details')) {
        const key = detail.dataset.detailKey || `${activeTab}/${detail.className}/${detail.querySelector('summary')?.textContent}`;
        if (detailState.has(key)) detail.open = detailState.get(key);
      }
      identifyContent();
      for (const [tab, control] of tabControls) {
        control.textContent = t(`plugins.catalog.${tab}`);
        control.setAttribute('aria-selected', String(activeTab === tab));
        control.tabIndex = activeTab === tab ? 0 : -1;
      }
      content.setAttribute('aria-labelledby', tabControls.get(activeTab).id);
      setBusy();
      restorePosition(saved);
    }

    function render() {
      if (!container) return;
      const nodes = [];
      if (!list) {
        container.replaceChildren(el(document, 'p', 'settings-note', t('plugins.view.loading')));
        return;
      }
      if (!tabs) {
        tabs = el(document, 'nav', 'plugin-catalog-tabs');
        tabs.setAttribute('aria-label', t('settings.plugins.title'));
        tabs.setAttribute('role', 'tablist');
        for (const tab of ['installed', 'official', 'community']) {
          const control = button(t(`plugins.catalog.${tab}`), () => {
            if (tab === activeTab) { if (tab === 'installed' && selectedPluginId) closePlugin(); return; }
            void run(async () => {
              // Only switch after the new page is ready; failed loads leave
              // the current page and its drafts intact.
              if (tab !== 'installed') catalogData = await api.catalog();
              activeTab = tab; query = ''; if (tab === 'installed') { selectedPluginId = ''; diagnostics = false; } return null;
            });
          });
          control.dataset.tab = tab;
          control.id = `${container.id || 'plugin-settings'}-tab-${tab}`;
          control.setAttribute('role', 'tab');
          control.setAttribute('aria-controls', `${container.id || 'plugin-settings'}-page`);
          control.addEventListener('keydown', event => {
            const order = [...tabControls.values()], index = order.indexOf(control);
            const target = event.key === 'Home' ? order[0] : event.key === 'End' ? order.at(-1)
              : event.key === 'ArrowRight' ? order[(index + 1) % order.length]
                : event.key === 'ArrowLeft' ? order[(index + order.length - 1) % order.length] : null;
            if (target) { event.preventDefault(); for (const item of order) item.tabIndex = item === target ? 0 : -1; target.focus({ preventScroll: true }); }
          });
          tabControls.set(tab, control); tabs.append(control);
        }
        content = el(document, 'div', 'plugin-settings-content');
        content.id = `${container.id || 'plugin-settings'}-page`;
        content.setAttribute('role', 'tabpanel');
        container.replaceChildren(tabs, content);
      }
      if (activeTab !== 'installed') {
        if (sourcesOpen && activeTab === 'community') nodes.push(sourcesPanel());
        else if (catalogReview && catalogReview.origin.kind === activeTab) nodes.push(catalogReviewPanel());
        else nodes.push(catalogPanel());
        replaceContent(nodes); return;
      }
      if (aboutOpen) {
        const about = el(document, 'section', 'plugin-about');
        about.append(button(t('plugins.ui.back'), () => {
          aboutOpen = false; render(); content.querySelector('.plugin-toolbar .plugin-more')?.focus({ preventScroll: true });
        }, 'plugin-back'), el(document, 'h3', '', t('plugins.ui.about')), el(document, 'p', 'settings-note', t('settings.plugins.intro')));
        nodes.push(about); replaceContent(nodes); return;
      }
      if (selectedPluginId) {
        const plugin = list.plugins.find(item => item.id === selectedPluginId);
        if (plugin) {
          if (packagePreview) nodes.push(packagePanel());
          nodes.push(pluginDetail(plugin)); replaceContent(nodes); return;
        }
        selectedPluginId = ''; diagnostics = false;
      }
      if (list.safeMode) nodes.push(el(document, 'p', 'plugin-banner', t('settings.plugins.safeMode')));
      const actions = el(document, 'div', 'plugin-toolbar');
      const importPackage = kind => void run(async () => { packagePreview = await api.importPackage(kind); return null; });
      const countText = t('plugins.ui.count', { count: list.plugins.length });
      const count = el(document, 'span', 'plugin-toolbar-count', countText);
      count.setAttribute('role', 'status'); count.setAttribute('aria-atomic', 'true');
      if (!list.enabled) {
        count.append(document.createTextNode(' · '), el(document, 'span', 'plugin-paused', t('plugins.ui.pausedShort')));
        count.setAttribute('aria-label', `${countText} · ${t('plugins.ui.paused')}`);
        count.title = `${countText} · ${t('plugins.ui.paused')}`;
      }
      actions.append(count,
        button(t('plugins.package.import'), () => importPackage('file'), 'plugin-inline-action'),
        actionMenu(t('plugins.ui.more'), [
          [t('plugins.package.importFolder'), () => importPackage('directory')],
          [t('settings.plugins.openFolder'), () => void run(async () => { await api.openFolder(); return null; })],
          [t('settings.plugins.reload'), () => void run(() => api.reload())],
          [t('plugins.ui.about'), () => { aboutOpen = true; render(); content.querySelector('.plugin-back')?.focus({ preventScroll: true }); }]
        ], globalSwitch()));
      nodes.push(actions);
      if (packagePreview) nodes.push(packagePanel());
      if (!list.plugins.length) nodes.push(el(document, 'p', 'settings-note', t('settings.plugins.empty')));
      for (const plugin of [...list.plugins].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
        nodes.push(pluginCard(plugin));
      }
      replaceContent(nodes);
    }

    return {
      async refresh() {
        try {
          list = await api.list();
        } catch (error) {
          onError(error);
        }
        render();
      },
      render,
      summary() {
        if (!list) return '';
        const active = list.plugins.filter((plugin) => plugin.status === 'active').length;
        return list.enabled ? t('settings.summary.plugins', { active, total: list.plugins.length }) : t('settings.summary.off');
      },
      list: () => list,
      // Consent and logs are interaction state: a background push must not
      // close an open consent panel the user is reading.
      isInteracting: () => activeTab === 'style' || Boolean(consentFor || packagePreview || operation || selectedPluginId || aboutOpen) || busy || Boolean(container.querySelector('.plugin-menu:popover-open, .plugin-location-count [role="tooltip"]:popover-open')) || container.contains(document.activeElement)
    };
  }

  return { SURFACE_ORDER, createPluginSettingsPanel };
});
