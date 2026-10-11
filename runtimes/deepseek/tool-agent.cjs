const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {HarnessClient}=require('./client.cjs');

// A task-local rendezvous: DeepSeek owns the tool loop; Micky retains its native
// execution, evidence checks, cancellation and cross-task desktop coordination.
class ToolAgent {
 constructor({tools,model,prompt,signal}) {
  this.tools=tools;this.model=model;this.prompt=prompt;this.signal=signal;
  this.queue=[];this.closed=false;this.token=randomUUID();this.active=undefined;
  const shell=this.tools.find(t=>t.name==='shell');
  if(shell)shell.description='Run a PowerShell script body directly on Windows. Do NOT wrap it in powershell -Command. Quote paths and all string values, especially multi-word text. Use Set-Content -LiteralPath PATH -Value TEXT to write a text file, and Get-Content -LiteralPath PATH to verify it. Only change files requested by the user.';
 }
 async start() {
  this.server=http.createServer(async(req,res)=>{
   if(req.headers.authorization!=='Bearer '+this.token){res.writeHead(403).end();return;}
   try {
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>131072)throw Error('Tool arguments too large');}
    const body=JSON.parse(raw||'{}');
    if(req.url==='/list'){res.end(JSON.stringify({tools:this.tools}));return;}
    if(req.url!=='/call')throw Error('Unknown route');
    if(this.closed)throw Error('Task stopped');
    const tool=this.tools.find(t=>t.name===body.name);if(!tool)throw Error('Unknown task tool');
    const result=await new Promise((resolve,reject)=>{
     const call={action:body.name,args:body.arguments||{},resolve,reject};
     if(this.waiter){const waiter=this.waiter;this.waiter=undefined;this.active=call;waiter.resolve(call);}
     else this.queue.push(call);
    });
    res.end(JSON.stringify({content:[{type:'text',text:JSON.stringify(result)}]}));
   }catch(error){if(!res.destroyed)res.end(JSON.stringify({isError:true,content:[{type:'text',text:error.message}]}));}
  });
  await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});
  this.client=new HarnessClient({model:this.model,execution:true,toolBridge:`http://127.0.0.1:${this.server.address().port}`,toolToken:this.token});
  this.running=this.drive();
 }
 async drive(){
  const sessionId='micky-task-'+randomUUID();
  try{
   for(let attempt=0;attempt<3&&!this.closed;attempt++){
    const prompt=attempt===0?this.prompt:`The task is not verified complete. Continue this same task from the actual tool results. Do not repeat successful changes. Correct a failed command, or call ask if essential user information is missing. Call finish only after verifying the requested result. Use a tool now. Latest observation: ${JSON.stringify(this.lastObservation?.result).slice(0,3000)}`;
    const result=await this.client.run(prompt+(this.model==='micky-tools-qwen3'?'\n/no_think':''),this.signal,sessionId);
    if(this.closed)return;
    this.client.log.write(JSON.stringify({event:'unverified-stop',attempt,text:result.text})+'\n');
   }
   if(!this.closed)this.fail(Error('The agent stopped without a verified finish tool.'));
  }catch(error){if(!this.closed)this.fail(error);}
 }
 fail(error){this.error=error;this.waiter?.reject(error);this.waiter=undefined;}
 async next(observation) {
  this.signal.throwIfAborted();if(this.closed)throw Error('Task stopped');
  this.lastObservation=observation;
  if(this.active){this.active.resolve(observation);this.active=undefined;}
  if(this.error)throw this.error;
  if(this.queue.length){this.active=this.queue.shift();return this.active;}
  const pending=new Promise((resolve,reject)=>{this.waiter={resolve,reject};});
  pending.catch(()=>{});
  if(!this.client)try { await this.start(); } catch(error) { this.fail(error); }
  return pending;
 }
 async close(){
  if(this.closed)return;this.closed=true;
  this.active?.resolve({status:'Task ended. Do not perform additional actions.'});
  for(const call of this.queue)call.reject(Error('Task stopped'));this.queue=[];
  this.fail(Error('Task stopped'));
  await this.client?.close();
  this.server?.closeAllConnections();this.server?.close();
 }
}
module.exports={ToolAgent};
