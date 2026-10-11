// Launch the actual repository applications, with isolated profiles and shared local models.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const children=new Map();
async function launch(repo,mode){
 if(!['bigfoot','heyjev'].includes(mode))throw Error('Unknown native application');
 const endpoint=require('./local-workspace-config.cjs').localEndpoint(process.env.BOPS_LOCAL_LLM_URL);
 const response=await fetch(endpoint+'/models',{signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Local model service is unavailable');
 const ids=(await response.json()).data.map(m=>m.id);let selected={};
 try{selected=JSON.parse(fs.readFileSync(path.join(repo,'.data/model-selection.json'),'utf8'));}catch{}
 const model=selected.chat||process.env.BOPS_LOCAL_MODEL||(ids.includes('qwen2.5:3b')?'qwen2.5:3b':ids[0]);
 if(!ids.includes(model))throw Error('Selected tool model is not installed');
 let vision=selected.vision||process.env.BOPS_VISION_MODEL||ids.find(id=>/vl|vision|llava/i.test(id));
 let toolModel=model;
 if(mode==='bigfoot')try{const saved=JSON.parse(fs.readFileSync(path.join(repo,'.data/bigfoot/external-models.json'),'utf8'));if(ids.includes(saved.model))toolModel=saved.model;if(ids.includes(saved.vision))vision=saved.vision;}catch{}
 const env={...process.env,MICKY_REPO:repo,MICKY_LOCAL_LLM_URL:endpoint,MICKY_LOCAL_MODEL:toolModel,MICKY_LOCAL_VISION_MODEL:vision||'',PYTHONUTF8:'1',PYTHONUNBUFFERED:'1',HF_HUB_DISABLE_XET:'1'};
 delete env.ELECTRON_RUN_AS_NODE;
 const existing=status(repo)[mode];if(existing.running){if(mode==='heyjev')fs.writeFileSync(path.join(repo,'.data/heyjev/show.request'),String(Date.now()));else await foregroundBigfoot();return existing;}
 fs.mkdirSync(path.join(repo,'.logs'),{recursive:true});
 let exe,args,cwd;
 if(mode==='bigfoot'){
  cwd=path.join(repo,'Bigfoot');exe=path.join(repo,'node_modules/electron/dist/electron.exe');args=[cwd,'--remote-debugging-port=9233'];
  env.BIGFOOT_PROFILE_DIR=path.join(repo,'.data/bigfoot');fs.mkdirSync(env.BIGFOOT_PROFILE_DIR,{recursive:true});
  const file=path.join(env.BIGFOOT_PROFILE_DIR,'settings.json');
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({onboarded:true,onboardedVersion:2,provider:'local',localModel:model,ttsProvider:'system',wakeWord:false,launchAtLogin:false,builtInVoice:true,femaleVoiceDefault:true}));
 }else{
  cwd=path.join(repo,'HeyJev');exe=path.join(cwd,'.venv/Scripts/pythonw.exe');args=[path.join(cwd,'windows_app.py')];
  fs.mkdirSync(path.join(repo,'.data/heyjev'),{recursive:true});
 }
 if(!fs.existsSync(exe))throw Error('Application runtime is not installed: '+mode);
 const log=fs.openSync(path.join(repo,'.logs',mode+'.application.log'),'a');
 const launchedAt=Date.now();
 const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);children.set(mode,child);
 child.on('error',e=>{child.launchError=e.message;});
 for(let n=0;n<40;n++){
  if(child.launchError||child.exitCode!==null)throw Error(child.launchError||`${mode} exited during startup; see .logs/${mode}.application.log`);
  if(mode==='bigfoot'){try{const pages=await(await fetch('http://127.0.0.1:9233/json')).json();if(pages.some(p=>/app\.html/.test(p.url)))return status(repo)[mode];}catch{}}
  else{try{const s=JSON.parse(fs.readFileSync(path.join(repo,'.data/heyjev/app-status.json'),'utf8'));if(Number(s.time)*1000>=launchedAt&&s.ready&&status(repo)[mode].running)return status(repo)[mode];}catch{}}
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error(mode+' has not shown its interface yet; see its application log');
}
async function foregroundBigfoot(){
 const pages=await(await fetch('http://127.0.0.1:9233/json')).json();const page=pages.find(p=>/app\.html/.test(p.url));
 if(page)await fetch('http://127.0.0.1:9233/json/activate/'+page.id);
}
function status(repo){return Object.fromEntries(['bigfoot','heyjev'].map(mode=>{const p=children.get(mode);let info={};try{info=JSON.parse(fs.readFileSync(path.join(repo,'.data',mode,'app-status.json'),'utf8'));}catch{};let alive=false;try{if(info.pid){process.kill(info.pid,0);alive=Date.now()-Number(info.time)*(mode==='heyjev'?1000:1)<10000;}}catch{};return[mode,{running:alive&&info.ready===true,pid:alive?info.pid:p?.pid||null,error:p?.launchError||null,model:alive?info.model:null,modelConnected:alive&&(mode==='heyjev'||info.modelConnected===true),listening:alive&&info.listening===true,active:alive&&info.active===true}];}));}
function install({repo,ipcMain,getWindow}){
 const trusted=e=>{const w=getWindow();const f=e.senderFrame,m=w?.webContents.mainFrame;return w&&e.sender===w.webContents&&f?.processId===m?.processId&&f?.routingId===m?.routingId;};
 ipcMain.handle('micky:native-app-open',async(e,mode)=>{if(!trusted(e))throw Error('Only Micky can open these applications');return launch(repo,mode);});
 ipcMain.handle('micky:native-app-status',e=>{if(!trusted(e))throw Error('Only Micky can inspect these applications');return status(repo);});
}
function stop(){
 for(const [mode,p] of children){if(p.exitCode!==null)continue;
  try{fs.writeFileSync(path.join(__dirname,'../.data',mode,'quit.request'),String(Date.now()));}catch{}
 }
 children.clear();
}
module.exports={launch,status,install,stop};
if(require.main===module)launch(path.resolve(__dirname,'..'),process.argv[2]).then(s=>{console.log(JSON.stringify(s));}).catch(e=>{console.error(e.message);process.exitCode=1;});
