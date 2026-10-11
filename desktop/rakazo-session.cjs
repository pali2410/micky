const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function rakazoSession(repo,base='http://127.0.0.1:3100',data=path.join(repo,'.data/rakazo')) {
  if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Rakazo must be local');
  fs.mkdirSync(data,{recursive:true});
  const file=path.join(data,'local-identity.json');
  const identity=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{email:'micky@localhost.invalid',password:crypto.randomBytes(32).toString('hex'),name:'You'};
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(identity),{flag:'wx'});
  const origin=base.replace(':3100',':5173').replace(':3111',':5174');
  const sessionFile=path.join(data,'local-session.json');
  if(fs.existsSync(sessionFile)){
    const saved=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
    try{await rpc(base,saved.cookie,'me');return {cookie:saved.cookie,cookies:saved.cookie.split('; '),origin};}catch{}
  }
  const auth=async(route)=>{const response=await fetch(base+'/api/auth/'+route,{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(identity),signal:AbortSignal.timeout(15000)});return {response,cookies:response.headers.getSetCookie()};};
  let result=await auth('sign-in/email');
  if([400,401,404].includes(result.response.status))result=await auth('sign-up/email');
  if(!result.response.ok)throw Error('Local Rakazo sign-in failed ('+result.response.status+')');
  const cookies=result.cookies.map(cookie=>cookie.split(';')[0]);
  if(!cookies.length)throw Error('Rakazo did not return a local session');
  fs.writeFileSync(path.join(data,'local-session.json'),JSON.stringify({cookie:cookies.join('; ')}));
  return {cookie:cookies.join('; '),cookies,origin};
}
async function rpc(base,cookie,method,input={}) {
  const response=await fetch(base+'/rpc/'+method.replaceAll('.','/'),{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({json:input}),signal:AbortSignal.timeout(15000)});
  const value=await response.json();if(!response.ok)throw Error(value.message || value.json?.message || 'Rakazo request failed ('+response.status+')');return value.json;
}
module.exports={rakazoSession,rpc};
async function connectWindows(repo,login) {
  const base='http://127.0.0.1:3100';
  const servers=await rpc(base,login.cookie,'mcp.servers.list');
  let server=servers.find(server=>server.slug==='micky-windows');
  if(!server)server=await rpc(base,login.cookie,'mcp.servers.create',{slug:'micky-windows',name:'Micky Windows',description:'Shared Windows tools and agent workspaces',transport:'stdio',command:path.join(repo,'runtimes/node24/node-v24.21.0-win-x64/node.exe'),args:[path.join(repo,'runtimes/openmaus/micky-mcp.cjs')],env:{MICKY_COMPACT_TOOLS:'1',MICKY_BRIDGE_TOKEN:fs.readFileSync(path.join(repo,'.data/bridge-token'),'utf8').trim()},enabled:true});
  let bots=await rpc(base,login.cookie,'bots.list');
  if(!bots.length)bots=[await rpc(base,login.cookie,'bots.create',{name:'Micky',title:'Local teammate',spawnKey:'micky-local-first',instructions:'Answer normal chat directly. For Windows actions use the Micky Windows MCP tools. Keep recipients, search terms and message text separate. Inspect real results before claiming success. A queued task or typed draft is not completed work. Coordinate with other local workspaces through their bridge tools.'})];
  for(const bot of bots){const assignments=await rpc(base,login.cookie,'mcp.assignments.list',{botId:bot.id});if(!assignments.some(assignment=>assignment.serverId===server.id))await rpc(base,login.cookie,'mcp.assignments.replace',{botId:bot.id,assignments:[...assignments.map(assignment=>({serverId:assignment.serverId,allowAllTools:assignment.allowAllTools,allowedTools:assignment.allowedTools})),{serverId:server.id,allowAllTools:true,allowedTools:[]}]});}
  return {agents:bots.length};
}
module.exports.connectWindows=connectWindows;

