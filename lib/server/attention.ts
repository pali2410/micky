// lib/server/attention.ts
import "server-only";
import { botChatId, MAIN_WORKSPACE, workspaceOf } from "@/lib/types";
import { addMessage, getState, ownerName, stateReady, update } from "./store";

const g = globalThis as any;

export function pingIfWorthIt(messageId: string, _title: string, _answer: string) {
  update((s) => {
    const m = s.messages.find((x) => x.id === messageId);
    if (m) m.ping = true;
  });
}

function flush() {
  if (!stateReady()) return;
  const st = getState();
  const held = (st as any).digest ?? [];
  if (!held.length) return;
  const first = Math.min(...held.map((h: any) => h.at));
  const around = st.messages.some((m) => m.role === "user" && m.at > first);
  if (!around && Date.now() - first < 20 * 60_000) return;
  const main = st.bots.find((b) => b.isMain);
  if (!main) return;
  update((s) => { (s as any).digest = []; });
  addMessage({
    chatId: botChatId(main.id), role: "bot", botId: main.id,
    text: `While you were away:\n${held.map((h: any) => `• ${h.text}`).join("\n")}`,
  });
}

if (g.__mickyDigestTimer) clearInterval(g.__mickyDigestTimer);
g.__mickyDigestTimer = setInterval(() => stateReady() && flush(), 60_000);
