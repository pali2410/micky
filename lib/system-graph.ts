export type SystemNode = { id: string; label: string; kind: 'brain' | 'system' | 'model' | 'bot' | 'module'; system?: string; status: string; detail?: string; position: [number, number, number] };
export type SystemLink = { source: string; target: string; active: boolean; label: string };
export type WorkspaceStatus = {id:string;label:string;ready:boolean;error?:string;agents?:any[];modules:string[];modelConnected?:boolean};
export type SystemGraph = { at: number; nodes: SystemNode[]; links: SystemLink[]; counts: { running: number; waiting: number; models: number; bots: number }; openmaus: { ready: boolean; error?: string }; workspaces:WorkspaceStatus[]; events: { id: string; at: number; text: string; status: string }[] };

export function buildSystemGraph(state: any, installed: any[], loaded: any[], upstream: any, configured: Record<string, string>, workspaces:WorkspaceStatus[] = []): SystemGraph {
  const tasks = state.sessions ?? [];
  const running = tasks.filter((s: any) => ['queued','starting','running'].includes(s.status));
  const nodes: SystemNode[] = [
    { id:'brain', label:'Micky • shared intelligence', kind:'brain', status:running.length ? 'active':'idle', detail:'Coordination across local models and application workspaces', position:[0,3,0] },
    { id:'micky', label:'Micky', kind:'system', status:running.length ? 'active':'ready', position:[-5,-2,0] },
    { id:'openmaus', label:'OpenMausBot', kind:'system', status:upstream.ready ? 'ready':'offline', detail:upstream.error, position:[5,-2,0] }
  ];
  const links: SystemLink[] = [ {source:'brain',target:'micky',active:running.length>0,label:'Tasks and events'}, {source:'brain',target:'openmaus',active:!!upstream.active,label:'Shared local provider and system bridge'} ];
  installed.forEach((m,i) => {
    const angle = i * Math.PI*2/Math.max(installed.length,1);
    const modelName = m.name ?? m.id;
    const roles = Object.entries(configured).filter(([,name]) => name === modelName || name+':latest' === modelName).map(([role])=>role);
    const resident = loaded.some((x: any) => x.name === modelName || x.model === modelName);
    const id = 'model:'+modelName;
    nodes.push({ id,label:modelName,kind:'model',status:resident?'loaded':'installed',detail:roles.length?roles.join(', '):'Available local model',position:[Math.cos(angle)*6,5+Math.sin(angle)*2,Math.sin(angle)*4] });
    links.push({source:'brain',target:id,active:resident&&running.length>0&&roles.length>0,label:roles.join(', ')||'Available'});
  });
  const allBots = [...(state.bots??[]).map((b:any)=>({...b,system:'micky'})), ...(upstream.bots??[]).map((b:any)=>({...b,system:'openmaus'}))];
  for (const system of ['micky','openmaus']) {
    const bots = allBots.filter(b=>b.system===system).slice(-18);
    bots.forEach((b,i)=>{
      const task = tasks.filter((s:any)=>s.botId===b.id).at(-1);
      const active = task && ['queued','starting','running'].includes(task.status) || b.status==='running' || b.busy===true;
      const angle=i*Math.PI*2/Math.max(bots.length,1);
      const id=system+':bot:'+b.id;
      nodes.push({id,label:b.name??b.id,kind:'bot',system,status:active?'active':task?.status??b.status??'idle',detail:task?.activity??b.role,position:[(system==='micky'?-5:5)+Math.cos(angle)*2.8,-3-Math.floor(i/9)*1.6,Math.sin(angle)*2.8]});
      links.push({source:system,target:id,active:!!active,label:'Agent'});
    });
    const modules=system==='micky'?['Chat','Task teams','Windows harness','Model routing','Schedules','Persistence']:['Teams & rooms','Memory','Skills','Routines','MCP tools','Backups','Connected apps','Computer environments'];
    modules.forEach((name,i)=>{const angle=i*2*Math.PI/modules.length;const id=system+':module:'+i;const external=name==='Connected apps'||name==='Computer environments';nodes.push({id,label:name,kind:'module',system,status:system==='openmaus'&&!upstream.ready?'offline':external?'requires setup':'available',detail:external?'External accounts or computer runtimes must be configured.':'Module provided by '+system,position:[(system==='micky'?-5:5)+Math.cos(angle)*3.8,-1.4,Math.sin(angle)*3.8]});links.push({source:system,target:id,active:false,label:'Module'});});
  }
  for(const [index,workspace] of workspaces.entries()) {
    const x=index%2===0?-6:6;const y=-7-Math.floor(index/2)*6;
    const agents=(workspace.agents??[]).filter(agent=>!agent.archived);
    const active=workspace.ready&&agents.some(agent=>agent.status==='running'||agent.status==='working');
    nodes.push({id:workspace.id,label:workspace.label,kind:'system',status:workspace.ready?(active?'active':'ready'):'offline',detail:workspace.error,position:[x,y,0]});
    links.push({source:'brain',target:workspace.id,active:!!active&&!!workspace.modelConnected,label:workspace.ready&&workspace.modelConnected?'Shared local provider':'Runtime not connected'});
    workspace.modules.forEach((label,i)=>{const angle=i*Math.PI*2/workspace.modules.length;const id=workspace.id+':module:'+i;nodes.push({id,label,kind:'module',system:workspace.id,status:workspace.ready?'available':'offline',position:[x+Math.cos(angle)*3.5,y-0.7,Math.sin(angle)*3.5]});links.push({source:workspace.id,target:id,active:false,label:'Module'});});
    agents.slice(-18).forEach((agent,i)=>{const id=workspace.id+':bot:'+agent.id;const busy=workspace.ready&&['running','working'].includes(agent.status);nodes.push({id,label:agent.name??agent.id,kind:'bot',system:workspace.id,status:busy?'active':agent.status??'idle',detail:agent.role,position:[x+(i%6-2.5)*.65,y-2.5-Math.floor(i/6),0]});links.push({source:workspace.id,target:id,active:busy,label:'Observed agent'});});
  }
  return { at:Date.now(), nodes,links,counts:{running:running.length+workspaces.reduce((count,w)=>count+(w.ready?(w.agents??[]).filter(a=>!a.archived&&['running','working'].includes(a.status)).length:0),0),waiting:running.filter((s:any)=>s.waitingOnYou).length,models:installed.length,bots:allBots.length+workspaces.reduce((count,w)=>count+(w.agents??[]).length,0)},openmaus:{ready:upstream.ready,error:upstream.error},workspaces,events:tasks.slice(-12).reverse().map((s:any)=>({id:s.id,at:s.endedAt??s.startedAt??s.createdAt,text:s.title+' · '+(s.activity??s.answer??s.status),status:s.status})) };
}
