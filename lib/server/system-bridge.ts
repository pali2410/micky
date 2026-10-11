import {selectedModel} from './model-selection';
import 'server-only';
import { getState } from './store';
import { buildSystemGraph } from '@/lib/system-graph';
import { bridgeToken } from './bridge-tools';
import {rakazoAgents} from './agent-workspaces';

const reads=new Map<string,{until:number;value:Promise<any>}>();
async function read(url: string,ttl=1000) {
  const cached=reads.get(url);if(cached&&cached.until>Date.now())return cached.value;
  const value=readNow(url);reads.set(url,{until:Date.now()+ttl,value});
  try{return await value;}catch(error){reads.delete(url);throw error;}
}
async function readNow(url: string) {
  const response = await fetch(url,{signal:AbortSignal.timeout(2500),cache:'no-store'});
  if(!response.ok) throw new Error('Service returned '+response.status);
  return response.json();
}
export async function systemSnapshot() {
  const modelBase = (process.env.BOPS_LOCAL_LLM_URL??'http://127.0.0.1:11434/v1').replace(/\/v1\/?$/,'');
  const [tags,ps,omb,rakazo,teammates,native] = await Promise.allSettled([read(modelBase+'/api/tags',60000),read(modelBase+'/api/ps'),read('http://127.0.0.1:8799/api/bots?messages=0'),read('http://127.0.0.1:3100/ready'),rakazoAgents(),fetch('http://127.0.0.1:8769/status',{headers:{authorization:'Bearer '+bridgeToken()},signal:AbortSignal.timeout(2500),cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Native services unavailable');return r.json();})]);
  const ombBots=omb.status==='fulfilled' ? (Array.isArray(omb.value)?omb.value:omb.value.bots??[]) : [];
  const upstream = omb.status==='fulfilled' ? {ready:true,bots:ombBots,active:ombBots.some((b:any)=>b.busy)} : {ready:false,bots:[],error:'OpenMausBot service is unavailable'};
  let installed = tags.status==='fulfilled' ? tags.value.models??[] : [];
  if(tags.status==='rejected'){try{const compat=await read(modelBase+'/v1/models');installed=(compat.data??[]).map((m:any)=>({name:m.id}));}catch{}}
  const loaded = ps.status==='fulfilled' ? ps.value.models??[] : [];
  const configured = {chat:selectedModel('chat'),execution:selectedModel('worker'),reasoning:selectedModel('reasoning'),vision:selectedModel('vision')};
  const nativeStatus=native.status==='fulfilled'?native.value:null;
  const workspaces=[{id:'rakazo',label:'Rakazo',ready:rakazo.status==='fulfilled'&&rakazo.value.ok===true,agents:teammates.status==='fulfilled'?teammates.value.agents:[],modelConnected:teammates.status==='fulfilled'&&teammates.value.modelConnected,modules:['Persistent teammates','Native host commands','Micky Windows tools','Routines','Worker queue','PostgreSQL memory'],error:rakazo.status==='rejected'?'Runtime is not running':undefined},{id:'bigfoot',label:'Bigfoot desktop',ready:nativeStatus?.nativeApplications?.bigfoot?.running===true,modelConnected:nativeStatus?.nativeApplications?.bigfoot?.modelConnected===true,modules:['Windows UI Automation','Exact window targeting','Verified typing','Local Whisper','Emergency stop'],error:nativeStatus?.error||(!nativeStatus?'Native service unavailable':undefined)},{id:'heyjev',label:'HeyJev · Windows local voice',ready:nativeStatus?.nativeApplications?.heyjev?.running===true,modelConnected:nativeStatus?.nativeApplications?.heyjev?.modelConnected===true,modules:['Hey Jev wake phrase','Local transcription','Voice task pipeline','Local dictation','Windows speech','Personal dictionary'],error:nativeStatus?.speechAvailable?undefined:'Local speech runtime unavailable'}];
  return buildSystemGraph(getState(),installed,loaded,upstream,configured,workspaces);
}

