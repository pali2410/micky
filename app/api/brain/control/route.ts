import {bridgeToken} from '@/lib/server/bridge-tools';
import {getState} from '@/lib/server/store';
import {cancelSession} from '@/lib/server/sessions';
import {live} from '@/lib/types';
export async function POST(request:Request){if(request.headers.get('authorization')!==`Bearer ${bridgeToken()}`)return Response.json({error:'Unauthorized'},{status:401});const input=await request.json();if(input.action!=='stopAll')return Response.json({error:'Invalid action'},{status:400});const active=getState().sessions.filter(live);active.forEach(s=>cancelSession(s.id));return Response.json({ok:true,stopped:active.length});}
