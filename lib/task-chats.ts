import { botChatId, workspaceOf, type AppState, type Bot } from "./types";

// Older task workers have a report link, but no explicit parent field.
// Resolve that link without deleting their messages, sessions or identities.
export function taskParentChat(state: AppState, bot: Bot): string | undefined {
  if (bot.isMain) return;
  const ownChat = botChatId(bot.id);
  const parent = bot.parentChatId ?? state.sessions.find(s =>
    s.botId === bot.id && s.reportChatId && s.reportChatId !== ownChat)?.reportChatId;
  if (!parent || parent === ownChat || !state.chats.some(c => c.id === parent && workspaceOf(c) === workspaceOf(bot))) return;
  return parent;
}

export function rootTaskChat(state: AppState, chatId: string): string {
  const visited = new Set<string>();
  let current = chatId;
  while (!visited.has(current)) {
    visited.add(current);
    const bot = state.bots.find(b => botChatId(b.id) === current);
    const parent = bot && taskParentChat(state, bot);
    if (!parent) return current;
    current = parent;
  }
  return chatId; // Corrupt cyclic ownership must not hide every chat.
}

export function isTaskBot(state: AppState, bot: Bot): boolean {
  const parent = taskParentChat(state, bot);
  return !!parent && rootTaskChat(state, botChatId(bot.id)) !== botChatId(bot.id);
}

export function tasksInChat(state: AppState, chatId: string) {
  return state.sessions.filter(s => s.chatId === chatId ||
    rootTaskChat(state, s.reportChatId ?? s.chatId) === chatId);
}
