import {launchVerificationServer,runControlOmb} from './control-omb.ts';
const fixture=await launchVerificationServer(process.env,undefined,undefined,{binaryPath:'E:/micky/.data/openmaus/tools/agent-browser/0.36.0-omb.1/agent-browser.exe',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const abort=new AbortController();
const api=async(method:string,path:string,body?:unknown)=>{const r=await fetch(fixture.info.url+path,{method,headers:{origin:fixture.info.url,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json() as any;if(!r.ok)throw Error(JSON.stringify(data));return data;};
try{
  await api('PATCH','/api/config',{features:{browser:true},newBotDefaults:{profile:{computer:'browser',browser:true}}});
  const {bot}=await runControlOmb(['new-bot','--name','Browser fixture','--url',fixture.info.url]) as any;
  const stream=await fetch(`${fixture.info.url}/api/bots/${bot.id}/browser/live`,{signal:abort.signal});
  if(!stream.ok)throw Error('Browser stream: '+stream.status+' '+await stream.text());
  const reader=stream.body!.getReader();const decoder=new TextDecoder();let text='';let viewerId='';
  const deadline=setTimeout(()=>abort.abort(),45_000);
  try{while(!viewerId){const part=await reader.read();if(part.done)throw Error('Browser stream ended');text+=decoder.decode(part.value,{stream:true});const match=/event: ready\r?\ndata: ([^\n]+)/.exec(text);if(match)viewerId=JSON.parse(match[1]).viewerId;}}finally{clearTimeout(deadline);}
  const action=async(body:unknown)=>api('POST',`/api/bots/${bot.id}/browser/action`,{viewerId,...body as object});
  await action({type:'take'});
  await action({type:'navigate',url:fixture.info.url+'/api/health'});
  await action({type:'tab-close',tabId:'t999'});
  await action({type:'release'});
  await action({type:'restart'});
  console.log('PASS: isolated Windows browser opens a live stream, navigates, handles an already-closed tab and releases control.');
}finally{abort.abort();await fixture.close();}
