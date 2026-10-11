export const robotDefaults={shape:'rectangle' as 'rectangle'|'square'|'circle'|'hexagon',color:'#2b49a3',trimColor:'#93a6c8',screenColor:'#e8f2ff',speed:1,paused:false,antenna:true,floorShadow:true,interactive:true};
export type RobotSettings=typeof robotDefaults;
export function robotSettings(value:unknown):RobotSettings{
  const v=value as Record<string,unknown>;if(!v||typeof v!=='object')throw Error('Invalid robot settings');
  const result={...robotDefaults};
  if(v.shape!==undefined){if(!['rectangle','square','circle','hexagon'].includes(String(v.shape)))throw Error('Invalid shape');result.shape=v.shape as RobotSettings['shape'];}
  for(const key of ['color','trimColor','screenColor'] as const)if(v[key]!==undefined){if(typeof v[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(v[key] as string))throw Error('Invalid color');result[key]=v[key] as string;}
  if(v.speed!==undefined){if(typeof v.speed!=='number'||!Number.isFinite(v.speed)||v.speed<.25||v.speed>2)throw Error('Invalid speed');result.speed=v.speed;}
  for(const key of ['paused','antenna','floorShadow','interactive'] as const)if(v[key]!==undefined){if(typeof v[key]!=='boolean')throw Error('Invalid toggle');result[key]=v[key] as boolean;}
  return result;
}
