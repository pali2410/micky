import 'server-only';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function rakazoRpc(method:string,input:Record<string,unknown>={}) {
  const {cookie}=JSON.parse(readFileSync(join(process.cwd(),'.data/rakazo/local-session.json'),'utf8'));
  const response=await fetch('http://127.0.0.1:3100/rpc/'+method.replaceAll('.','/'),{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({json:input}),signal:AbortSignal.timeout(10000),cache:'no-store'});
  const value=await response.json();if(!response.ok)throw Error(value.message??'Open Rakazo workspace to reconnect');return value.json;
}
export async function rakazoAgents(){const [bots,me]=await Promise.all([rakazoRpc('bots.list'),rakazoRpc('me')]);return {agents:bots.map((bot:any)=>({id:bot.id,name:bot.name,role:bot.title,status:bot.status,archived:!!bot.archivedAt})),modelConnected:me.defaultProvider==='local'};}

