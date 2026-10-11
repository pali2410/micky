import "server-only";
import { createBot } from "./bots";
import { startSession } from "./sessions";
import { getState, addMessage,update } from "./store";
import {applicationFor} from '@/lib/brain';
import {planTaskGraph} from './task-planner';
import type { Session } from "@/lib/types";
import { rootTaskChat } from "@/lib/task-chats";

export async function startTaskTeam(botId: string, chatId: string, request: string): Promise<Session[]> {
  const profileEmail = /[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/.exec(request)?.[0];
  const urls = [...new Set(request.match(/https?:\/\/[^\s,]+/g) ?? [])].map(u => u.replace(/[.!?]+$/, ""));
  const websiteBatch = urls.length > 1 && /\b(?:research|analyze|analyse|describe|description)\b/i.test(request) && !/\b(?:excel|spreadsheet|xlsx)\b/i.test(request);
  const planned=websiteBatch?null:await planTaskGraph(request);
  const goals = websiteBatch ? urls.map(url => `Read and analyze ${url}. Provide a detailed description based on the website's actual text, with its source URL. Original request: ${request.replace(/https?:\/\/[^\s,]+/g, "[source]")}`) : planned!.map(node=>node.goal);
  const sessions: Session[] = [];
  for (const [index,goal] of goals.entries()) {
    const active = getState().sessions.find(s => (s.reportChatId === chatId || s.chatId === chatId) && s.goal === goal && ["queued", "starting", "running", "paused"].includes(s.status));
    if (active) { sessions.push(active); continue; }
    const label = /https?:\/\/([^/\s]+)/.exec(goal)?.[1]?.replace(/[.!?]+$/, "") ?? goal.replace(/^(?:open|read|analyze|create)\s+/i, "").slice(0, 30);
    const number = getState().bots.length;
    const parentChatId = rootTaskChat(getState(), chatId);
    const workspaceId = getState().chats.find(c => c.id === chatId)?.workspaceId;
    const applicationId=applicationFor(goal);const role=websiteBatch?'Website research':applicationId?`${applicationId} specialist`:'Desktop task';
    const idle=getState().bots.find(b=>b.parentChatId===parentChatId&&b.role===role&&b.applicationId===applicationId&&!getState().sessions.some(s=>s.botId===b.id&&['queued','starting','running','paused'].includes(s.status)));
    const result = idle?{botId:idle.id,chatId:`chat:${idle.id}`}:await createBot(`Task ${number}: ${label}`,role, workspaceId, parentChatId);
    if ("error" in result) throw new Error(result.error);
    update(s=>{const worker=s.bots.find(b=>b.id===result.botId);if(worker)worker.applicationId=applicationId;});
    addMessage({ chatId: result.chatId, role: "user", text: goal });
    const dependencies=planned?.[index]?.dependencies.map(position=>sessions[position].id)??[];
    sessions.push(startSession({ botId: result.botId, chatId: result.chatId, reportChatId: parentChatId, goal, title: label, sentVia: botId, profileEmail,dependencies }));
  }
  return sessions;
}
