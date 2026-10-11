import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import EmbeddedPostgres from './postgres/node_modules/embedded-postgres/dist/index.js';

const repo=path.resolve(import.meta.dirname,'..');
const root=path.join(repo,'Rakazo');
const config=Object.fromEntries(fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/).filter(line=>line.includes('=')&&!line.startsWith('#')).map(line=>{const index=line.indexOf('=');return[line.slice(0,index),line.slice(index+1)];}));
const data=process.env.MICKY_RAKAZO_DATA || path.join(repo,'.data/rakazo');
const port=Number(process.env.MICKY_RAKAZO_DB_PORT || 5433);
const api=Number(process.env.MICKY_RAKAZO_API_PORT || 3100);
const web=Number(process.env.MICKY_RAKAZO_WEB_PORT || 5173);
fs.mkdirSync(data,{recursive:true});
const pg=new EmbeddedPostgres({databaseDir:path.join(data,'postgres'),user:config.POSTGRES_USER,password:config.POSTGRES_PASSWORD,port,persistent:true,authMethod:'scram-sha-256',initdbFlags:['--encoding=UTF8'],postgresFlags:['-c','listen_addresses=127.0.0.1'],onLog:message=>console.log(message.trim()),onError:error=>console.error(String(error))});
const env={...process.env,...config,DATABASE_URL:`postgres://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@127.0.0.1:${port}/rakazo_native`,SANDBOX_PROVIDER:'desktop',DATA_DIR:path.join(data,'workspace'),RAKAZO_LOCAL_ONLY:'1',CLOUD_AGENT_PROVIDER:'none',API_HOST:'127.0.0.1',API_PORT:String(api),PORT:String(api),WEB_PORT:String(web),API_URL:`http://127.0.0.1:${api}`,API_PROXY_TARGET:`http://127.0.0.1:${api}`,WEB_ORIGIN:`http://127.0.0.1:${web}`,BETTER_AUTH_URL:`http://127.0.0.1:${web}`,PUBLIC_POSTHOG_KEY:'',DO_NOT_TRACK:'1'};
const children=[];
env.MCP_STDIO_ENABLED='true';
env.RAKAZO_LOCAL_MAX_TOKENS='2048';
env.MCP_STDIO_ALLOWED_COMMANDS=path.join(repo,'runtimes/node24/node-v24.21.0-win-x64/node.exe');
const run=(args,cwd=root)=>{const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','inherit','inherit']});children.push(child);child.on('error',error=>{console.error(error.message);void stop();});return child;};
let stopping=false;
let databaseStarted=false;
async function stop(){if(stopping)return;stopping=true;for(const child of children)if(child.exitCode===null)child.kill();if(databaseStarted){const ctl=path.join(repo,'runtimes/postgres/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');await new Promise(resolve=>{const shutdown=spawn(ctl,['stop','-D',path.join(data,'postgres'),'-m','fast','-w','-t','15'],{windowsHide:true,stdio:'ignore'});shutdown.once('exit',resolve);shutdown.once('error',resolve);});}process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());process.on('disconnect',()=>void stop());process.on('message',message=>{if(message?.type==='stop')void stop();});
try {
  if(!fs.existsSync(path.join(data,'postgres/PG_VERSION')))await pg.initialise();
  // A forced Windows shutdown can leave this owned cluster's pid file behind.
  // Preserve it only after verifying its process is dead and its data path matches.
  const pidFile=path.join(data,'postgres/postmaster.pid');
  if(fs.existsSync(pidFile)){
    const lines=fs.readFileSync(pidFile,'utf8').split(/\r?\n/);const pid=Number(lines[0]);
    let alive=true;try{process.kill(pid,0);}catch(error){alive=error.code!=='ESRCH';}
    if(!alive&&path.resolve(lines[1]).toLowerCase()===path.resolve(data,'postgres').toLowerCase())fs.renameSync(pidFile,pidFile+'.stale-'+Date.now());
  }
  await pg.start();
  databaseStarted=true;
  const client=pg.getPgClient();await client.connect();const result=await client.query("SELECT 1 FROM pg_database WHERE datname='rakazo_native'");if(!result.rowCount)await client.query("CREATE DATABASE rakazo_native WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'");await client.end();
  const migrate=run([path.join(root,'packages/db/node_modules/prisma/build/index.js'),'migrate','deploy'],path.join(root,'packages/db'));
  await new Promise((resolve,reject)=>{migrate.once('exit',code=>code===0?resolve():reject(Error('Database migration failed')));migrate.once('error',reject);});
  const apiProcess=run(['--import','tsx','src/index.ts'],path.join(root,'apps/api'));
  const worker=run(['--import','tsx','src/index.ts'],path.join(root,'apps/worker'));
  const webProcess=run([path.join(root,'apps/web/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(web),'--strictPort'],path.join(root,'apps/web'));
  for(const child of [apiProcess,worker,webProcess])child.once('exit',code=>{if(!stopping){console.error('Rakazo service exited: '+code);void stop();}});
  console.log('Rakazo native local runtime started');
} catch(error){console.error(error?.message??'Rakazo could not start its local database');await stop();}
