const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {configure}=require('./local-workspace-config.cjs');
let starting;
function ensureRakazo(repo,services){
  if(starting)return starting;
  starting=startRakazo(repo,services).finally(()=>{starting=undefined;});
  return starting;
}
async function startRakazo(repo,services) {
  const ready=async()=>{try{return(await fetch('http://127.0.0.1:3100/ready',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}};
  if(await ready())return;
  await configure(repo);
  if(!fs.existsSync(path.join(repo,'Rakazo/apps/web/dist/index.html')))throw Error('Rakazo has not been built');
  const node=path.join(repo,'runtimes/node24/node-v24.21.0-win-x64/node.exe');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync(path.join(repo,'.logs'),{recursive:true});const log=fs.createWriteStream(path.join(repo,'.logs/rakazo.native.log'),{flags:'a'});
  const child=spawn(node,[path.join(repo,'runtimes/rakazo-host.mjs')],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('exit',()=>log.end());
  services.push({kill(){if(child.connected)child.send({type:'stop'});else child.kill();}});
  let failure;child.once('error',error=>{failure=error;});
  for(let i=0;i<480;i++){if(failure)throw failure;if(child.exitCode!==null)throw Error('Rakazo could not start; see its native log');if(await ready())return;await new Promise(resolve=>setTimeout(resolve,500));}
  if(child.connected)child.send({type:'stop'});else child.kill();
  throw Error('Rakazo did not become ready');
}
module.exports={ensureRakazo};
