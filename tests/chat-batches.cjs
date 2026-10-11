const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const state = { bots: [{id:'micky',name:'Micky',isMain:true}], chats:[{id:'chat:micky',kind:'bot',botIds:['micky'],typing:[]}], messages:[], sessions:[] };
const added = [];
const starts = [];
const fixture = ['Open Explorer','Open YouTube','Open Explorer'].map((goal,i)=>({type:'function_call',name:'start_task',id:String(i),arguments:JSON.stringify({goal,title:goal,say:"I'll do that now."})}));
const store = {
 getState:()=>state, bot:id=>state.bots.find(b=>b.id===id), chat:()=>state.chats[0], ownerName:()=> 'owner', ownerLine:()=>'', setTyping:()=>{}, stateEpoch:()=>1,
 addMessage:m=> {const msg={...m,id:`m${added.length}`,at:Date.now()};added.push(msg);state.messages.push(msg);return msg;}
};
const modules = {'./model-selection':{selectedModel:()=> 'fixture-model'}, '@/lib/brain':{memoryContext:()=>''},
 '@/lib/task-intent':{isComputerRequest:()=>false,clarificationFor:()=>undefined},
 'server-only':{}, '@/lib/types':{botChatId:id=>`chat:${id}`,workspaceOf:()=> 'main',live:()=>false}, './store':store,
 './openai-client':{openaiClient:()=>({responses:{create:async()=>({output:fixture})}})}, './bots':{contactLine:()=>''}, './style':{},
 './routines':{routinesNote:()=>''}, './attention':{}, './uploads':{},
 './task-routing':{resolveTaskRequest:(_chat,text)=>text}, './task-team':{startTaskTeam:async(botId,chatId,goal)=>{const sess={botId,chatId,goal,id:`s${starts.length}`};starts.push(sess);state.sessions.push(sess);return [sess];}},
 './sessions':{startSession:opts=> {const sess={...opts,id:`s${starts.length}`};starts.push(sess);state.sessions.push(sess);return sess;}}
};
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/server/chat.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
new Function('require','exports','module',code)(name=>{assert.ok(name in modules, name);return modules[name];},exportsObject,{exports:exportsObject});
(async()=>{
 await exportsObject.handleMessage('chat:micky','Please do these two tasks for me');
 assert.equal(starts.length,2,'Every distinct task should start once');
 const replies=added.filter(m=>m.role==='bot');
 assert.equal(replies.length,1,'Task batch should have one acknowledgement');
 assert.equal(replies[0].sessionIds.length,2);
 console.log('PASS: multiple task calls start once each; duplicate goals are removed; one acknowledgement carries both sessions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
