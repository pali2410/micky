import { systemSnapshot } from '@/lib/server/system-bridge';
export const dynamic='force-dynamic';
export async function GET() { return Response.json(await systemSnapshot()); }
