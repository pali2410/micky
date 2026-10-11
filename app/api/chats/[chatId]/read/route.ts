import { notReady } from "@/lib/server/ready";
import { update } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const blocked = notReady();
  if (blocked) return blocked;
  const chatId = (await params).chatId;
  update((s) => {
    const c = s.chats.find((x) => x.id === chatId);
    if (c) c.readAt = Date.now();
  });
  return Response.json({ ok: true });
}
