import { createBot, renameBot } from "@/lib/server/bots";
import { notReady } from "@/lib/server/ready";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = notReady();
  if (blocked) return blocked;
  const req = await request.json();
  return Response.json(await createBot(req.name, req.role));
}

export async function PATCH(request: Request) {
  const blocked = notReady();
  if (blocked) return blocked;
  const req = await request.json();
  return Response.json(renameBot(req.id, req.name));
}
