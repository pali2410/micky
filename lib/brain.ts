import type {AppState,Session} from './types';
export const applications=['maus','rakazo'] as const;
export type ApplicationId=typeof applications[number];
export type BrainEvent={id:string;at:number;type:string;summary:string;taskId?:string;agentId?:string;applicationId?:ApplicationId};
export type MemoryEntry={id:string;at:number;scope:'user'|'task'|'application'|'agent';scopeId?:string;text:string;source:string;verified:boolean};
export type ApplicationRecord={id:ApplicationId;name:string;autoStart:boolean;status:'offline'|'starting'|'ready'|'degraded';error?:string;updatedAt:number};
export type AgentRecord={id:string;externalId?:string;parentId:string;applicationId?:ApplicationId;role:string;capabilities:string[];status:'idle'|'working'|'retired';taskId?:string};
export type ApprovalRequest={id:string;key:string;tool:string;args:Record<string,unknown>;at:number;status:'pending'|'approved'|'running'|'completed'|'failed'|'denied';result?:unknown;taskId?:string};
export type BrainState={schema:1;deployment:'single-user';memoryEnabled:boolean;retentionDays:number;maxConcurrent:number;applications:ApplicationRecord[];agents:AgentRecord[];events:BrainEvent[];memory:MemoryEntry[];approvals?:ApprovalRequest[]};
export function newBrain():BrainState{return {schema:1,deployment:'single-user',memoryEnabled:true,retentionDays:90,maxConcurrent:3,applications:applications.map(id=>({id,name:{maus:'Maus',rakazo:'Rakazo'}[id],autoStart:true,status:'offline',updatedAt:Date.now()})),agents:applications.map(id=>({id:`chief:${id}`,parentId:'micky',applicationId:id,role:`${id} application chief`,capabilities:capabilities(id),status:'idle'})),events:[],memory:[]};}
export function capabilities(id?:ApplicationId){return id==='rakazo'?['routines','teammates','research']:id==='maus'?['browser','research','android']:['desktop','browser','files','research'];}
export function applicationFor(goal:string):ApplicationId|undefined{const match=/\b(maus|rakazo)\b/i.exec(goal);return match?.[1]?.toLowerCase() as ApplicationId|undefined;}
export function taskState(task:Session){return task.waitingOnYou?'blocked':task.status==='done'?'completed':task.error==='Paused'?'paused':task.error==='Cancelled'?'cancelled':task.status;}
export function redactEvidence(text:string){return text.replace(/((?:api[_ -]?key|password|secret|access[_ -]?token|authorization)\s*["']?\s*[:=]\s*["']?)[^\s"',;}{]+/gi,'$1[redacted]').replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}/gi,'Bearer [redacted]').replace(/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/g,'$1[redacted]@');}
export function reconcileBrain(state:AppState,prior:Map<string,string>){const brain=state.brain??=newBrain();const now=Date.now();
 // Retire removed engines without replaying their work or deleting historical chat text.
 brain.applications=brain.applications.filter(a=>applications.includes(a.id));
 brain.agents=brain.agents.filter(a=>(a.applicationId as string)!=='munder'&&!a.id.startsWith('munder:')&&a.id!=='chief:munder');
 for(const collection of [state.bots,state.sessions])for(const item of collection){if((item.applicationId as string)==='munder'){delete item.applicationId;if('goal' in item&&['queued','starting','running','paused'].includes(item.status)){item.status='failed';item.error='The assigned application was removed; this task was not replayed.';}}}
 for(const a of applications){if(!brain.applications.some(x=>x.id===a))brain.applications.push(newBrain().applications.find(x=>x.id===a)!);}

 for(const task of state.sessions){const key=JSON.stringify([taskState(task),task.activity,task.answer,task.error]);const previous=prior.get(task.id);prior.set(task.id,key);if(previous===key)continue;
  const applicationId=task.applicationId;const status=taskState(task);const summary=task.activity??task.answer??task.error??task.title;
  brain.events.push({id:`event:${task.id}:${now}:${brain.events.length}`,at:now,type:previous?status:'registered',summary:redactEvidence(summary.slice(0,1200)),taskId:task.id,agentId:task.botId,applicationId});
  if(brain.memoryEnabled&&status==='completed'&&!brain.memory.some(m=>m.source===task.id)){brain.memory.push({id:`memory:${task.id}`,at:now,scope:'task',scopeId:applicationId,text:redactEvidence(`${task.goal.slice(0,1000)}\nResult: ${(task.answer??'').slice(0,3000)}`),source:task.id,verified:task.verification?.status==='verified'});}
 }
 const active=new Map(state.sessions.filter(s=>['queued','starting','running','paused'].includes(s.status)).map(s=>[s.botId,s]));
 for(const bot of state.bots){if(bot.isMain)continue;let agent=brain.agents.find(a=>a.id===bot.id);if(!agent){agent={id:bot.id,parentId:bot.applicationId?`chief:${bot.applicationId}`:'micky',applicationId:bot.applicationId,role:bot.role,capabilities:capabilities(bot.applicationId),status:'idle'};brain.agents.push(agent);}const task=active.get(bot.id);agent.status=task?'working':'idle';agent.taskId=task?.id;}
 for(const chief of brain.agents.filter(a=>a.id.startsWith('chief:'))){chief.status=state.sessions.some(s=>s.applicationId===chief.applicationId&&['queued','starting','running','paused'].includes(s.status))||brain.agents.some(a=>a.parentId===chief.id&&a.status==='working')?'working':'idle';}
 const cutoff=now-brain.retentionDays*86400000;brain.events=brain.events.filter(e=>e.at>=cutoff).slice(-3000);brain.memory=brain.memory.filter(m=>m.at>=cutoff).slice(-2000);
}
export function memoryContext(state:AppState,query:string,applicationId?:ApplicationId){if(!state.brain?.memoryEnabled)return '';const words=query.toLowerCase().split(/\W+/).filter(w=>w.length>3);return state.brain.memory.filter(m=>m.scope==='user'||!m.scopeId||m.scopeId===applicationId).map(m=>({m,score:words.filter(w=>m.text.toLowerCase().includes(w)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||b.m.at-a.m.at).slice(0,4).map(({m})=>`[${m.verified?'verified':'unverified'}; ${m.source}] ${m.text}`).join('\n').slice(0,6000);}
