import 'server-only';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export function isNativeSnapshot(value:unknown){return typeof value==='string'&&value.startsWith('bigfoot:');}
export async function nativeDesktop(name:string,args:unknown,signal:AbortSignal){const token=readFileSync(join(process.cwd(),'.data/bridge-token'),'utf8').trim();const r=await fetch('http://127.0.0.1:8769/'+name,{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});const result=await r.json();if(!r.ok)throw Error(result.error??'Native desktop operation failed');return result;}
