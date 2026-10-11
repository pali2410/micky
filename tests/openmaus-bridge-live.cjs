const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict'),readline=require('node:readline');
(async()=>{
  const unauthorized=await fetch('http://127.0.0.1:3000/api/bridge');assert.equal(unauthorized.status,401);
  const child=spawn(process.execPath,['runtimes/openmaus/micky-mcp.cjs'],{cwd:process.cwd(),env:{...process.env,MICKY_BRIDGE_TOKEN:fs.readFileSync('.data/bridge-token','utf8').trim()},stdio:['pipe','pipe','pipe'],windowsHide:true});
  const waiting=new Map();let stderr='';child.stderr.on('data',d=>stderr+=d);readline.createInterface({input:child.stdout}).on('line',line=>{const message=JSON.parse(line);waiting.get(message.id)?.(message);});let id=0;
  const request=(method,params)=>new Promise((resolve,reject)=>{const number=++id;const timer=setTimeout(()=>reject(Error('MCP timeout '+stderr)),15000);waiting.set(number,result=>{clearTimeout(timer);waiting.delete(number);result.error?reject(Error(JSON.stringify(result.error))):resolve(result.result);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:number,method,params})+'\n');});
  try { await request('initialize',{});const catalog=await request('tools/list',{});assert.ok(catalog.tools.some(t=>t.name==='windows'));const answer=await request('tools/call',{name:'windows',arguments:{}});assert.ok(!answer.isError);const observed=JSON.parse(answer.content[0].text);assert.ok(observed.windows?.length>0);const status=await request('tools/call',{name:'micky_status',arguments:{}});assert.ok(JSON.parse(status.content[0].text).bots.length>0);console.log('PASS: protected MCP bridge discovers Windows tools, reads actual windows and shares Micky task status.'); }
  finally {child.stdin.end();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
