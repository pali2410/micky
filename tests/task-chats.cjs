const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file, imports) {
  const out = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',code)(name => { assert.ok(name in imports, name); return imports[name]; },out);
  return out;
}
const types = load('lib/types.ts', {});
const helpers = load('lib/task-chats.ts', {'./types':types});
const state = {
  bots:[
    {id:'micky',isMain:true}, {id:'personal',name:'Personal'},
    {id:'legacy',name:'Task 2: old'}, {id:'nested',parentChatId:'chat:legacy'},
    {id:'other',workspaceId:'other'}, {id:'other-worker',workspaceId:'other',parentChatId:'chat:other'},
    {id:'bad-link',workspaceId:'other',parentChatId:'chat:micky'},
    {id:'cycle-a',parentChatId:'chat:cycle-b'}, {id:'cycle-b',parentChatId:'chat:cycle-a'},
  ],
  chats:[], messages:[{id:'history',chatId:'chat:legacy',text:'Preserved'}],
  sessions:[
    {id:'old',botId:'legacy',chatId:'chat:legacy',reportChatId:'chat:micky',status:'done'},
    {id:'followup',botId:'nested',chatId:'chat:nested',reportChatId:'chat:legacy',status:'running'},
    {id:'other',botId:'other-worker',chatId:'chat:other-worker',status:'queued'},
  ],
};
state.chats = state.bots.map(b => ({id:types.botChatId(b.id),workspaceId:b.workspaceId}));
const original = JSON.stringify(state);
assert.equal(helpers.rootTaskChat(state, 'chat:nested'), 'chat:micky');
assert.deepEqual(helpers.tasksInChat(state, 'chat:micky').map(s => s.id), ['old','followup']);
assert.deepEqual(helpers.tasksInChat(state, 'chat:personal'), []);
assert.equal(helpers.isTaskBot(state,state.bots[2]), true, 'Existing workers leave sidebar');
assert.equal(helpers.isTaskBot(state,state.bots[1]), false, 'Explicit independent bots remain');
assert.equal(helpers.isTaskBot(state,state.bots[6]), false, 'Ownership cannot cross workspaces');
assert.equal(helpers.isTaskBot(state,state.bots[7]), false, 'Cycles remain accessible');
assert.equal(helpers.rootTaskChat(state,'chat:missing'),'chat:missing');
assert.equal(JSON.stringify(state),original,'Grouping never deletes or rewrites stored history');
const created = [], started = [];
const team = load('lib/server/task-team.ts', {
  'server-only':{}, '@/lib/task-chats':helpers, '@/lib/brain':{applicationFor:()=>undefined},
  './task-planner':{planTaskGraph:async()=>['Open Explorer','Open Calculator'].map(goal=>({goal,dependencies:[]}))},'@/lib/task-intent':{splitRequests:()=>['Open Explorer','Open Calculator']},
  './store':{getState:()=>state,addMessage:msg=>state.messages.push(msg),update:fn=>fn(state)},
  './bots':{createBot:async(name,role,workspaceId,parentChatId)=>{
    const botId='new-'+created.length;
    const b={id:botId,name,role,workspaceId,parentChatId};created.push(b);state.bots.push(b);
    state.chats.push({id:types.botChatId(botId),workspaceId});
    return {botId,chatId:types.botChatId(botId)};
  }},
  './sessions':{startSession:opts=>{const task={...opts,id:'fixture-'+started.length,status:'queued'};started.push(task);state.sessions.push(task);return task;}},
});
(async()=>{
  await team.startTaskTeam('nested','chat:nested','Two distinct tasks');
  assert.equal(created.length,2);
  assert.ok(created.every(b=>b.parentChatId==='chat:micky'));
  assert.ok(started.every(s=>s.reportChatId==='chat:micky'));
  assert.ok(created.every(b=>helpers.isTaskBot(state,b)));
  started.forEach(s=>s.status='done');
  await team.startTaskTeam('micky','chat:micky','Two distinct tasks');
  assert.equal(created.length,2,'Idle workers are reused');
  console.log('PASS: existing and new workers nest in their owning chat; history, workspace isolation and independent bots are preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
