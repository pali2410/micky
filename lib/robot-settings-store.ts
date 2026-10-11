'use client';
import {robotDefaults,robotSettings,type RobotSettings} from './robot-settings';
let snapshot:RobotSettings=robotDefaults;
let reading:Promise<void>|null=null;
let timer:ReturnType<typeof setInterval>|undefined;
let channel:BroadcastChannel|undefined;
const listeners=new Set<()=>void>();
function publish(value:unknown){const next=robotSettings(value);if(JSON.stringify(next)===JSON.stringify(snapshot))return;snapshot=next;listeners.forEach(listener=>listener());}
async function read(){if(reading)return reading;reading=fetch('/api/robot',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Settings unavailable');return r.json();}).then(publish).catch(()=>{}).finally(()=>{reading=null;});return reading;}
const visibility=()=>{if(!document.hidden)void read();};
const changed=(event:Event)=>{publish((event as CustomEvent).detail);channel?.postMessage(snapshot);};
export function subscribeRobot(listener:()=>void){
  listeners.add(listener);
  if(listeners.size===1){
    void read();timer=setInterval(()=>{if(!document.hidden)void read();},30000);
    document.addEventListener('visibilitychange',visibility);window.addEventListener('robot-settings',changed);
    if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('micky-robot');channel.onmessage=event=>{try{publish(event.data);}catch{}};}
  }
  return()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=undefined;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('robot-settings',changed);channel?.close();channel=undefined;}};
}
export const robotSnapshot=()=>snapshot;
export const robotServerSnapshot=()=>robotDefaults;
