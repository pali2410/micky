import { notReady } from "@/lib/server/ready";
import { getState, id, update } from "@/lib/server/store";
import { MAIN_WORKSPACE } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = notReady();
  if (blocked) return blocked;
  const req = await request.json();
  const botIds = req.botIds as string[];
  const chatId = `group_${id("chat")}`;
  const ws = getState().workspace ?? MAIN_WORKSPACE;
  update((s) => {
    s.chats.push({ id: chatId, kind: "group", botIds, createdAt: Date.now(), typing: [], workspaceId: ws });
  });
  return Response.json({ chatId });
}
