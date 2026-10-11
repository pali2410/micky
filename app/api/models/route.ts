import {selectedModel,saveModel,type ModelRole} from '@/lib/server/model-selection';
export const dynamic = "force-dynamic";
export async function GET() {
  const base = (process.env.BOPS_LOCAL_LLM_URL ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
  try {
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Model service unavailable (${response.status})`);
    const models = (await response.json()).models ?? [];
    const configured = {chat:selectedModel('chat'),worker:selectedModel('worker'),reasoning:selectedModel('reasoning'),vision:selectedModel('vision')};
    const roles = Object.fromEntries(Object.entries(configured).map(([role, name]) => [role, { model: name, ready: models.some((m: any) => m.name === name) }]));
    return Response.json({ ok: true, roles, integration: { planner: process.env.BOPS_PLANNER_ENGINE ?? "local", reasoning: process.env.BOPS_REASONING_ENGINE ?? "local", deepseekVersion: "0.2.0-rc.2", openmaus: ["provider retry", "tool-call protocol validation"] }, installed: models.map((m: any) => ({ name: m.name, size: m.size })) });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 503 }); }
}

export async function POST(request:Request){const origin=request.headers.get('origin');if(origin&&!['http://localhost:3000','http://127.0.0.1:3000'].includes(origin))return Response.json({error:'Local Micky origin required'},{status:403});const value=await request.json().catch(()=>({}));if(!['chat','worker','reasoning','vision'].includes(value.role)||typeof value.model!=='string')return Response.json({error:'Invalid model role'},{status:400});const catalog=await GET();const data=await catalog.json();if(!data.ok)return Response.json(data,{status:503});if(!data.installed.some((m:any)=>m.name===value.model))return Response.json({error:'Choose an installed local model'},{status:400});saveModel(value.role as ModelRole,value.model);return Response.json({ok:true,workspaceRestartRequired:true});}
