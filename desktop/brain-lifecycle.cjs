const fs=require('node:fs'),path=require('node:path');
async function startApplications({repo,window,services,mickyUrl}){
 let configured;try{configured=JSON.parse(fs.readFileSync(path.join(repo,'.data/state.json'),'utf8')).brain?.applications;}catch{}
 const apps=(configured??['maus','rakazo'].map(id=>({id,autoStart:true}))).filter(a=>['maus','rakazo'].includes(a.id));
 const token=fs.readFileSync(path.join(repo,'.data/bridge-token'),'utf8').trim();
 const report=async(id,status,error)=>{try{await fetch(mickyUrl+'/api/brain',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'lifecycle',id,status,error}),signal:AbortSignal.timeout(5000)});}catch(e){console.warn('Lifecycle update:',e.message);}};
 // Sequential starts avoid competing build/server memory spikes on small machines.
 for(const app of apps){if(!app.autoStart){await report(app.id,'offline');continue;}await report(app.id,'starting');try{
  if(app.id==='maus')await require('./openmaus.cjs').startOpenMaus({repo,services});
  if(app.id==='rakazo'){await require('./rakazo-native.cjs').ensureRakazo(repo,services);const login=await require('./rakazo-session.cjs').rakazoSession(repo);await require('./rakazo-session.cjs').connectWindows(repo,login);}
  const chief=await fetch(mickyUrl+'/api/brain',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'ensureChief',applicationId:app.id}),signal:AbortSignal.timeout(60000)});
  if(!chief.ok){const detail=await chief.json();throw Error(detail.error??'Chief provisioning failed');}
  await report(app.id,'ready');
 }catch(error){await report(app.id,'degraded',error.message);}}
}
module.exports={startApplications};
