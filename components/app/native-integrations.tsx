'use client';
import {useEffect,useState} from 'react';
export function NativeIntegrations({mode}:{mode:'bigfoot'|'heyjev'}){
 const [status,setStatus]=useState<any>(null),[error,setError]=useState(''),[starting,setStarting]=useState(false);
 const voice=mode==='heyjev';
 useEffect(()=>{let active=true;const bridge=(window as any).mickyElectron;
  const refresh=()=>{if(!bridge?.nativeAppStatus){setError('Open Micky desktop to launch the applications');return;}void bridge.nativeAppStatus().then((s:any)=>{if(active)setStatus(s[mode]);}).catch((e:Error)=>{if(active)setError(e.message);});};
  refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},3000);return()=>{active=false;clearInterval(timer);};},[mode]);
 async function open(){setStarting(true);setError('');try{setStatus(await(window as any).mickyElectron.openNativeApp(mode));}catch(e){setError((e as Error).message);}finally{setStarting(false);}}
 return <div className="p-6 overflow-auto h-full space-y-5"><h1 className="font-semibold text-xl">{voice?'HeyJev · Windows application':'Bigfoot · Desktop application'}</h1>
  <p role="status" className={error?'text-red-300':'text-lime-200'}>{error||(starting?'Starting application…':status?.running?'Application running':'Application installed · ready to launch')}</p>
  <p>{voice?'Open HeyJev’s native Windows interface. Its original command, timer, recording and dictation engine runs with local models and Windows speech.':'Open Bigfoot’s original Windows interface, including its chat, desktop tools, drawing, terminal, plugins and settings. It uses Micky’s installed local tool and vision models.'}</p>
  <button disabled={starting} className="rounded bg-lime-300 text-zinc-950 px-4 py-2 disabled:opacity-40" onClick={open}>{starting?'Starting…':status?.running?`Switch to ${voice?'HeyJev':'Bigfoot'}`:`Open ${voice?'HeyJev':'Bigfoot'}`}</button>
  {status?.model&&<p className="text-sm text-zinc-300">Local model: {status.model}</p>}
  <p className="text-sm text-zinc-400">{voice?'Choose continuous listening, wake phrase or push to talk in HeyJev Settings. Bluetooth microphone selection falls back to the system input.':'Bigfoot keeps its own conversation and settings. The model service is shared; its desktop tool engine runs in the original app.'}</p>
 </div>;
}
