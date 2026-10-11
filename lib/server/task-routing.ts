import {selectedModel} from './model-selection';
import "server-only";
import { getState, bot, ownerName } from "./store";
import { botChatId, live } from "@/lib/types";
import { isComputerRequest, normalizeRequest, clarificationFor, parseWhatsAppCommand } from "@/lib/task-intent";
import { cancelSession, pauseSession, resumeSession } from "./sessions";

export function resolveTaskRequest(chatId: string, text: string): string {
  const request = normalizeRequest(text);
  const previous = getState().sessions.filter(s => (s.chatId === chatId || s.reportChatId === chatId) && /whatsapp|whatapp|waht app/i.test(s.goal)).at(-1);
  // A selected chat remains the target of subsequent explicit message instructions.
  // "no, send message testing" is a correction, while "do not send" is not consent.
  if (previous && !/whatsapp/i.test(request) && !/\b(?:do not|don't|never)\s+send\b/i.test(request)) {
    const followup = request.replace(/^(?:(?:no|ok|okay|yes|now|then)[, ]+)+/i, "");
    if (/^send\b/i.test(followup) && !/^send\s+(?:it|that|the message)(?: now)?[.! ]*$/i.test(followup)) {
      const explicit = parseWhatsAppCommand(`In WhatsApp ${followup}`);
      const prior = parseWhatsAppCommand(previous.goal);
      const tail = /^send\s+(?:(?:a|the)\s+)?(?:message\s+)?(.+?)\s+to\s+(.+?)[.!]*$/i.exec(followup);
      const recipient = explicit?.recipient ?? tail?.[2] ?? prior?.recipient;
      const body = explicit?.text ?? tail?.[1] ?? followup.replace(/^send\s+(?:(?:a|the)\s+)?message\s*/i, "").replace(/^send\s+/i, "").trim();
      if (recipient && body) return `Open WhatsApp and search for contact ${JSON.stringify(recipient)} and send message ${JSON.stringify(body)}`;
      if (explicit?.recipient) return `In WhatsApp ${followup}`;
    }
  }
  if (/^(?:(?:no|ok|okay|yes)[, ]+)?(?:send (?:it|that|the message)(?: now)?|message (?:is )?not (?:sent|send).*|(?:it is |it's )?still (?:in )?draft)[.! ]*$/i.test(request)) {
    if (previous) return normalizeRequest(previous.goal).replace(/\b(?:type|write)\b/i, "send").replace(/\b(?:do not|don't|without)\s+send\b/gi, "send");
  }
  if (previous && /^send\s+(?:a\s+)?message\s+to\b/i.test(request) && !/whatsapp/i.test(request)) return `In WhatsApp ${request}`;
  const corrected = /\bcontact\s+name\s*(?:is\s*)?[=:]\s*(.+)$/i.exec(request)?.[1]?.trim();
  if (previous && corrected && !/\bsend\b/i.test(request)) {
    const command = parseWhatsAppCommand(previous.goal);
    if (command?.text) return `Open WhatsApp and search for contact ${JSON.stringify(corrected)} and ${command.send ? "send" : "type"} message ${JSON.stringify(command.text)}`;
    return `Open WhatsApp and search for contact ${JSON.stringify(corrected)}`;
  }
  return request;
}

export async function routeTaskRequest(botId: string, text: string): Promise<{ kind: string; request?: string; answer?: string }> {
  const request = resolveTaskRequest(botChatId(botId), text);
  if (/^(?:please\s+)?(?:stop|cancel)\s+(?:all\s+)?(?:the\s+|that\s+|this\s+|my\s+)?(?:tasks?|bots?|work|everything)\b/i.test(request)) {
    const running = getState().sessions.filter(live);
    const chosen = /\ball\b|everything/i.test(request) ? running : running.filter(s => s.chatId === botChatId(botId) || s.reportChatId === botChatId(botId)).slice(-1);
    chosen.forEach(s => cancelSession(s.id));
    return { kind: "control", answer: chosen.length ? `Stopped ${chosen.length === 1 ? "that task" : `those ${chosen.length} tasks`}.` : "There are no tasks running." };
  }
  if (/^(?:please\s+)?(?:pause|resume)\s+(?:all\s+)?(?:the\s+|that\s+|this\s+|my\s+)?(?:tasks?|bots?|work)\b/i.test(request)) {
    const pausing = /^(?:please\s+)?pause\b/i.test(request);
    const eligible = getState().sessions.filter(s => pausing ? live(s) && s.status !== 'paused' : s.status === 'paused');
    const chosen = /\ball\b/i.test(request) ? eligible : eligible.filter(s => s.chatId === botChatId(botId) || s.reportChatId === botChatId(botId)).slice(-1);
    chosen.forEach(s => (pausing ? pauseSession : resumeSession)(s.id));
    return {kind:'control', answer:chosen.length ? `${pausing ? 'Paused' : 'Resumed'} ${chosen.length} task${chosen.length === 1 ? '' : 's'}.` : `There are no tasks to ${pausing ? 'pause' : 'resume'}.`};
  }
  const clarification = clarificationFor(request);
  if (clarification) return { kind: "clarify", answer: clarification };
  if (/\b(?:status|updates?|progress|how.*(?:tasks?|bots?).*going|what.*(?:bots?|tasks?).*doing)\b/i.test(request)) {
    const tasks = getState().sessions.filter(s => !s.dismissed).slice(-20);
    const running = tasks.filter(live);
    const chosen = running.length ? running : tasks.slice(-3);
    return { kind: "status", answer: chosen.length ? chosen.map(s => `${bot(s.botId)?.name ?? s.title}: ${s.waitingOnYou ? s.answer : s.status === "done" ? "finished" : s.status === "failed" ? "stopped" : s.activity ?? s.status}`).join(". ") : "There are no tasks running." };
  }
  if (isComputerRequest(request)) return { kind: "task", request };
  // A short structured classification handles natural instructions without relying on a verb whitelist.
  if (/\b(?:hear me|are you there|date|time|hello|thank|how are you)\b/i.test(request)) return { kind: "conversation" };
  const base = (process.env.BOPS_LOCAL_LLM_URL ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
  try {
    const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(12000), body: JSON.stringify({ model: selectedModel('chat'), stream: false,
      format: { type: "object", properties: { task: { type: "boolean" } }, required: ["task"] },
      messages: [{ role: "system", content: `Classify the current utterance from ${ownerName()}. task=true if they want you to act on, inspect, read or change their computer, apps, websites, messages or files. Questions about their actual computer state are tasks. General knowledge and social conversation are not tasks. Return JSON only.` }, { role: "user", content: request }], options: { temperature: 0, num_predict: 30, num_ctx: 2048 } }) });
    if (response.ok && JSON.parse((await response.json()).message.content).task === true) return { kind: "task", request };
  } catch (error) { console.warn("Task classification unavailable", String(error)); }
  return { kind: "conversation" };
}
