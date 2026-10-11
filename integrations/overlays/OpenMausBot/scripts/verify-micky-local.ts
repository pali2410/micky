import { launchVerificationServer, runControlOmb } from './control-omb.ts';
const fixture=await launchVerificationServer();
const api=async(method:string,path:string,body?:unknown)=>{const r=await fetch(fixture.info.url+path,{method,headers:{'content-type':'application/json',origin:fixture.info.url},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json() as any;if(!r.ok)throw Error(JSON.stringify(value));return value;};
const control=(args:string[])=>runControlOmb([...args,'--url',fixture.info.url]) as Promise<any>;
try {
  await api('PATCH','/api/config',{openaiCompat:{key:'local-only',url:'http://127.0.0.1:11434/v1',model:'qwen2.5:3b'}});
  await api('POST','/api/instances/openaiCompat/refresh-models',{});
  const {bot}=await control(['new-bot','--name','Micky local fixture']);
  await control(['set-model','--bot',bot.id,'--instance','openaiCompat','--model','qwen2.5:3b']);
  await api('PATCH','/api/bots/'+bot.id,{computer:'browser',browser:true,toolScope:{allow:[]},description:'Local model verification',soul:'Follow the current request. Answer concisely. Answer greetings and simple questions directly; use tools only when the task needs them.'});
  await control(['send','--bot',bot.id,'--task',bot.activeTaskId,'--text','Reply with exactly: LOCAL_MODEL_READY']);
  const result=await control(['wait','--bot',bot.id,'--task',bot.activeTaskId,'--timeout','90']);
  const messages=await control(['messages','--bot',bot.id,'--task',bot.activeTaskId,'--limit','8']);
  if(result.status!=='settled'||!messages.messages?.some((m:any)=>m.role==='bot'&&m.text?.includes('LOCAL_MODEL_READY')))throw Error('Verified local reply missing: '+JSON.stringify({result,messages}));
  console.log(JSON.stringify({ok:true,status:result.status,model:'qwen2.5:3b',fixture:true,reply:messages}));
} finally { await fixture.close(); }
