const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const exportsForTest={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/system-graph.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsForTest);
const state={bots:[{id:'b',name:'Worker'}],sessions:[{id:'t',botId:'b',title:'Fixture',status:'running',createdAt:1,activity:'Reading file'}]};
const graph=exportsForTest.buildSystemGraph(state,[{name:'local:3b'}],[{name:'local:3b'}],{ready:true,bots:[{id:'omb',name:'Upstream',busy:true}]},{execution:'local:3b'});
assert.equal(graph.counts.running,1);assert.equal(graph.counts.bots,2);assert.equal(graph.nodes.find(n=>n.id==='micky:bot:b').status,'active');assert.ok(graph.links.find(e=>e.target==='model:local:3b').active);assert.equal(graph.events[0].text,'Fixture · Reading file');
const offline=exportsForTest.buildSystemGraph({...state,sessions:[]},[],[],{ready:false,error:'offline',bots:[]},{});assert.equal(offline.nodes.find(n=>n.id==='openmaus').status,'offline');assert.ok(offline.links.every(e=>!e.active));assert.equal(offline.counts.models,0);
console.log('PASS: graph reflects real running tasks, configured model routes and unavailable services.');
const workspaces=exportsForTest.buildSystemGraph({bots:[],sessions:[]},[],[],{ready:false,bots:[]},{},[{id:'rakazo',label:'Rakazo',ready:true,modelConnected:true,agents:[{id:'r',name:'Teammate',status:'running'}],modules:['Memory']},{id:'bigfoot',label:'Bigfoot',ready:false,agents:[{id:'m',status:'running'}],modules:['Mailboxes']}]);
assert.equal(workspaces.counts.running,1);
assert.equal(workspaces.nodes.find(n=>n.id==='bigfoot').status,'offline');
assert.equal(workspaces.links.find(l=>l.target==='bigfoot').active,false);
assert.equal(workspaces.links.find(l=>l.target==='rakazo').active,true);
console.log('PASS: workspace activity requires a live runtime; disconnected systems never show active links.');

