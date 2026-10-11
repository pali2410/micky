import 'server-only';
import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
export type ModelRole='chat'|'worker'|'reasoning'|'vision';
const file=()=>join(process.cwd(),'.data/model-selection.json');
export function selectedModel(role:ModelRole){let saved:Partial<Record<ModelRole,string>>={};try{if(existsSync(file()))saved=JSON.parse(readFileSync(file(),'utf8'));}catch{}const fallback=process.env.BOPS_LOCAL_MODEL??'qwen2.5:3b';return saved[role]??({chat:fallback,worker:process.env.BOPS_WORKER_MODEL??fallback,reasoning:process.env.BOPS_REASONING_MODEL??'phi4-mini:latest',vision:process.env.BOPS_VISION_MODEL??'qwen2.5vl:3b'}[role]);}
export function saveModel(role:ModelRole,model:string){let saved={};try{saved=JSON.parse(readFileSync(file(),'utf8'));}catch{}mkdirSync(join(process.cwd(),'.data'),{recursive:true});writeFileSync(file()+'.tmp',JSON.stringify({...saved,[role]:model}));renameSync(file()+'.tmp',file());}
