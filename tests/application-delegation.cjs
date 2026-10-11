const fs=require('node:fs'),ts=require('typescript'),http=require('node:http'),assert=require('node:assert/strict');
const transcript=[];let polls=0;
const server=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};transcript.push({path:req.url,body});res.setHeader('Content-Type','application/json');let value;
if(req.url==='/api/bots?messages=0')value={bots:[{id:'fixture-maus',name:'Fixture'}]};
else if(req.url.endsWith('/tasks'))value={task:{threadId:'fixture-thread'}};
else if(req.url.endsWith('/messages'))value={accepted:true};
else if(req.url.includes('/requests/'))value={phase:'settled',messages:[{role:'bot',turnTerminal:true,text:'Fixture report'}]};
else if(req.url==='/fixture-rakazo/threads.get'){polls++;value={messages:polls===1?[]:[{id:'answer',role:'bot',blocks:[{kind:'text',text:'Rakazo fixture report'}]}],run:{status:polls<3?'running':'completed'}};}
else value={ok:true};res.end(JSON.stringify(value));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,original=global.fetch;global.fetch=(url,opts)=>original(base+new URL(url).pathname+new URL(url).search,opts);
const exports={};const code=ts.transpileModule(fs.readFileSync('lib/server/application-task.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>name==='server-only'?{}:name==='./bridge-tools'?{bridgeToken:()=> 'fixture-token'}:name==='./application-agents'?{ensureApplicationChief:async app=>'fixture-'+app}:name==='./agent-workspaces'?{rakazoAgents:async()=>({agents:[{id:'fixture-rakazo'}]}),rakazoRpc:async(method,input)=>{const r=await original(base+'/fixture-rakazo/'+method,{method:'POST',body:JSON.stringify(input)});return r.json();}}:{},exports);
try{const make=(id,applicationId)=>({id,applicationId,goal:'Read fixture content',title:'Fixture'});const result=await exports.delegateApplication(make('maus_fixture_0001','maus'),new AbortController().signal,()=>{});assert.equal(result.answer,'Fixture report');assert.equal(result.verified,false);assert.ok(transcript.some(t=>t.path.includes('/messages')&&t.body.threadId==='fixture-thread'&&t.body.sendId==='maus_fixture_0001'));
const started=Date.now();const rakazo=await exports.delegateApplication(make('rakazo_task','rakazo'),new AbortController().signal,()=>{});assert.equal(rakazo.answer,'Rakazo fixture report');assert.ok(Date.now()-started>=1900,'Intermediate assistant output cannot finish a running assignment');assert.equal(rakazo.verified,false);
console.log('PASS: isolated adapter fixture pins Maus task/send ids, waits for Rakazo terminal state, decodes actual text blocks and keeps claims unverified.');
}finally{global.fetch=original;await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
