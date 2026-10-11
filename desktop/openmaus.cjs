const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');const crypto=require('node:crypto');
async function startOpenMaus({repo,services}){
  const source=path.join(repo,'OpenMausBot');const dist=path.join(source,'dist');if(!fs.existsSync(path.join(dist,'index.html')))throw Error('OpenMausBot UI build is missing');
  try{const r=await fetch('http://127.0.0.1:8799/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok&&(await r.json()).app==='openmausbot')return;}catch{}
  const data=path.join(repo,'.data','openmaus');fs.mkdirSync(data,{recursive:true});const keyfile=path.join(repo,'.data','bridge-token');if(!fs.existsSync(keyfile))fs.writeFileSync(keyfile,crypto.randomBytes(32).toString('hex'),{flag:'wx'});
  const config=path.join(data,'config.json');if(!fs.existsSync(config))fs.writeFileSync(config,JSON.stringify({
    instances:{openaiCompat:{driver:'openai-compat',displayName:'Micky local models',access:'api'}},
    openaiCompat:{key:'local-only',url:process.env.BOPS_LOCAL_LLM_URL||'http://127.0.0.1:11434/v1',model:process.env.BOPS_LOCAL_MODEL||'qwen2.5:3b'},
    mcpServers:{'micky-windows':{command:process.env.MICKY_NODE||'node',args:[path.join(repo,'runtimes','openmaus','micky-mcp.cjs')],env:{MICKY_BRIDGE_TOKEN:fs.readFileSync(keyfile,'utf8').trim(),MICKY_BRIDGE_URL:'http://127.0.0.1:3000/api/bridge'},enabled:true}},
    features:{browser:true,showToolCalls:true},newBotDefaults:{profile:{modelSelection:{instanceId:'openaiCompat',model:process.env.BOPS_LOCAL_MODEL||'qwen2.5:3b'},computer:'browser',browser:true,composio:false,mcpServers:['micky-windows']}}
  },null,2));
  let selections={};try{selections=JSON.parse(fs.readFileSync(path.join(repo,'.data/model-selection.json'),'utf8'));}catch{}
  if(selections.worker){const value=JSON.parse(fs.readFileSync(config,'utf8'));value.openaiCompat={...value.openaiCompat,model:selections.worker};value.newBotDefaults={...value.newBotDefaults,profile:{...value.newBotDefaults?.profile,modelSelection:{instanceId:'openaiCompat',model:selections.worker}}};fs.writeFileSync(config,JSON.stringify(value,null,2));}
  const log=fs.createWriteStream(path.join(repo,'.logs','openmaus.native.log'),{flags:'a'});
  const child=spawn(process.env.MICKY_NODE||'node',['--experimental-strip-types',path.join(source,'server','index.ts')],{cwd:source,env:{...process.env,OMB_PORT:'8799',OMB_WEBHOOK_PORT:'8800',OMB_DATA_DIR:data,OMB_STATIC_DIR:dist,OMB_MICKY_EMBED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});services.push(child);child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('exit',()=>log.end());child.on('error',e=>console.error('OpenMausBot',e.message));
  for(let i=0;i<90;i++){if(child.exitCode!==null)throw Error('OpenMausBot exited during startup');try{const r=await fetch('http://127.0.0.1:8799/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('OpenMausBot did not become ready');
}
module.exports={startOpenMaus};
