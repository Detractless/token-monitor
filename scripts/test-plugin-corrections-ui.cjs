'use strict';
// Deterministic Chromium fixture: production ring renderer and Notch navigation,
// synthetic readings/geometry; no primary App, user data or debugging port.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createResolver } = require('../src/shared/plugins/bindings');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-plugin-corrections-'));
const manifest = require('../src/electron/plugins/builtin/system-monitor/manifest.json');
const rings = [];
function walk(node) { if (!node || typeof node !== 'object') return; if (node.type === 'ring') rings.push(node); if (Array.isArray(node)) node.forEach(walk); else Object.values(node).forEach(walk); }
walk(manifest.views);
const trees = [20, 80].map(value => createResolver({ read: id => ({ value: id === 'sys.cpu' ? value : { percent: value } }), history: () => [], pluginId: manifest.id }).resolveNode({ type: 'stack', dir: 'row', gap: 24, children: rings }));
const dock = path.join(root, 'src/electron/renderer/edgeDock');
const scripts = [...fs.readFileSync(path.join(dock, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => !['dock.js', '../notch/panel.js'].includes(s));
const before = execFileSync('git', ['show', '230e819:src/electron/renderer/notch/panel.js'], { cwd: root, encoding: 'utf8' }).replace('TokenMonitorNotchPanel = api', 'TokenMonitorNotchPanelBefore = api');
fs.writeFileSync(path.join(scratch, 'panel-before.js'), before);
app.setPath('userData', path.join(scratch, 'profile'));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  app.dock?.hide();
  fs.writeFileSync(path.join(scratch, 'index.html'), `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="file://${root}/src/electron/renderer/styles.css"><link rel="stylesheet" href="file://${dock}/dock.css"><link rel="stylesheet" href="file://${root}/src/electron/renderer/notch/notch.css"><link rel="stylesheet" href="file://${root}/src/electron/renderer/pluginViews.css">
  <style>body{background:#202124;color:#eee;margin:0;padding:20px;font:14px system-ui}h2{font:500 14px system-ui;margin:10px 0}.fixture-panel{position:relative;width:640px;height:245px;background:#141516;border-radius:0 0 24px 24px;overflow:hidden;margin:12px 0}.camera{position:absolute;top:0;left:230px;width:180px;height:32px;background:black;z-index:10;border-radius:0 0 12px 12px}.motion{display:flex;gap:28px;margin-bottom:20px}#settings{width:380px}.notch-panel{--notch-content-scale:1}.label{color:#aaa;font-size:12px}</style></head><body>
  <h2>System Monitor · CPU / RAM · 20 → 80%</h2><div class="motion"><section><div class="label">Before: explicit caption</div><div id="old-ring"></div></section><section><div class="label">After: App Count / Roll</div><div id="new-ring"></div></section></div>
  <h2>Before · 4 built-in + 3 plugin tabs</h2><div class="fixture-panel is-notch-attached" id="old-notch"><div class="camera"></div></div>
  <h2>After · same 4 built-in + 3 plugin tabs, camera-safe navigation</h2><div class="fixture-panel is-notch-attached" id="new-notch"><div class="camera"></div></div>
  <div class="label">Production renderer · synthetic readings / 180px camera gap · not native hardware acceptance</div><div id="settings"></div>
  ${scripts.map(s => `<script src="file://${path.resolve(dock, s)}"></script>`).join('')}
  <script src="file://${scratch}/panel-before.js"></script><script src="file://${root}/src/electron/renderer/notch/panel.js"></script><script src="file://${root}/src/electron/renderer/notch/pageSettings.js"></script></body></html>`);
  const win = new BrowserWindow({ show: false, width: 700, height: 850, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(scratch, 'index.html'));
  win.showInactive();
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  const run = js => win.webContents.executeJavaScript(js);
  const checks = await run(`(async()=>{
    const checks=[],check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail}),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const trees=${JSON.stringify(trees)};
    const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
    let mode='roll',motion=true;
    const host=TokenMonitorPluginViews.createPluginViewHost({document,window,motionAllowed:()=>motion,motionMode:()=>mode});
    for(const id of ['old-ring','new-ring'])host.mount(document.getElementById(id),id,'home');
    function push(index){const tree=trees[index],old=JSON.parse(JSON.stringify(tree));for(const ring of old.children){delete ring.captionNumber;delete ring.captionFormat;}host.update({surface:'home',views:{'old-ring':{status:'ok',revision:1,tree:old},'new-ring':{status:'ok',revision:1,tree}}});}
    const captions=()=>[...document.querySelectorAll('#new-ring .pv-ring-caption')];
    push(0);await wait(20);push(1);
    check('real-System-Monitor-explicit-bindings-Roll',captions().every(n=>n.getAnimations({subtree:true}).length>0));
    check('before-explicit-captions-jump',document.getElementById('old-ring').getAnimations({subtree:true}).length===0);
    motion=false;host.refreshMotion();check('reduced-motion-settles-rings',captions().every(n=>n.textContent==='80%'&&n.getAnimations({subtree:true}).length===0));
    motion=true;mode='count';host.refreshMotion();push(0);host.refreshMotion();await wait(1100);push(1);await wait(100);
    check('real-System-Monitor-Count',captions().every(n=>parseInt(n.textContent)>20&&parseInt(n.textContent)<80));
    await wait(1100);check('Count-exact-final',captions().every(n=>n.textContent==='80%'));
    for(const ring of trees[0].children)ring.motion='none';for(const ring of trees[1].children)ring.motion='none';push(0);push(1);
    check('author-none-stays-static',captions().every(n=>n.textContent==='80%'&&TokenMonitorTokenNumberAnimation.currentCountValue(n)===undefined));
    const refs=Array.from({length:9},(_,i)=>'demo/page'+i),states=Object.fromEntries(refs.map((ref,i)=>[ref,{title:'Page '+(i+1),icon:'cpu'}]));
    const calls=[];
    const pluginHost=TokenMonitorPluginViews.createPluginViewHost({document,window,onDemand:(_,refs)=>calls.push(['demand',refs])});
    pluginHost.update({surface:'notch',views:Object.fromEntries(refs.map(ref=>[ref,{...states[ref],status:'ok',tree:{type:'text',text:states[ref].title}}]))});
    const shared={pluginHost,markNode:()=>el('span'),hasMask:()=>false,providerLabel:x=>x,limitProviderColor:()=>'',formatTokens:String,formatCardTokens:String,formatBreakdownTokens:String,usageCostNode:()=>el('span'),formatRate:String,appearance:()=>({}),prefersReducedMotion:()=>true,limitAccountTitle:()=>'',overflowText:{stop(){},preserveReading(){},refresh(){}},limitWindowsView:{},ensureRefreshButton:()=>el('button')};
    const options={document,window,el,t:key=>TokenMonitorI18n.translate('en',key),state:{locale:'en'},bridge:{},shared};
    const old=TokenMonitorNotchPanelBefore.createNotchPanel(options),panel=TokenMonitorNotchPanel.createNotchPanel(options);
    document.getElementById('old-notch').append(old.node);document.getElementById('new-notch').append(panel.node);
    const data={cells:[],panel:{builtinPages:[],pluginPages:refs,pluginCatalog:states}};
    old.render({cells:[],panel:{pluginPages:refs.slice(0,3),pluginCatalog:states}});old.place({notched:true,gapWidth:180,height:32},1);old.selectPage('plugin:'+refs[0]);
    panel.render(data);panel.place({notched:true,gapWidth:180,height:32},1);
    const tabs=()=>[...panel.node.querySelectorAll('.notch-tab:not([hidden])')];
    check('all-selected-pages-available',tabs().length===9&&panel.view.page==='plugin:'+refs[0]);
    for(const zoom of [.75,1,1.5])for(const width of [480,640,760]){
      const box=document.getElementById('new-notch');box.style.width=width+'px';panel.node.style.setProperty('--notch-zoom',zoom);panel.place({notched:true,gapWidth:180,height:32},zoom);await wait(35);
      panel.selectPage('plugin:'+refs[8]);await wait(10);
      const rail=panel.node.querySelector('.notch-tab-rail').getBoundingClientRect(),gap=panel.node.querySelector('.notch-band-gap').getBoundingClientRect(),viewport=panel.node.querySelector('.notch-tab-viewport').getBoundingClientRect(),last=tabs().at(-1).getBoundingClientRect();
      check('camera-safe-'+width+'-'+zoom,rail.right<=gap.left+1&&last.right<=viewport.right+1&&last.left>=viewport.left-1,{rail:rail.right,gap:gap.left,last:last.right,viewport:viewport.right});
    }
    document.getElementById('new-notch').style.width='640px';panel.node.style.setProperty('--notch-zoom',1);panel.place({notched:true,gapWidth:180,height:32},1);panel.selectPage('plugin:'+refs[0]);await wait(30);
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));check('keyboard-reaches-last',panel.view.page==='plugin:'+refs[8]&&document.activeElement===tabs().at(-1));
    pluginHost.refreshDemand();await wait(40);check('only-visible-pages-demand-data',calls.at(-1)[1].includes(refs[8])&&!calls.at(-1)[1].includes(refs[4]));data.panel.pluginPages=refs.slice(0,2);panel.render(data);await wait(40);check('removed-selected-page-releases-demand',panel.view.page==='plugin:'+refs[0]&&!calls.at(-1)[1].includes(refs[8]));
    data.panel.pluginPages=refs;panel.render(data);panel.selectPage('plugin:'+refs[0]);
    let settings={},fail=false;const catalog={plugins:[{id:'demo',name:'Demo',status:'active',views:[{ref:'demo/page0',title:'Canvas',surfaces:['notch'],placements:{notch:true}}]}]};
    const container=document.getElementById('settings');let errors=0;
    const render=()=>TokenMonitorNotchPageSettings.render({document,container,settings,catalog,t:key=>TokenMonitorI18n.translate('en',key),save:async patch=>{if(fail)throw Error('disk');settings={...settings,...patch};render();},place:async(_,value)=>{catalog.plugins[0].views[0].placements.notch=value;render();},onError:()=>errors++});
    render();const toggle=async id=>{const input=container.querySelector('[data-page="'+id+'"]');input.focus();input.checked=!input.checked;input.dispatchEvent(new Event('change'));await wait(10);};
    await toggle('home');await toggle('limits');check('unified-settings-persist-successive-choices',JSON.stringify(settings.notchBuiltinPages)==='["sessions","breakdown"]');
    await toggle('plugin:demo/page0');check('plugin-toggle-uses-placement-contract',catalog.plugins[0].views[0].placements.notch===false);
    fail=true;await toggle('sessions');check('failed-save-restores-choice',errors===1&&container.querySelector('[data-page="sessions"]').checked);
    check('settings-retains-focus',document.activeElement?.dataset.page==='sessions');
    window.fixture={panel,old,host,push,trees,states,refs};return checks;
  })()`);
  fs.writeFileSync(path.join(scratch, 'results.json'), JSON.stringify(checks, null, 2));
  await run(`document.getElementById('settings').hidden=true;fixture.panel.render({cells:[],panel:{pluginPages:fixture.refs.slice(0,3),pluginCatalog:fixture.states}});fixture.panel.selectPage('plugin:'+fixture.refs[0]);fixture.trees.forEach(t=>t.children.forEach(n=>delete n.motion));fixture.push(0);`);
  await new Promise(resolve=>setTimeout(resolve,1100));
  await run('fixture.push(1)');
  await new Promise(resolve=>setTimeout(resolve,150));
  fs.writeFileSync(path.join(scratch,'comparison.png'),(await win.webContents.capturePage()).toPNG());
  await run(`(async()=>{for(const child of [...document.body.children]) if(child.id!=='settings') child.hidden=true;const settings=document.getElementById('settings');settings.hidden=false;settings.classList.add('settings-panel');settings.style.cssText='position:static;display:block;width:380px;max-height:none;overflow:visible';const title=document.createElement('h2');title.textContent='Notch · display pages (production controls / fixture)';document.body.prepend(title);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()`);
  // Chromium capture can otherwise return the prior compositor frame.
  await new Promise(resolve=>setTimeout(resolve,200));
  fs.writeFileSync(path.join(scratch,'page-settings.png'),(await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({scratch,passed:checks.filter(c=>c.ok).length,total:checks.length,failures:checks.filter(c=>!c.ok)},null,2));
  win.destroy();app.exit(checks.every(c=>c.ok)?0:1);
}).catch(error=>{console.error(error);app.exit(1);});
