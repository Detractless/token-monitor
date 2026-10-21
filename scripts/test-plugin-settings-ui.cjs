'use strict';
// Run: env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-plugin-settings-ui.cjs
// Isolated Chromium DOM + fixture API. Does not open the main app or use user data.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-plugin-settings-ui-'));
app.setPath('userData', path.join(scratch, 'user-data'));
app.on('window-all-closed', () => {});
let win;
async function main() {
  app.dock?.hide();
  fs.writeFileSync(path.join(scratch, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="file://${root}/src/electron/renderer/styles.css"><link rel="stylesheet" href="file://${root}/src/electron/renderer/pluginViews.css"><style>body{overflow:auto}#scroll{display:block;height:500px;overflow:auto}#before{height:80px}#after{height:600px}</style></head><body><div id="scroll" class="settings-panel"><div id="before"></div><div id="settings"></div><div id="after"></div></div><button id="outside">Outside</button><script src="file://${root}/src/electron/renderer/pluginViews.js"></script><script src="file://${root}/src/electron/renderer/limits/windowsView.js"></script><script src="file://${root}/src/electron/renderer/selectControl.js"></script><script src="file://${root}/src/electron/renderer/pluginSettings.js"></script><script src="file://${root}/src/electron/renderer/pluginMainPages.js"></script></body></html>`);
  win = new BrowserWindow({ show: false, width: 361, height: 799, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(scratch, 'index.html'));
  // Hidden fixture windows need focus emulation for real DOM focusin/out.
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  const result = await win.webContents.executeJavaScript(`(async () => {
    const checks = [], errors = [], calls = [];
    const check = (name, ok, evidence) => { checks.push({name, ok: Boolean(ok), evidence}); };
    const box = document.getElementById('settings'), scroll = document.getElementById('scroll');
    const tick = () => new Promise(r => setTimeout(r, 20));
    const data = {enabled:true, plugins:[{id:'alpha',name:'Alpha',description:'Plugin description',version:'1.0.0',source:'builtin',status:'active',enabled:true,permissions:[],hosts:[],views:[{ref:'alpha/view',title:'View',surfaces:['home','page'],placements:{home:false}}],background:{supported:true,enabled:false},logs:[{at:0,level:'info',text:'Fixture ready'}],runtime:{state:'idle',cpuPercent:null,memoryMB:null}},{id:'beta',name:'Beta',source:'builtin',status:'disabled',enabled:false,permissions:[],hosts:[],views:[]}]};
    let pending, reject, previewPending, catalogCalls = 0;
    let catalogMode = 'deferred', appearanceMode = 'success', previewMode = 'success';
    const catalog = {entries:[{id:'demo',name:'Demo',description:'Example',author:'Author',version:'1.0.0',origin:{id:'official',kind:'official'},versions:[{version:'1.0.0',compatible:true,installable:true},{version:'2.0.0',compatible:true,installable:true}],status:'available'}],sources:[]};
    const tooltips = TokenMonitorLimitWindowsView.createLimitWindowsView({document,tooltip:{hasOpened:()=>false,markOpened:()=>{},release:()=>{}}});
    const panel = TokenMonitorPluginSettings.createPluginSettingsPanel({document,container:box,setDetailTooltip:tooltips.setDetailTooltip,t:(key,args)=>key==='plugins.ui.locationCount'?String(args.count)+' locations':key,onError:e=>errors.push(e.message),api:{
      list:async()=>structuredClone(data),
      catalog:()=>{catalogCalls++;return catalogMode==='deferred'?new Promise((yes,no)=>{pending=yes;reject=no}):Promise.resolve(catalog)},
      place:async(ref,surface,on)=>{calls.push(['place',ref,surface,on]);data.plugins[0].views[0].placements.home=on;return structuredClone(data)},
      setEnabled:async(id,on)=>{const p=data.plugins.find(p=>p.id===id);p.enabled=on;p.status=on?'active':'disabled';return structuredClone(data)},
      appearance:async()=>({value:{font:'inherit',density:'standard',corners:'rounded',panel:'plain',colors:{}}}),
      setAppearance:async value=>{if(appearanceMode==='error')throw Error('ENOSPC');return {value}},
      catalogPreview:async(source,id,version)=>{calls.push(['preview',version]);if(previewMode==='error')throw Error('preview rejected');if(previewMode==='deferred')await new Promise(resolve=>{previewPending=resolve});return {token:'token-'+version,id,name:'Demo',description:'Example',version,author:'Author',origin:{id:source,kind:'official'},permissions:[],hosts:[],risk:{},operation:'install',sha256:'abc'}},
      cancelInstall:async token=>{calls.push(['cancel',token])},
      install:async token=>{calls.push(['install',token]);return structuredClone(data)},
      openFolder:async()=>{calls.push(['folder'])},reload:async()=>structuredClone(data)
    }});
    await panel.refresh();
    data.plugins[0].author='Token Monitor · Official';await panel.refresh();
    const sourceIdentity=box.querySelector('.plugin-identity');
    check('host-source-label-is-separate-from-author-controlled-text',sourceIdentity.querySelector('.plugin-author').textContent==='Token Monitor · Official'&&sourceIdentity.querySelector('.plugin-origin-label').textContent==='settings.plugins.source.builtin'&&!sourceIdentity.querySelector('.plugin-author').contains(sourceIdentity.querySelector('.plugin-origin-label')));
    check('only-host-official-origin-gets-shield',Boolean(sourceIdentity.querySelector('.plugin-shield')));
    const officialSource=sourceIdentity.querySelector('.plugin-source');
    check('official-attribution-is-one-green-line-with-host-owned-source',officialSource.firstElementChild.classList.contains('plugin-shield')&&getComputedStyle(officialSource).flexWrap==='nowrap'&&getComputedStyle(officialSource.querySelector('.plugin-author')).color===getComputedStyle(officialSource.querySelector('.plugin-origin-label')).color&&getComputedStyle(officialSource.querySelector('.plugin-origin-label')).borderTopWidth==='0px');
    data.plugins[0].installation={origin:{kind:'community'}};await panel.refresh();
    check('community-author-cannot-spoof-official-shield',!box.querySelector('[data-plugin-id="alpha"] .plugin-shield')&&box.querySelector('[data-plugin-id="alpha"] .plugin-origin-label').textContent==='plugins.origin.community');
    delete data.plugins[0].installation;
    data.plugins[0].views[0].placements={home:true,page:false,tray:true};
    data.plugins[0].views[0].surfaces=['home','page','tray'];await panel.refresh();
    let locations=box.querySelector('.plugin-location-count');locations.focus({preventScroll:true});await tick();
    let locationTip=locations.querySelector('[role="tooltip"]');
    check('location-count-and-tooltip-list-selected-not-supported-surfaces',locations.firstChild.textContent==='2 locations'&&locationTip.textContent.includes('settings.plugins.surface.home')&&locationTip.textContent.includes('settings.plugins.surface.tray')&&!locationTip.textContent.includes('settings.plugins.surface.page')&&locations.getAttribute('aria-describedby')===locationTip.id);
    check('location-tooltip-opens-on-keyboard-focus-and-holds-refresh',locationTip.matches(':popover-open')&&panel.isInteracting(),{open:locationTip.matches(':popover-open'),hold:panel.isInteracting(),focus:document.activeElement.outerHTML});
    locations.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    check('location-tooltip-dismisses-with-escape',!locationTip.matches(':popover-open'));
    document.getElementById('outside').focus();locations.dispatchEvent(new PointerEvent('pointerenter'));await tick();
    check('location-tooltip-opens-on-pointer-hover',locationTip.matches(':popover-open')&&panel.isInteracting());
    locations.dispatchEvent(new PointerEvent('pointerleave'));check('location-tooltip-closes-on-pointer-leave',!locationTip.matches(':popover-open'));
    locations.focus({preventScroll:true});scroll.scrollTop=60;locations.click();await tick();
    check('location-count-opens-placement-settings-with-keyboard-focus',document.activeElement===box.querySelector('.plugin-views')&&Boolean(box.querySelector('.plugin-surface-chip')));
    box.querySelector('.plugin-surface-chip').click();await tick();
    box.querySelector('.plugin-back').click();await tick();
    check('placement-back-restores-count-focus-even-if-count-changes',document.activeElement===box.querySelector('.plugin-location-count')&&scroll.scrollTop===60&&document.activeElement.firstChild.textContent==='1 locations');
    data.plugins[0].status='disabled';data.plugins[0].enabled=false;await panel.refresh();box.querySelector('.plugin-location-count').click();await tick();
    check('disabled-plugin-preserves-readable-selected-locations',Boolean(box.querySelector('.plugin-views'))&&!box.querySelector('.plugin-surface-chip')&&box.querySelector('.plugin-views').textContent.includes('settings.plugins.surface.tray'));
    box.querySelector('.plugin-back').click();data.plugins[0].status='active';data.plugins[0].enabled=true;data.plugins[0].views[0].placements={home:false};data.plugins[0].views[0].surfaces=['home','page'];await panel.refresh();
    check('zero-selected-locations-is-explicit',box.querySelector('.plugin-location-count').firstChild.textContent==='0 locations'&&box.querySelector('.plugin-location-count [role="tooltip"]').textContent==='plugins.ui.noPlacements');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.getContext('2d').fillRect(4,4,24,24);data.plugins[0].identityIcon=canvas.toDataURL('image/png');await panel.refresh();await tick();
    const artwork=box.querySelector('.plugin-identity-art img');
    check('author-PNG-renders-in-host-identity-slot',artwork?.complete&&artwork.naturalWidth===32&&artwork.getBoundingClientRect().width===26);
    data.plugins[0].identityIcon='data:image/png;base64,AAAA';await panel.refresh();await tick();
    check('undecodable-artwork-falls-back-without-empty-slot',!box.querySelector('.plugin-identity-art img')&&Boolean(box.querySelector('.plugin-identity-art svg')));
    delete data.plugins[0].identityIcon;await panel.refresh();
    const tab = id=>box.querySelector('[data-tab="'+id+'"]');
    const click = text=>[...box.querySelectorAll('button')].find(n=>n.textContent===text).click();
    scroll.scrollTop=60;
    const official=tab('official');official.focus({preventScroll:true});const y=official.getBoundingClientRect().y;
    official.click();const during={y:official.getBoundingClientRect().y,focus:document.activeElement===official,connected:official.isConnected};
    official.click();tab('community').click();
    check('pending-navigation-keeps-node-position-focus-and-one-request',during.y===y&&during.focus&&during.connected&&catalogCalls===1,{during,y,catalogCalls});
    scroll.scrollTop=70;pending(catalog);await tick();
    check('completion-retains-navigation-and-current-scroll',official===tab('official')&&document.activeElement===official&&scroll.scrollTop===70&&official.getAttribute('aria-selected')==='true',{scroll:scroll.scrollTop});
    const community=tab('community');community.focus({preventScroll:true});community.click();reject(Error('offline'));await tick();
    check('failed-tab-load-keeps-current-page-and-focus',official.getAttribute('aria-selected')==='true'&&document.activeElement===community&&errors.at(-1)==='offline');
    community.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    check('keyboard-navigation-with-labelled-panel',document.activeElement===tab('style')&&tab('style').tabIndex===0&&[...box.querySelectorAll('[role="tab"]')].filter(n=>n.tabIndex===0).length===1&&box.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')===official.id&&box.querySelector('[role="tablist"]')!==null);
    catalogMode='success';tab('installed').click();await tick();
    check('installed-cards-have-no-folds-pages-or-redundant-normal-status',!box.querySelector('.plugin-installed-card details, .plugin-installed-card .plugin-page-actions, .plugin-installed-card .plugin-status')&&box.querySelectorAll('.plugin-manage').length===2);
    let manage=box.querySelector('.plugin-manage');manage.focus({preventScroll:true});scroll.scrollTop=60;manage.click();await tick();
    check('settings-opens-dedicated-detail-with-back-focus',Boolean(box.querySelector('.plugin-detail'))&&!box.querySelector('.plugin-installed-card')&&document.activeElement===box.querySelector('.plugin-back')&&Boolean(box.querySelector('.plugin-page-actions')));
    let chip=box.querySelector('.plugin-surface-chip');chip.focus({preventScroll:true});scroll.scrollTop=100;chip.click();await tick();
    chip=box.querySelector('.plugin-surface-chip');
    check('placement-retains-logical-focus-scroll-and-detail',chip===document.activeElement&&chip.getAttribute('aria-pressed')==='true'&&scroll.scrollTop===100&&Boolean(box.querySelector('.plugin-detail')),{scroll:scroll.scrollTop,calls});
    box.querySelector('.plugin-diagnostics').click();await tick();
    check('diagnostics-shows-runtime-and-logs-outside-list',Boolean(box.querySelector('.plugin-log-lines'))&&Boolean(box.querySelector('.plugin-runtime'))&&!box.querySelector('.plugin-views'));
    click('plugins.ui.toSettings');await tick();
    check('diagnostics-return-restores-settings-entry-focus',document.activeElement===box.querySelector('.plugin-diagnostics')&&Boolean(box.querySelector('.plugin-views')));
    box.querySelector('.plugin-back').click();await tick();
    check('back-restores-list-position-and-logical-focus',document.activeElement===box.querySelector('.plugin-manage')&&scroll.scrollTop===60&&!box.querySelector('.plugin-detail'));
    const toggle=box.querySelector('.plugin-enable');toggle.focus({preventScroll:true});toggle.click();await tick();
    check('disable-does-not-reorder-plugin-or-lose-focus',[...box.querySelectorAll('[data-plugin-id]')].map(n=>n.dataset.pluginId).join(',')==='alpha,beta'&&document.activeElement===box.querySelector('.plugin-enable'));
    tab('official').click();await tick();
    check('catalog-shares-identity-layout-with-no-inline-version-folds',Boolean(box.querySelector('.plugin-catalog .plugin-identity-art'))&&!box.querySelector('.plugin-catalog details'));
    catalog.entries[0].installedVersion='1.0.0';catalog.entries[0].status='installed';await panel.refresh();
    const installedLink=box.querySelector('.plugin-installed-check');
    check('catalog-installed-check-uses-success-color-and-retains-navigation',Boolean(installedLink)&&installedLink.textContent==='plugins.catalog.installed'&&getComputedStyle(installedLink).color===getComputedStyle(box.querySelector('.plugin-origin-official')).color);
    installedLink.click();await tick();check('installed-check-navigates-to-installed-list',Boolean(box.querySelector('.plugin-installed-card')));
    delete catalog.entries[0].installedVersion;catalog.entries[0].status='available';tab('official').click();await tick();

    click('plugins.package.install');await tick();
    check('catalog-install-opens-version-and-consent-review',Boolean(box.querySelector('.plugin-catalog-review .plugin-package-preview'))&&box.querySelectorAll('.plugin-catalog-review details').length===1);
    let select=box.querySelector('.plugin-version-picker select');select.focus({preventScroll:true});select.value='2.0.0';select.dispatchEvent(new Event('change'));await tick();
    check('version-change-replaces-token-and-retains-review-focus',document.activeElement===box.querySelector('.plugin-version-picker select')&&document.activeElement.value==='2.0.0'&&calls.some(c=>c[0]==='cancel'&&c[1]==='token-1.0.0')&&box.querySelector('.plugin-package-preview .plugin-version').textContent==='2.0.0');
    previewMode='error';select=box.querySelector('.plugin-version-picker select');select.value='1.0.0';select.dispatchEvent(new Event('change'));await tick();
    check('failed-version-preview-removes-stale-install-consent',!box.querySelector('.plugin-package-preview')&&errors.at(-1)==='preview rejected'&&calls.some(c=>c[0]==='cancel'&&c[1]==='token-2.0.0'));
    click('plugins.ui.backCatalog');await tick();previewMode='success';
    tab('community').click();await tick();click('plugins.catalog.sources');await tick();
    check('sources-open-as-route-without-nested-disclosures',Boolean(box.querySelector('.plugin-sources .plugin-source-form'))&&!box.querySelector('.plugin-sources details')&&document.activeElement===box.querySelector('.plugin-back'));
    const sourceUrl=box.querySelector('.plugin-source-form input');sourceUrl.value='https://example.test/catalog.json';sourceUrl.dispatchEvent(new Event('input'));click('plugins.ui.backCatalog');await tick();click('plugins.catalog.sources');await tick();
    check('source-route-retains-unsaved-input',box.querySelector('.plugin-source-form input').value==='https://example.test/catalog.json');
    tab('installed').click();await tick();
    box.querySelector('.plugin-toolbar .plugin-more').click();await tick();
    check('developer-actions-use-accessible-popover',Boolean(box.querySelector('.plugin-menu:popover-open'))&&box.querySelector('.plugin-more').getAttribute('aria-expanded')==='true'&&document.activeElement===box.querySelector('.plugin-menu button'));
    const menu=box.querySelector('.plugin-menu:popover-open'), menuTrigger=box.querySelector('.plugin-toolbar .plugin-more');
    const reference=document.createElement('div');reference.className='select-control-popup';document.body.append(reference);
    const sharedSurface=()=>['backgroundColor','backgroundImage','backdropFilter','borderRadius','boxShadow'].every(k=>getComputedStyle(menu)[k]===getComputedStyle(reference)[k]);
    document.documentElement.style.setProperty('--bg','transparent');
    check('action-menu-reuses-host-plate-with-transparent-app-background',sharedSurface()&&getComputedStyle(menu).backgroundColor!=='rgba(0, 0, 0, 0)'&&getComputedStyle(menu).backdropFilter.includes('blur'));
    document.documentElement.classList.add('native-liquid-glass');
    check('action-menu-reuses-native-glass-plate',sharedSurface());
    document.documentElement.classList.remove('native-liquid-glass');document.documentElement.style.removeProperty('--bg');reference.remove();
    const menuItems=[...menu.querySelectorAll('button')];
    for(const [key,index] of [['End',2],['ArrowUp',1],['Home',0],['ArrowDown',1]]){menu.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));check('action-menu-key-'+key,document.activeElement===menuItems[index]);}
    menu.hidePopover();await tick();const menuWrap=menuTrigger.parentElement, menuParent=menuWrap.parentElement;document.body.append(menuWrap);menuTrigger.style.position='fixed';menuTrigger.style.bottom='8px';menuTrigger.style.right='8px';menuTrigger.click();await tick();
    check('action-menu-flips-above-bottom-trigger',menu.getBoundingClientRect().bottom<=menuTrigger.getBoundingClientRect().top&&menu.getBoundingClientRect().left>=8&&menu.getBoundingClientRect().right<=innerWidth-8,{menu:menu.getBoundingClientRect().toJSON(),trigger:menuTrigger.getBoundingClientRect().toJSON()});
    menu.hidePopover();await tick();menuParent.append(menuWrap);menuTrigger.style.cssText='';menuTrigger.click();await tick();
    click('settings.plugins.openFolder');await tick();
    check('popover-action-closes-and-executes-once',!box.querySelector('.plugin-menu:popover-open')&&calls.filter(c=>c[0]==='folder').length===1);
    tab('style').click();await tick();
    check('style-preview-precedes-edit-controls',Boolean(box.querySelector('.plugin-style-preview').compareDocumentPosition(box.querySelector('[data-style-key="font"]'))&Node.DOCUMENT_POSITION_FOLLOWING));
    const field=box.querySelector('.plugin-style-field');
    check('style-controls-align-within-host-settings',getComputedStyle(field).display==='flex'&&field.querySelector('select').getBoundingClientRect().width>=140,{width:field.querySelector('select').getBoundingClientRect().width,display:getComputedStyle(field).display});
    const refRow=document.createElement('label');refRow.className='color-picker-row';const refInput=document.createElement('input');refInput.type='color';refInput.className='color-picker-input';refRow.append(refInput);scroll.append(refRow);
    const color=box.querySelector('[data-style-color]');
    check('style-color-controls-use-host-size-and-density',color.getBoundingClientRect().width===refInput.getBoundingClientRect().width&&color.getBoundingClientRect().height===refInput.getBoundingClientRect().height&&color.parentElement.getBoundingClientRect().height<=28,{color:color.getBoundingClientRect().toJSON(),rowHeight:color.parentElement.getBoundingClientRect().height});
    refRow.remove();color.value='#123456';color.dispatchEvent(new Event('input'));
    tab('installed').click();await tick();tab('style').click();await tick();check('compact-colors-retain-unsaved-draft',box.querySelector('[data-style-color]').value==='#123456');
    let font=box.querySelector('[data-style-key="font"]');font.value='mono';font.dispatchEvent(new Event('change'));
    let jsonDraft=box.querySelector('textarea');jsonDraft.value='{"font":"mono"}';jsonDraft.dispatchEvent(new Event('input'));
    tab('installed').click();await tick();tab('style').click();await tick();
    check('style-tab-round-trip-keeps-preview-json-and-unsaved-state',box.querySelector('[data-style-key="font"]').value==='mono'&&box.querySelector('textarea').value==='{"font":"mono"}'&&box.querySelector('[role="status"]').textContent==='plugins.style.unsaved');
    box.querySelector('.plugin-style-actions .plugin-more').click();await tick();click('plugins.style.transfer');await tick();
    check('style-fields-flat-and-transfer-opens-from-tools',!box.querySelector('.plugin-style-form details')&&!box.querySelector('.plugin-style-transfer').hidden&&document.activeElement===box.querySelector('.plugin-style-transfer textarea'));
    const raw=box.querySelector('textarea');raw.value='{bad JSON';raw.dispatchEvent(new Event('input'));click('plugins.style.import');await tick();
    check('invalid-import-keeps-draft-and-transfer',box.querySelector('textarea').value==='{bad JSON'&&box.querySelector('[data-style-key="font"]').value==='mono'&&!box.querySelector('.plugin-style-transfer').hidden);
    appearanceMode='error';click('plugins.style.save');await tick();
    check('failed-save-keeps-style-draft',box.querySelector('[data-style-key="font"]').value==='mono'&&errors.at(-1)==='ENOSPC');
    appearanceMode='success';click('plugins.style.save');await tick();
    check('successful-save-updates-style',box.querySelector('[data-style-key="font"]').value==='mono');
    tab('installed').click();await tick();catalogMode='deferred';tab('official').focus();tab('official').click();document.getElementById('outside').focus();pending(catalog);await tick();
    check('completion-does-not-steal-external-focus',document.activeElement.id==='outside');
    catalogMode='success';document.getElementById('after').style.display='none';scroll.style.height='400px';
    tab('style').click();await tick();scroll.scrollTop=120;
    const shortTab=tab('official');shortTab.focus({preventScroll:true});const shortTabY=shortTab.getBoundingClientRect().y, shortScroll=scroll.scrollTop;
    shortTab.click();await tick();
    check('short-tab-keeps-rail-position-without-downstream-spacer',scroll.scrollTop===shortScroll&&shortTab.getBoundingClientRect().y===shortTabY,{before:shortScroll,after:scroll.scrollTop,beforeY:shortTabY,afterY:shortTab.getBoundingClientRect().y});
    catalog.entries[0].versions.push({version:'3.0.0',compatible:true,installable:true,changelog:'Version three'});
    click('plugins.package.install');await tick();previewMode='deferred';
    let rapid=box.querySelector('.plugin-version-picker select');rapid.focus({preventScroll:true});rapid.value='2.0.0';rapid.dispatchEvent(new Event('change'));await tick();
    rapid.value='3.0.0';rapid.dispatchEvent(new Event('change'));
    let resolvePreview=previewPending;previewPending=null;resolvePreview();await tick();
    if(previewPending){resolvePreview=previewPending;previewPending=null;resolvePreview();await tick();}
    const rapidAligned=box.querySelector('.plugin-version-picker select').value==='3.0.0'&&box.querySelector('.plugin-package-preview .plugin-version').textContent==='3.0.0';
    box.querySelector('.plugin-allow').click();await tick();previewMode='success';
    check('rapid-version-changes-align-selection-preview-and-installed-token',rapidAligned&&calls.filter(c=>c[0]==='install').at(-1)?.[1]==='token-3.0.0',{lastInstall:calls.filter(c=>c[0]==='install').at(-1)});
    const pageBox=document.createElement('div');document.body.append(pageBox);
    const demands=[], pageHost=TokenMonitorPluginViews.createPluginViewHost({document,window,t:k=>k,onDemand:(s,r)=>demands.push([s,r]),onInteraction:()=>{}});
    const pages=TokenMonitorPluginMainPages.create({document,container:pageBox,host:pageHost,t:k=>k,openWindow:()=>{}});
    const routes=[{id:'plugin:alpha/view',ref:'alpha/view',title:'Alpha'},{id:'plugin:beta/view',ref:'beta/view',title:'Beta'}];
    const payload=(ref,revision=1)=>({surface:'page',views:{[ref]:{status:'ok',revision,tree:{type:'input',action:'note',label:'Note',value:'saved'}}}});
    pages.render(routes,'plugin:alpha/view');pageHost.update(payload('alpha/view'));
    const draft=pageBox.querySelector('input');draft.value='unsubmitted';draft.dispatchEvent(new Event('input'));
    pages.render(routes,'plugin:beta/view');pageHost.update(payload('beta/view'));pageHost.update({surface:'page',views:{}});
    pages.render(routes,'plugin:alpha/view');pageHost.update(payload('alpha/view',2));
    check('main-page-draft-survives-switch-empty-push-and-worker-restart',draft.isConnected&&draft.value==='unsubmitted'&&draft===pageBox.querySelector('input'));
    pageHost.update({surface:'page',views:{'alpha/view':{status:'ok',revision:2,tree:{type:'input',action:'note',label:'Note',value:'unsubmitted'}}}});
    pageHost.update(payload('alpha/view',2));check('acknowledged-main-page-draft-resumes-model-updates',draft.value==='saved');
    pages.render(routes.filter(p=>p.ref!=='alpha/view'),'home');
    check('removed-page-releases-retained-dom',!draft.isConnected&&pageBox.classList.contains('hidden'));
    return {checks,errors};
  })()`);
  for (const check of result.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`, check.evidence || '');
  fs.writeFileSync(path.join(scratch, 'results.json'), JSON.stringify(result,null,2));
  console.log('Evidence:', path.join(scratch, 'results.json'));
  assert.ok(result.checks.every(check => check.ok), 'Plugin settings UI regression checks failed');
  win.destroy();app.quit();
}
app.whenReady().then(main).catch(error=>{console.error(error);app.exit(1);});
