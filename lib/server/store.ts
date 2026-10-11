// lib/server/store.ts
import "server-only";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {reconcileBrain} from '@/lib/brain';
import {
  MAIN_WORKSPACE, botChatId, workspaceOf,
  type AppState, type Bot, type Chat, type Message,
  type Session, type Reaction, type Tapback
} from "@/lib/types";

// ── Persistence ───────────────────────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), ".data");
const STATE_FILE = join(DATA_DIR, "state.json");

export const userDir = () => DATA_DIR;
export const userDataDir = () => DATA_DIR;

function freshState(): AppState {
  const main: Bot = {
    id: "micky", name: "Micky", role: "Chief of Staff",
    color: "#E9FF3B", isMain: true, computerStatus: "none",
  };
  return {
    owner: { name: "" },
    bots: [main],
    chats: [{ id: botChatId("micky"), kind: "bot", botIds: ["micky"], createdAt: Date.now(), typing: [] }],
    messages: [], sessions: [], routines: [], host: "local",
    workspaces: [{ id: MAIN_WORKSPACE, name: "Main", createdAt: Date.now() }],
    workspace: MAIN_WORKSPACE,
  };
}

function loadState(): AppState {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf8")) as AppState;
      // Ensure every bot has a chat
      raw.chats ??= [];
      for (const b of raw.bots ?? []) {
        if (!raw.chats.some((c) => c.id === botChatId(b.id))) {
          raw.chats.push({ id: botChatId(b.id), kind: "bot", botIds: [b.id], createdAt: Date.now(), typing: [], workspaceId: b.workspaceId });
        }
      }
      // Reset stuck typing indicators on restart
      for (const c of raw.chats) {
        c.typing = [];
      }
      delete (raw as any).activeCall;
      for (const b of raw.bots ?? []) delete (b as any).voice;
      for (const m of raw.messages ?? []) { delete (m as any).voiceTurnId; delete (m as any).call; }
      raw.sessions ??= [];
      raw.routines ??= [];
      raw.messages ??= [];
      // Reset any stuck sessions
      for (const s of raw.sessions) {
        if ((s.status === "queued" && !!s.startedAt) || s.status === "starting" || s.status === "running" || s.status === "paused") {
          s.status = "failed";
          s.error = "Micky restarted while this was running";
        }
      }
      return raw;
    }
  } catch (error) {
    if(existsSync(STATE_FILE))throw new Error('Saved Micky state could not be loaded. The original file has been preserved; restore a backup before continuing.',{cause:error});
  }
  return freshState();
}

// Single in-process state
const shared = globalThis as typeof globalThis & { mickyStore?: { state: AppState; version: number; saveTimer: ReturnType<typeof setTimeout> | null; revisions?:Map<string,string>;subscribers?:Set<()=>void> } };
const store = shared.mickyStore ??= { state: loadState(), version: 1, saveTimer: null };
const _state = store.state;
const revisions=store.revisions??=new Map<string,string>();
reconcileBrain(_state,revisions);
const subscribers=store.subscribers??=new Set<()=>void>();
export function subscribeState(listener:()=>void){subscribers.add(listener);return()=>{subscribers.delete(listener);};}

function scheduleSave() {
  if (store.saveTimer) return;
  store.saveTimer = setTimeout(() => {
    store.saveTimer = null;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(STATE_FILE + ".tmp", JSON.stringify(_state));
      // Atomic rename
      const { renameSync } = require("node:fs");
      renameSync(STATE_FILE + ".tmp", STATE_FILE);
    } catch (e) { console.warn("[store] save failed:", e); }
  }, 500);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const getState = () => _state;
export const getVersion = () => store.version;
export const stateReady = () => true; // always ready — local, no sign-in needed

export function update(fn: (s: AppState) => void) {
  fn(_state);
  reconcileBrain(_state,revisions);
  store.version++;
  scheduleSave();
  subscribers.forEach(listener=>listener());
}

export function id(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export const ownerName = () => _state.owner?.name?.trim() || "you";
export const ownerLine = () => _state.owner?.about ? `About you: ${_state.owner.about}` : "";
export const bot = (botId: string) => _state.bots.find((b) => b.id === botId);
export const chat = (chatId: string) => {
  const raw = chatId;
  const dec = decodeURIComponent(chatId);
  return _state.chats.find(
    (c) => c.id === raw || c.id === dec || c.id === `chat:${raw}` || c.id === `chat:${dec}` || c.botIds.includes(raw) || c.botIds.includes(dec)
  );
};
export const sameState = () => { const snap = _state; return () => _state === snap; };
export const stateEpoch = () => store.version;

export function addMessage(m: Omit<Message, "id" | "at"> & { id?: string; at?: number }): Message {
  const msg: Message = { id: id("msg"), at: Date.now(), ...m } as Message;
  update((s) => s.messages.push(msg));
  return msg;
}

export function setTyping(chatId: string, botId: string, on: boolean) {
  update((s) => {
    const raw = chatId;
    const dec = decodeURIComponent(chatId);
    const c = s.chats.find(
      (x) => x.id === raw || x.id === dec || x.id === `chat:${raw}` || x.id === `chat:${dec}` || x.botIds.includes(raw) || x.botIds.includes(dec)
    );
    if (!c) return;
    c.typing = on
      ? [...(c.typing || []).filter((x) => x !== botId), botId]
      : (c.typing || []).filter((x) => x !== botId);
  });
}

export function setAsking(chatId: string, askerId: string, targetId: string | null) {
  update((s) => {
    const c = s.chats.find((x) => x.id === chatId);
    if (!c) return;
    if (targetId) (c.asking ??= {})[askerId] = targetId;
    else delete c.asking?.[askerId];
  });
}

export function patchSession(sessionId: string, patch: Partial<Session>) {
  update((s) => {
    const sess = s.sessions.find((x) => x.id === sessionId);
    if (sess) Object.assign(sess, patch);
  });
}

export function react(messageId: string, by: string, type?: Tapback, emoji?: string) {
  update((s) => {
    const m = s.messages.find((x) => x.id === messageId);
    if (!m) return;
    m.reactions = [...(m.reactions ?? []).filter((r) => r.by !== by)];
    if (type || emoji) m.reactions.push({ by, type, emoji, at: Date.now() });
  });
}
