// lib/types.ts
export type BotId = string;

export type Bot = {
  applicationId?: import('./brain').ApplicationId;
  id: BotId;
  name: string;
  role: string;
  color: string;
  isMain: boolean;
  computerStatus: "none" | "ready";
  phone?: string;
  email?: string;
  effort?: Effort;
  workspaceId?: string;
  autoApprove?: boolean;
  parentChatId?: string;
};

export type Workspace = { id: string; name: string; createdAt: number };
export const MAIN_WORKSPACE = "ws_main";
export const workspaceOf = (b: { workspaceId?: string } | undefined) => b?.workspaceId ?? MAIN_WORKSPACE;
export const botChatId = (botId: string) => `chat:${botId}`;
export const pairChatId = (a: string, b: string) => `pair:${[a, b].sort().join(":")}`;
export type Effort = "auto" | "low" | "medium" | "high";
export type Host = "local";

export type Chat = {
  id: string;
  kind: "bot" | "group";
  botIds: BotId[];
  title?: string;
  createdAt: number;
  readAt?: number;
  typing: BotId[];
  asking?: Record<BotId, BotId>;
  workspaceId?: string;
};

export type Message = {
  id: string;
  chatId: string;
  role: "user" | "bot" | "system";
  botId?: BotId;
  text: string;
  at: number;
  sessionIds?: string[];
  resultOf?: string;
  replyTo?: string;
  reactions?: Reaction[];
  options?: string[];
  ping?: boolean;
  images?: { id: string; type: string; w?: number; h?: number }[];
  picture?: { prompt: string };
  asked?: { botId: string; question: string; answer: string; questionId?: string }[];
  memory?: { ws: string; id: string; fact: string; undone?: boolean };
};

export const TAPBACKS = ["love", "like", "dislike", "laugh", "emphasize", "question"] as const;
export type Tapback = (typeof TAPBACKS)[number];
export const TAPBACK_EMOJI: Record<Tapback, string> = { love: "❤️", like: "👍", dislike: "👎", laugh: "😂", emphasize: "‼️", question: "❓" };
export type Reaction = { by: "owner" | BotId; type?: Tapback; emoji?: string; at: number };

export type SessionStatus = "queued" | "starting" | "running" | "paused" | "done" | "failed";
export type SessionStep = { at: number; tool: string; detail: string };
export type ThreadReply = { id: string; role: "user" | "bot"; text: string; at: number; note?: string };

export type Session = {
  applicationId?: import('./brain').ApplicationId;
  dependencies?: string[];
  acceptanceCriteria?: string[];
  verification?: {status:'verified'|'unverified';evidence:string[]};
  id: string;
  botId: BotId;
  profileEmail?: string;
  reportChatId?: string;
  parentId?: string;
  chatId: string;
  sentVia: BotId | "you" | "routine";
  title: string;
  goal: string;
  host: Host;
  status: SessionStatus;
  steps: SessionStep[];
  replies: ThreadReply[];
  answer?: string;
  effort?: Exclude<Effort, "auto">;
  options?: string[];
  runsOn?: "local";
  waitingOnYou?: boolean;
  error?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  dismissed?: boolean;
  activity?: string;
};

export type Schedule =
  | { kind: "daily"; time: string }
  | { kind: "weekdays"; time: string }
  | { kind: "weekly"; day: number; time: string }
  | { kind: "once"; at: number };

export type Routine = {
  id: string;
  botId: BotId;
  title: string;
  goal: string;
  schedule: Schedule;
  enabled: boolean;
  nextRunAt?: number;
  lastRunAt?: number;
  reminder?: string;
};

export type Owner = { name: string; about?: string };

export type AppState = {
  brain?: import('./brain').BrainState;
  owner?: Owner;
  bots: Bot[];
  chats: Chat[];
  messages: Message[];
  sessions: Session[];
  routines: Routine[];
  host: Host;
  workspaces?: Workspace[];
  workspace?: string;
  installId?: string;
};

export const live = (s: Session) =>
  s.status === "queued" || s.status === "starting" || s.status === "running" || s.status === "paused";
