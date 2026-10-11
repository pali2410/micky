import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {robotDefaults,robotSettings} from '@/lib/robot-settings';
export const dynamic='force-dynamic';
const file=join(process.cwd(),'.data','robot-head.json');
export async function GET(){try{return Response.json(existsSync(file)?robotSettings(JSON.parse(readFileSync(file,'utf8'))):robotDefaults);}catch{return Response.json(robotDefaults);}}
export async function POST(request:Request){try{const settings=robotSettings(await request.json());mkdirSync(join(process.cwd(),'.data'),{recursive:true});writeFileSync(file,JSON.stringify(settings));return Response.json(settings);}catch(error){return Response.json({error:(error as Error).message},{status:400});}}
