import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, useStore } from '@/state/store';
import { AndroidDevicePanel, useAndroidUsbDevices } from './AndroidDevicePanel';
import { BrowserProfilesManager } from './BrowserProfilesManager';
import { WorkspaceBackupSettings } from './WorkspaceBackupSettings';

export function MickyLocalSettings() {
  const {state,dispatch}=useStore();
  const [tab,setTab]=useState('General');
  const [url,setUrl]=useState(state.config?.openaiCompat?.url ?? 'http://127.0.0.1:11434/v1');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [phone,setPhone]=useState<{enabled:boolean;addresses:string[]}>({enabled:false,addresses:[]});
  const [offer,setOffer]=useState<{code:string;expiresAt:number;link:string}|null>(null);
  const android=useAndroidUsbDevices();
  const native=(window as any).mickyElectron;
  const instance=state.instances.find(i=>i.instanceId==='openaiCompat');
  const models=instance?.models.options ?? [];
  const run=async(work:()=>Promise<void>)=>{setError('');setNotice('');try{await work();}catch(e){setError(String((e as Error).message));}};
  useEffect(()=>{native?.phone?.status().then(setPhone).catch((e:Error)=>setError(e.message));},[]);
  const refresh=async()=>{
    await api('/api/instances/openaiCompat/refresh-models',{method:'POST',body:'{}'});
    const body=await api('/api/instances');dispatch({type:'instances',instances:body.instances});setNotice('Local models refreshed.');
  };
  return <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-label="Maus settings">
    <div className="bg-panel border border-ink/20 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 space-y-4">
      <div className="flex justify-between"><h2 className="font-semibold text-lg">Maus settings</h2><button onClick={()=>dispatch({type:'toggleAppSettings',open:false})}>Close</button></div>
      <nav className="flex flex-wrap gap-2">{['General','Local models','Browser','Phones','Backups'].map(name=><button key={name} onClick={()=>setTab(name)} className={`ui-button ${tab===name?'ui-button-primary':''}`}>{name}</button>)}</nav>
      {tab==='General' && <div className="space-y-3"><p>Maus runs locally with Micky. Windows actions and task updates use the shared Micky tools.</p><p>Chat, teams, memory, skills and routines remain available. Calling is disabled.</p><button className="ui-button" onClick={()=>dispatch({type:'toggleAppSettings',open:false})}>Back to chat</button></div>}
      {tab==='Local models' && <div className="space-y-3">
        <label className="block">Local model server<input aria-label="Local model server" value={url} onChange={e=>setUrl(e.target.value)} className="block w-full bg-control rounded-lg p-2 mt-1" /></label>
        <button className="ui-button" onClick={()=>void run(async()=>{const target=new URL(url);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||!['http:','https:'].includes(target.protocol))throw Error('Use a local model server on this computer.');await api('/api/config',{method:'PATCH',body:JSON.stringify({openaiCompat:{key:'local-only',url}})});await refresh();})}>Save and refresh</button>
        <button className="ui-button ml-2" onClick={()=>void run(refresh)}>Refresh models</button>
        <p className="text-sm">Choose a model in each chat. Different models have different tool capabilities.</p>
        <ul className="space-y-1">{models.map(model=><li key={model.id} className="bg-control rounded-lg p-2">{model.label}</li>)}</ul>
        {!models.length && <p>No local models found. Start the local model server and refresh.</p>}
      </div>}
      {tab==='Browser' && <div className="space-y-3"><p>The built-in browser gives each bot its own tabs and browser profile. Your normal Windows apps use the Micky tools.</p><BrowserProfilesManager /></div>}
      {tab==='Phones' && <div className="space-y-4">
        <h3 className="font-semibold">Access Maus from your phone</h3>
        {!native?.phone && <p>Remote access is configured from the Windows desktop app.</p>}
        {native?.phone && <><p className="text-sm">Connect both devices to the same Wi-Fi. Pairing replaces account login.</p><button className="ui-button" onClick={()=>void run(async()=>{setPhone(await native.phone.enable(!phone.enabled));setOffer(null);})}>{phone.enabled?'Disable phone access':'Enable phone access'}</button>
          {phone.enabled && <><ul>{phone.addresses.map(address=><li key={address}>{address}/pair</li>)}</ul><button className="ui-button" onClick={()=>void run(async()=>{if(!phone.addresses[0])throw Error('No Wi-Fi address found.');const result=await api('/api/auth/pairing',{method:'POST',body:JSON.stringify({label:'My phone',scopes:['client']})});setOffer({code:result.code,expiresAt:result.expiresAt,link:`${phone.addresses[0]}/pair#code=${encodeURIComponent(result.code)}`});})}>Create phone pairing code</button></>}
          {offer && <div className="space-y-2"><QRCodeSVG value={offer.link} size={160} bgColor="#ffffff" fgColor="#000000" /><p>Pairing code: {offer.code}</p><p className="text-xs">Expires {new Date(offer.expiresAt).toLocaleTimeString()}</p></div>}
        </>}
        <h3 className="font-semibold">Control your Android phone</h3>
        {!android.available && <p>Android Platform Tools (ADB) are unavailable: {android.message ?? 'Install Android Platform Tools on Windows.'}</p>}
        {android.available && !android.devices.length && <p>Connect your Android phone by USB, enable USB debugging, and accept the authorization prompt on the phone.</p>}
        {android.devices.length>0 && <AndroidDevicePanel status={android} />}
      </div>}
      {tab==='Backups' && <WorkspaceBackupSettings />}
      {error && <p role="alert" className="text-danger">{error}</p>}{notice && <p className="text-success">{notice}</p>}
    </div>
  </div>;
}
