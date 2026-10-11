import { bridgeToken, bridgeTools, executeBridgeTool } from '@/lib/server/bridge-tools';
export const dynamic='force-dynamic';
function allowed(request:Request){return request.headers.get('authorization')==='Bearer '+bridgeToken();}
export async function GET(request:Request){if(!allowed(request))return Response.json({error:'Unauthorized'},{status:401});return Response.json({tools:bridgeTools});}
export async function POST(request:Request){if(!allowed(request))return Response.json({error:'Unauthorized'},{status:401});try{const body=await request.json();return Response.json({result:await executeBridgeTool(body.name,body.arguments??{})});}catch(e){return Response.json({error:(e as Error).message},{status:400});}}
