// lib/server/bots.ts
import "server-only";
import { botChatId, workspaceOf, type Bot } from "@/lib/types";
import { bot, getState, id, ownerName, update } from "./store";
import { MAIN_WORKSPACE } from "@/lib/types";

const COLORS = ["#FF9F43","#2EC4B6","#A78BFA","#F87171","#60A5FA","#34D399","#E9FF3B","#FF6FB5"];

export function freeBotId(name: string) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bot";
  let botId = base;
  for (let n = 2; bot(botId); n++) botId = `${base}-${n}`;
  return botId;
}

export function contactLine(b: Bot, _spoken = false) {
  return b.email ? `Your email address is ${b.email}.` : "You don't have an email address yet.";
}

export async function createBot(
  name: string,
  role?: string,
  workspaceId?: string,
  parentChatId?: string,
): Promise<{ botId: string; chatId: string } | { error: string }> {
  const clean = name.trim();
  if (!clean) return { error: "name required" };
  const ws = workspaceId ?? getState().workspace ?? MAIN_WORKSPACE;
  if (getState().bots.some((b) => workspaceOf(b) === ws && b.name.toLowerCase() === clean.toLowerCase()))
    return { error: "a bot with that name exists" };
  const botId = freeBotId(clean);
  const chatId = botChatId(botId);
  update((s) => {
    const newBot: Bot = {
      id: botId, name: clean,
      role: role?.trim() || "Generalist",
      color: COLORS[(s.bots.length - 1) % COLORS.length],
      isMain: false, computerStatus: "none", workspaceId: ws,
      parentChatId,
    };
    s.bots.push(newBot);
    s.chats.push({ id: chatId, kind: "bot", botIds: [botId], createdAt: Date.now(), typing: [], workspaceId: ws });
  });
  return { botId, chatId };
}

export function renameBot(botId: string, name: string): { ok: true } | { error: string } {
  const b = bot(botId);
  const clean = name.trim().slice(0, 40);
  if (!b) return { error: "no such bot" };
  if (!clean) return { error: "name required" };
  if (clean === b.name) return { ok: true };
  update(() => (b.name = clean));
  return { ok: true };
}
