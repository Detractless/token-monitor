const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root='/Users/javis/.t3/worktrees/Token Monitor/feat-plugin-ecosystem';
const {createPluginManager}=require(root+'/src/electron/plugins/manager');
const {createManagedPlugins}=require(root+'/src/electron/plugins/managed');
const {parsePackage}=require(root+'/src/electron/plugins/package');
const {createDataBus}=require(root+'/src/shared/plugins/dataBus');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tm-uninstall-demand-'));
let now=1000000,next=1,samples=0,settings={pluginStates:{}};const timers=new Map();
const setTimer=(fn,ms)=>{const id=next++;timers.set(id,{fn,at:now+ms});return id;},clearTimer=id=>timers.delete(id);
async function advance(ms){const end=now+ms;for(;;){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;await due[1].fn();}now=end;}
const bus=createDataBus({now:()=>now,setTimer,clearTimer,defer:fn=>fn()});bus.defineSource('sys.cpu',{sample:()=>{samples++;return 42;}});
const userDir=path.join(dir,'plugins'),dataDir=path.join(dir,'data');fs.mkdirSync(userDir);fs.mkdirSync(path.join(dir,'builtin'));
const manager=createPluginManager({builtinDir:path.join(dir,'builtin'),userDir,dataDir,bus,getSettings:()=>settings,saveStates:states=>settings={...settings,pluginStates:states},now:()=>now,setTimer,clearTimer});
const api=createManagedPlugins({root:path.join(dir,'managed'),userDir,dataDir,manager,getSettings:()=>settings,saveSettings:patch=>settings={...settings,...patch}});api.recover();manager.reload();
(async()=>{try{
for(const id of ['probe-one','probe-two']){const pkg=parsePackage(JSON.stringify({format:1,manifest:{id,name:id,version:'1.0.0',tmApi:'^1',permissions:['sys.cpu'],visible:{intervalSeconds:2},views:[{id:'cpu',title:'CPU',surfaces:['home'],layout:{type:'stat',value:{$:'sys.cpu'}}}]}}));api.install(api.preview(pkg).token);manager.setEnabled(id,true);}
await advance(60000);assert.equal(samples,0);
manager.setSurfaceDemand('home',['probe-one/cpu','probe-two/cpu']);await advance(10000);assert.equal(samples,6);
api.uninstall('probe-one');await advance(4000);const sharedRetained=samples>6;assert.ok(sharedRetained);
api.uninstall('probe-two',{keepData:false,keepPlacements:false});const stoppedAt=samples;await advance(60000);assert.equal(samples,stoppedAt);assert.equal(manager.list().plugins.length,0);
console.log(JSON.stringify({managedInstallNoDemandSamples:0,twoPluginsSharedSamplesIn10s:6,firstUninstallRetainsOther:sharedRetained,lastUninstallStopsSampling:true,remainingSources:manager.list().plugins.length},null,2));
}finally{manager.dispose();bus.dispose();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
