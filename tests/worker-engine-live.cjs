const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const {ToolAgent}=require('../runtimes/deepseek/tool-agent.cjs');
process.env.BOPS_EXECUTION_ENGINE='deepseek';
const model=process.argv[2]||'micky-tools-qwen25';
const ui=process.argv.includes('--notepad');
const state={sessions:[],messages:[]};
const store={getState:()=>state,bot:()=>({name:'Micky test'}),ownerName:()=> 'owner',id:p=>p+'-'+crypto.randomUUID(),update:fn=>fn(state),patchSession:(id,patch)=>Object.assign(state.sessions.find(s=>s.id===id),patch),addMessage:m=>{state.messages.push(m);return m;}};
function load(file,modules={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='server-only'?{}:modules[name]??require(name),exports);return exports;}
const intent=load('lib/task-intent.ts');
const fixtureId=crypto.randomUUID();
const folder=path.resolve('work','worker-engine-'+fixtureId);fs.mkdirSync(folder,{recursive:true});const target=path.join(folder,'engine-'+fixtureId.slice(0,8)+'.txt');
if(ui)fs.writeFileSync(target,'');
const worker=load('lib/server/sessions.ts',{'./store':store,'./attention':{pingIfWorthIt:()=>{}},'@/lib/types':{botChatId:id=>'chat:'+id,live:s=>['queued','starting','running'].includes(s.status)},'@/lib/task-intent':intent,'./provider-retry':{providerRequest:fn=>fn()},'./deepseek':{createToolAgent:async(tools,prompt,signal)=>new ToolAgent({tools,prompt,signal,model})}});
const job=worker.startSession({botId:'repair-test',goal:ui?`Open "${target}" in Notepad and type "Micky UI verified". Do not save the document or change any other file.`:`Use PowerShell to create the text file "${target}" containing exactly Micky engine verified. Read that file back and report its exact contents. Do not change other files.`});
const poll=setInterval(async()=>{if(['done','failed'].includes(job.status)){clearInterval(poll);try{assert.equal(job.status,'done',job.error);if(!ui){assert.equal(fs.readFileSync(target,'utf8').trim(),'Micky engine verified');assert.ok(job.answer.includes('Micky engine verified'));}else {
 const base=process.env.BOPS_HARNESS_URL||'http://127.0.0.1:8768';
 const windows=await(await fetch(base+'/windows')).json();
 const window=windows.windows.find(w=>w.title.includes(path.basename(target)));
 assert.ok(window,'The requested document must be the visible Notepad tab');
 const observed=await(await fetch(base+'/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:window.handle})})).json();
 assert.ok(observed.controls.some(c=>['Edit','Document'].includes(c.type)&&c.value?.trim()==='Micky UI verified'),'Independent inspection must read the exact typed value');
 }console.log('PASS: real task worker, DeepSeek tool loop, '+(ui?'verified Notepad typing.':'verified file write/read.'));}catch(e){console.error(e);process.exitCode=1;}}},500);
