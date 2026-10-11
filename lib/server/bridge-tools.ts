import 'server-only';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getState } from './store';
import {rakazoRpc,rakazoAgents} from './agent-workspaces';
import {nativeDesktop,isNativeSnapshot} from './native-desktop';
import {checkApproval,finishApproval} from './tool-policy';

export function bridgeToken() { const dir=join(process.cwd(),'.data');const file=join(dir,'bridge-token');mkdirSync(dir,{recursive:true});if(!existsSync(file))writeFileSync(file,randomBytes(32).toString('hex'),{flag:'wx'});return readFileSync(file,'utf8').trim(); }
const spec:Record<string,{description:string;fields:Record<string,any>;required?:string[];method?:string}>={
  windows:{description:'List current real Windows application windows.',fields:{},method:'GET'},
  applications:{description:'Discover installed Windows applications.',fields:{},method:'GET'},
  desktop:{description:'Observe real desktop metadata.',fields:{},method:'GET'},
  inspect:{description:'Inspect a window and return its controls and snapshot. Use actual handles from windows.',fields:{handle:{type:'integer'}},required:['handle']},
  control:{description:'Operate a control from a current inspect snapshot. Verify results before claiming success.',fields:{handle:{type:'integer'},snapshot:{type:'string'},control:{type:'string'},action:{type:'string',enum:['click','type','select']},text:{type:'string'}},required:['handle','snapshot','control','action']},
  open:{description:'Open a Windows app, exact file path or URL requested by the user.',fields:{path:{type:'string'}},required:['path']},
  files:{description:'Inspect actual files and image counts under a path.',fields:{path:{type:'string'},screenshots:{type:'boolean'},recursive:{type:'boolean'}}},
  shell:{description:'Execute a PowerShell script body on Windows. Quote paths and text. Inspect output; never invent completion.',fields:{cmd:{type:'string'}},required:['cmd']},
  web:{description:'Fetch and read a public website.',fields:{url:{type:'string'}},required:['url']},
  spreadsheet:{description:'Create and verify an Excel workbook.',fields:{path:{type:'string'},headers:{type:'array',items:{type:'string'}},rows:{type:'array',items:{type:'array',items:{}}}},required:['path','headers','rows']},
  chrome:{description:'Open a URL in a specified actual Chrome profile.',fields:{url:{type:'string'},email:{type:'string'},profile:{type:'string'}},required:['url']},
  whatsapp:{description:'Find a confirmed WhatsApp recipient, compose requested text and optionally send with verification. Preserve exact recipient and text. Reuse request_id only when retrying the identical operation.',fields:{recipient:{type:'string'},text:{type:'string'},send:{type:'boolean'},read:{type:'boolean'},email:{type:'string'},request_id:{type:'string'}},required:['recipient','request_id']},
  micky_status:{description:'Read Micky bots and task status across the shared application.',fields:{},method:'GET'},
  rakazo_status:{description:'Read actual local Rakazo teammates and model connection.',fields:{}},
  rakazo_message:{description:'Queue a task for an actual Rakazo bot from rakazo_status. Preserve request_id for identical retries. Queued is not completed.',fields:{botId:{type:'string'},text:{type:'string'},request_id:{type:'string'}},required:['botId','text','request_id']},
  rakazo_thread:{description:'Read actual Rakazo bot conversation and results.',fields:{botId:{type:'string'}},required:['botId']}
};
export const bridgeTools=Object.entries(spec).map(([name,s])=>({name,description:s.description,inputSchema:{type:'object',properties:s.fields,required:s.required??[],additionalProperties:false}}));
const runtime=globalThis as any;
async function executeToolNow(name:string,args:Record<string,unknown>) {
  const tool=spec[name];if(!tool)throw Error('Unknown bridge tool');
  if(!args||typeof args!=='object'||Object.keys(args).some(k=>!(k in tool.fields))||(tool.required??[]).some(k=>!(k in args)))throw Error('Invalid tool arguments');
  if(name==='rakazo_status')return rakazoAgents();
  if(name==='rakazo_thread')return rakazoRpc('threads.get',{botId:args.botId});
  if(name==='rakazo_message')return {queued:true,result:await rakazoRpc('threads.send',{botId:args.botId,text:args.text,clientNonce:args.request_id})};
  if(name==='micky_status') { const state=getState();return {bots:state.bots.map(b=>({id:b.id,name:b.name,role:b.role})),tasks:state.sessions.slice(-30).map(s=>({id:s.id,title:s.title,status:s.status,activity:s.activity,answer:s.answer}))}; }
  const run=async()=>{if(name==="control"&&isNativeSnapshot(args.snapshot))return nativeDesktop(name,args,new AbortController().signal);if(name==="inspect"&&process.env.MICKY_NATIVE_DESKTOP!=="0"){try{return await nativeDesktop(name,args,new AbortController().signal);}catch{}}const response=await fetch((process.env.BOPS_HARNESS_URL??'http://127.0.0.1:8768')+'/'+name,{method:tool.method??'POST',headers:{'Content-Type':'application/json'},...(tool.method==='GET'?{}:{body:JSON.stringify(args)}),signal:AbortSignal.timeout(45000)});const value=await response.json();if(!response.ok)throw Error(JSON.stringify(value));return value;};
  if(!['control','open','inspect','chrome','whatsapp'].includes(name))return run();
  const result=(runtime.mickyDesktopQueue??Promise.resolve()).catch(()=>{}).then(run);runtime.mickyDesktopQueue=result.catch(()=>{});return result;
}

export async function executeBridgeTool(name:string,args:Record<string,unknown>,taskId?:string){
  const tool=spec[name];if(!tool)throw Error("Unknown bridge tool");
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!(k in tool.fields))||(tool.required??[]).some(k=>!(k in args)))throw Error('Invalid tool arguments');
  for(const [key,value] of Object.entries(args)){const rule=tool.fields[key];if(rule.type==='integer'&&!Number.isSafeInteger(value)||rule.type==='string'&&typeof value!=='string'||rule.type==='boolean'&&typeof value!=='boolean'||rule.type==='array'&&!Array.isArray(value)||rule.enum&&!rule.enum.includes(value))throw Error(`Invalid ${key}`);}

  const approval=checkApproval(name,args,taskId);if(approval?.cached)return approval.approval.result;
  try{const result=await executeToolNow(name,args);if(approval)finishApproval(approval,result);return result;}catch(e){if(approval)finishApproval(approval,{error:(e as Error).message},true);throw e;}
}
