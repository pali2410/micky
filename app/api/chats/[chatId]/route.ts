import { notReady } from "@/lib/server/ready";
import { handleMessage } from "@/lib/server/chat";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const blocked = notReady();
  if (blocked) return blocked;
  const chatId = (await params).chatId;
  const req = await request.json();
  const msg = await handleMessage(chatId, req.text, req.replyTo, req.images, true);
  return Response.json(msg ?? { ok: true });
}
