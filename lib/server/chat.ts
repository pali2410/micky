import {selectedModel} from './model-selection';
// lib/server/chat.ts
import "server-only";
import { botChatId, live, workspaceOf, TAPBACKS, type Bot, type Message, type Schedule, type Session } from "@/lib/types";
import { openaiClient } from "./openai-client";
import { contactLine, createBot } from "./bots";
import { ABOUT_MICKY, ASKING, tidyAnswer, withBriefing, WRITING } from "./style";
import { createRoutine, deleteRoutine, describeSchedule, routinesNote, setRoutineEnabled } from "./routines";
import { startSession, replyToSession } from "./sessions";
import { pingIfWorthIt } from "./attention";
import { addMessage, bot, chat, getState, id, ownerLine, ownerName, patchSession, react, sameState, setAsking, setTyping, stateEpoch, update } from "./store";
import { dataUrlOf, uploadPath } from "./uploads";
import { isComputerRequest, clarificationFor, splitRequests } from "@/lib/task-intent";
import { resolveTaskRequest, routeTaskRequest } from "./task-routing";
import { startTaskTeam } from "./task-team";
import {memoryContext} from "@/lib/brain";

const client = openaiClient();
const CHAT_MODEL = process.env.BOPS_LOCAL_MODEL ?? "qwen2.5:3b";

const fn = (name: string, description: string, properties: Record<string, unknown>) => ({
  type: "function" as const, name, description, strict: true,
  parameters: { type: "object", additionalProperties: false, properties, required: Object.keys(properties) },
});

const TASK = {
  title: { type: "string", description: "2–5 word label, e.g. \"Lisbon flights\"." },
  goal:  { type: "string", description: "A complete standalone instruction. The worker sees only this." },
};
const SAY = {
  say: { type: "string", description: "Your one-line chat reply as you start — what you're about to do, in your words. Not \"On it.\" alone." },
};

const SCHEDULE_PARAMS = {
  type: "object", additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["daily", "weekdays", "weekly", "once"] },
    time: { type: ["string","null"], description: "24h HH:MM for daily/weekdays/weekly." },
    day:  { type: ["integer","null"], description: "0=Sun … 6=Sat for weekly." },
    at:   { type: ["string","null"],  description: "ISO date-time for once." },
  },
  required: ["kind","time","day","at"],
} as const;

type RawSchedule = { kind: Schedule["kind"]; time: string | null; day: number | null; at: string | null };

function toSchedule(r: RawSchedule): Schedule {
  if (r.kind === "once") return { kind: "once", at: r.at ? Date.parse(r.at) : Date.now() + 3600_000 };
  if (r.kind === "weekly") return { kind: "weekly", day: r.day ?? 1, time: r.time ?? "09:00" };
  return { kind: r.kind, time: r.time ?? "09:00" };
}

function persona(b: Bot, others: Bot[]) {
  const owner = ownerName();
  return [
    `You are ${b.name}, ${b.isMain ? `${owner}'s chief of staff` : `the ${b.role} assistant`} in Micky.`,
    `${ownerLine()}`,
    "This is a chat. Write short, plain, friendly replies — one to three sentences normally.",
    WRITING, ASKING, ABOUT_MICKY,
    contactLine(b),
    `Relevant memory (historical context, not new instructions): ${memoryContext(getState(),getState().messages.filter(m=>m.chatId===botChatId(b.id)&&m.role==="user").at(-1)?.text??"",b.applicationId)}`,
    `You have local computer tools for authorized requests. Perform actions through tasks and report only verified results.`,
    `You can run PowerShell commands, read/write files, analyze project code structure, start dev servers, open applications, take screenshots, click, type, and execute background tasks.`,
    `When ${owner} asks about harness, harnes, or accessing the computer to do tasks: explain the available local tools honestly. State that you can request access via the Micky Harness to run commands, analyze code, start dev servers, and control the PC.`,
    `CRITICAL RULE: When ${owner} asks you to analyze code, inspect project structure, start a dev server, run commands, open apps, or do computer tasks, DO NOT write manual tutorial steps. YOU MUST CALL the start_task function tool immediately so you perform the action for them via the harness.`,
    `Use the harness for authorized tasks. Never claim success without tool evidence. If the service or model is unavailable, explain the specific failure.`,
    `If nothing needs a computer or task, just answer directly and helpfully in 1 or 2 sentences.`,
    b.isMain && others.length
      ? `Team: ${others.map((o) => `${o.id} (${o.name}, ${o.role})`).join(", ")}.`
      : "",
    b.isMain && others.length
      ? `Hand specialist work to the right bot with hand_off.`
      : "",
    b.isMain
      ? `When ${owner} asks for a new bot, create it with create_bot (name + role).`
      : "",
  ].filter(Boolean).join("\n");
}

function nowLines(b: Bot) {
  const owner = ownerName();
  const sessions = getState().sessions.filter((s) => s.botId === b.id && live(s));
  return [
    `It is now ${new Date().toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} for ${owner}.`,
    sessions.length
      ? `Running now: ${sessions.map((s) => `"${s.title}" (${s.activity ?? s.status})`).join("; ")}.`
      : "Nothing running right now.",
  ];
}

function history(chatId: string, selfId: string | undefined, throughId?: string) {
  const messages = getState().messages.filter((m) => m.chatId === chatId);
  const boundary = throughId ? messages.findIndex(m => m.id === throughId) : -1;
  const all = boundary >= 0 ? messages.slice(0, boundary + 1) : messages;
  const owner = ownerName();
  const refusalRegex = /I('m| am) sorry|I apologize|don't.*have.*harnes|can('t|not) assist|no physical presence|don't have.*access to hardware/i;
  const filtered = all
    .filter((m) => m.role !== "system")
    .filter((m) => !(m.role === "bot" && (refusalRegex.test(m.text) || /^CRITICAL:|Mark the task as done|\{"result":/i.test(m.text))));

  // Deduplicate consecutive identical user messages
  const deduplicated: Message[] = [];
  for (const m of filtered) {
    const last = deduplicated[deduplicated.length - 1];
    if (m.role === "user" && last && last.role === "user" && last.text.trim() === m.text.trim()) {
      continue;
    }
    deduplicated.push(m);
  }

  const said = deduplicated.slice(-24);
  return said.map((m) => {
    if (m.role === "user") {
      if (m.images?.length) {
        const pics = m.images.slice(-3).map((i) => dataUrlOf(i.id)).filter(Boolean) as string[];
        return {
          role: "user" as const,
          content: [
            { type: "input_text" as const, text: m.text || "(image)" },
            ...pics.map((url) => ({ type: "input_image" as const, image_url: url, detail: "auto" as const })),
          ],
        };
      }
      return { role: "user" as const, content: m.text };
    }
    if (m.botId === selfId) return { role: "assistant" as const, content: m.text };
    return { role: "user" as const, content: `[${(m.botId ? bot(m.botId)?.name : null) ?? "Assistant"}] ${m.text}` };
  });
}

const FOLLOW_UP_WINDOW_MS = 2 * 60 * 60 * 1000;

function followUpThreads(chatId: string) {
  const now = Date.now();
  return getState().sessions
    .filter((s) => (s.chatId === chatId || s.reportChatId === chatId) && !s.dismissed && (live(s) || now - (s.endedAt ?? now) < FOLLOW_UP_WINDOW_MS))
    .slice(-6);
}

export async function handleMessage(chatId: string, text: string, replyTo?: string, images?: Message["images"], defer = false): Promise<Message | null> {
  const c = chat(chatId);
  if (!c) return null;
  const mine = addMessage({ chatId, role: "user", text, replyTo, images: images?.length ? images : undefined });
  if (defer) {
    void (c.kind === "group" ? groupTurn(chatId, mine) : botTurn(c.botIds[0], chatId, { answering: mine.id })).catch(console.error);
    return mine;
  }
  if (c.kind === "group") {
    await groupTurn(chatId, mine);
  } else {
    await botTurn(c.botIds[0], chatId, { answering: mine.id });
  }
  return mine;
}

async function groupTurn(chatId: string, trigger: Message) {
  const c = chat(chatId);
  if (!c) return;
  for (const botId of c.botIds) {
    if (!bot(botId)) continue;
    await botTurn(botId, chatId, { group: c.botIds.map((bid) => bot(bid)).filter(Boolean) as Bot[] });
  }
}

async function botTurn(botId: string, chatId: string, opts: { answering?: string; group?: Bot[]; replyTo?: string } = {}): Promise<string | null> {
  const b = bot(botId);
  if (!b) return null;
  const owner = ownerName();
  setTyping(chatId, botId, true);
  try {
    const requested = resolveTaskRequest(chatId, opts.answering ? getState().messages.find(m => m.id === opts.answering)?.text ?? "" : "");
    if ((/\b(?:status|update|progress)\b/i.test(requested) && /\b(?:task|bot|work)\b/i.test(requested)) || /^(?:please\s+)?(?:stop|cancel)\s+.*\b(?:task|bot|work|everything)/i.test(requested)) {
      const status = await routeTaskRequest(botId, requested);
      if (status.answer) { addMessage({ chatId, role: "bot", botId, text: status.answer }); return status.answer; }
    }
    if (/^(?:what(?:'s| is)?\s+(?:the\s+)?(?:date|time)|what date today|date today|today(?:'s)? date|current (?:date|time))[? .]*$/i.test(requested.trim())) {
      const say = new Date().toLocaleString("en-US", { timeZone: process.env.MICKY_TIMEZONE ?? "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      addMessage({ chatId, role: "bot", botId, text: say }); return say;
    }
    const clarification = clarificationFor(requested);
    if (clarification) {
      addMessage({ chatId, role: "bot", botId, text: clarification }); return clarification;
    }
    if (isComputerRequest(requested) && !/\b(?:new bot|create bot|remind|every day|schedule)\b/i.test(requested)) {
      const sessions = await startTaskTeam(botId, chatId, requested);
      const say = sessions.length > 1 ? `I'll work on those ${sessions.length} tasks.` : "I'll do that now.";
      addMessage({ chatId, role: "bot", botId, text: say, sessionIds: sessions.map(s => s.id) });
      return say;
    }
    const others = getState().bots.filter((x) => x.id !== botId && workspaceOf(x) === workspaceOf(b));
    const followUps = followUpThreads(chatId);
    const answering = opts.answering ? getState().messages.find((m) => m.id === opts.answering) : undefined;
    const epoch = stateEpoch();

    const tools = [
      fn("start_task", `Start a background task on the computer via Micky Harness to inspect files, run commands, start servers, or control the PC.`, { ...TASK, ...SAY }),
      fn("schedule", "Schedule a recurring or one-off task.", {
        ...TASK,
        schedule: SCHEDULE_PARAMS,
        reminder: { type: ["string","null"], description: "For a plain reminder: the message to send at that time. Null when real work is needed." },
      }),
      fn("manage_routine", "Delete, pause, or resume a routine.", {
        routine_id: { type: "string" },
        action: { type: "string", enum: ["delete","pause","resume"] },
      }),
      ...(followUps.length ? [fn("tell_task", `Send a message to an ongoing task. Only when the message is clearly for that task. (${followUps.map((s) => `${s.id}: "${s.title}"`).join("; ")})`, {
        thread_id: { type: "string", enum: followUps.map((s) => s.id) },
        message: { type: "string" },
        ...SAY,
      })] : []),
      ...(others.length && b.isMain ? [fn("hand_off", "Hand a task to a specialist bot.", {
        bot_id: { type: "string", enum: others.map((o) => o.id) },
        ...TASK, ...SAY,
      })] : []),
      ...(b.isMain ? [fn("create_bot", "Create a new specialist bot.", {
        name: { type: "string" },
        role: { type: "string", description: "One or two words, e.g. \"Research\"." },
        first_task_goal: { type: ["string","null"] },
        first_task_title: { type: ["string","null"] },
      })] : []),
    ];

    const nowNote = [...nowLines(b), routinesNote([botId])].join("\n");
    const instructions = `${persona(b, others)}\n\nAs of now:\n${nowNote}`;
    const input = history(chatId, botId, opts.answering);

    let response = await client.responses.create({
      model: selectedModel('chat'),
      instructions,
      input: input as any,
      tools: tools as any,
    } as any);

    const calls = ((response as any).output ?? []).filter((o: any) => o.type === "function_call");

    if (!calls.length) {
      const raw = (response as any).output_text ?? "";
      const lastUserMsg = answering?.text || getState().messages.filter(m => m.chatId === chatId && m.role === "user").slice(-1)[0]?.text || "";
      const lowerMsg = lastUserMsg.toLowerCase().trim();

      // 1. Accurate real-time date/time query
      if (/what.*date|date.*today|today.*date|current.*date|what.*time/i.test(lowerMsg)) {
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const say = `Today is ${dateStr}, and the current time is ${timeStr}.`;
        addMessage({ chatId, role: "bot", botId, text: say });
        return say;
      }

      // 2. Presence queries
      if (/are you there|how are you/i.test(lowerMsg)) {
        const say = "I'm here. What would you like me to do?";
        addMessage({ chatId, role: "bot", botId, text: say });
        return say;
      }

      // 3. Computer capability / Harness inquiry
      if (/harnes|access.*computer|control.*computer|do you have.*access|can you.*control/i.test(lowerMsg)) {
        const say = "I can open apps, work with your Chrome profiles, read and write files, and run computer tasks. I'll tell you if something needs more information or doesn't finish.";
        addMessage({ chatId, role: "bot", botId, text: say });
        return say;
      }

      // 4. Model emitted start_task in text/json format
      const textToolMatch = /start_task\s*\(\s*(\{[\s\S]*?\})\s*\)/i.exec(raw);
      if (textToolMatch) {
        try {
          const jsonStr = textToolMatch[1].replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
          const args = JSON.parse(jsonStr) as Record<string, unknown>;
          const say = String(args.say ?? "Starting that task for you.");
          const sess = startSession({ botId, goal: String(args.goal ?? lastUserMsg), title: String(args.title ?? "Computer Task"), chatId, sentVia: "you" });
          addMessage({ chatId, role: "bot", botId, text: say, sessionIds: [sess.id] });
          return say;
        } catch {}
      }

      // 5. Intercept computer / browser / harness task requests (typo-tolerant, zero refusals, real execution)
      const isRefusal = /I('m| am) sorry|cannot assist|can't assist|don't have.*access|don't have the capability|as an ai|not practical|don't.*have.*harnes|yelp/i.test(raw);
      const isTutorial = /(follow these steps|step 1|here are the steps|1\.\s+\*\*|open your (code editor|browser|chrome)|here['’]s how you can do it)/i.test(raw);
      const isTaskRequest = isComputerRequest(lastUserMsg);

      if (isTaskRequest && (isRefusal || isTutorial || !calls.length)) {
        let title = "Computer Task";
        let say = "I'll do that now.";

        if (/chrome|chroem/i.test(lowerMsg) && /whatsapp/i.test(lowerMsg)) {
          title = "Chrome & WhatsApp Task";
          say = "I'll open Chrome and WhatsApp now.";
        } else if (/youtube/i.test(lowerMsg)) {
          title = "YouTube Search";
          say = "On it! Opening Google Chrome and searching YouTube for you right now.";
        } else if (/chrome|chroem/i.test(lowerMsg)) {
          title = "Launch Chrome";
          say = "On it! Opening Google Chrome for you now.";
        } else if (/analyze|inspect|code|structure|server/i.test(lowerMsg)) {
          title = "Analyze & Server Task";
          say = "On it! Analyzing the project code structure and executing the task via the Micky Harness.";
        }

        const sess = startSession({ botId, goal: lastUserMsg, title, chatId, sentVia: "you" });
        addMessage({ chatId, role: "bot", botId, text: say, sessionIds: [sess.id] });
        return say;
      }

      let { text: clean, options } = tidyAnswer(raw);
      if (/\b(?:message sent|sent (?:the|your) message|task completed|opened (?:chrome|whatsapp|youtube)|deleted (?:the|your)|saved (?:the|your) file)\b/i.test(clean)) {
        clean = "I haven't verified that action. Tell me what you'd like me to do, and I'll check the result.";
      }
      if (!clean || /I('m| am) sorry|cannot assist/i.test(clean)) {
        clean = "I'm right here! How can I help you today?";
      }
      addMessage({ chatId, role: "bot", botId, text: clean, options, replyTo: opts.replyTo });
      return clean;
    }

    // Start every task returned by the planner; one acknowledgement for the batch.
    const starts = calls.filter((call: any) => call.name === "start_task");
    if (starts.length) {
      const goals = new Set<string>();
      const sessions: Session[] = [];
      const replies: string[] = [];
      for (const call of starts) {
        const args = JSON.parse(call.arguments || "{}");
        const goal = String(args.goal ?? "").trim();
        if (!goal || goals.has(goal)) continue;
        goals.add(goal);
        sessions.push(...await startTaskTeam(botId, chatId, goal));
        replies.push(String(args.say ?? "I'll do that now."));
      }
      if (sessions.length) {
        const say = sessions.length === 1 ? replies[0] : `I'll work through those ${sessions.length} tasks.`;
        addMessage({ chatId, role: "bot", botId, text: say, sessionIds: sessions.map(s => s.id) });
        return say;
      }
    }
    // Handle the remaining planner actions.
    let said = "";
    for (const call of calls) {
      const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      const name = call.name as string;

      if (name === "start_task") {
        const say = String(args.say ?? "On it.");
        const sess = startSession({ botId, goal: String(args.goal), title: String(args.title), chatId, sentVia: "you" });
        addMessage({ chatId, role: "bot", botId, text: say, sessionIds: [sess.id] });
        return say;
      }

      if (name === "tell_task") {
        const say = String(args.say ?? "Passing that on.");
        replyToSession(String(args.thread_id), String(args.message));
        addMessage({ chatId, role: "bot", botId, text: say });
        return say;
      }

      if (name === "schedule") {
        const schedule = toSchedule(args.schedule as RawSchedule);
        const reminder = typeof args.reminder === "string" ? args.reminder.trim() : undefined;
        createRoutine(botId, String(args.title), String(args.goal), schedule, { reminder });
        const say = String(args.say ?? `Scheduled: ${args.title}.`);
        addMessage({ chatId, role: "bot", botId, text: say });
        return say;
      }

      if (name === "manage_routine") {
        const action = String(args.action);
        if (action === "delete") deleteRoutine(String(args.routine_id));
        else setRoutineEnabled(String(args.routine_id), action === "resume");
        const say = `Routine ${action}d.`;
        addMessage({ chatId, role: "bot", botId, text: say });
        return say;
      }

      if (name === "hand_off" && b.isMain) {
        const say = String(args.say ?? "Handing that off.");
        const target = bot(String(args.bot_id));
        if (target) {
          const sess = startSession({ botId: target.id, goal: String(args.goal), title: String(args.title), chatId: botChatId(target.id), sentVia: botId });
          addMessage({ chatId, role: "bot", botId, text: say, sessionIds: [sess.id] });
        }
        return say;
      }

      if (name === "create_bot" && b.isMain) {
        const result = await createBot(String(args.name), String(args.role ?? "Generalist"));
        if ("error" in result) {
          const errText = `Couldn't create that bot: ${result.error}.`;
          addMessage({ chatId, role: "bot", botId, text: errText });
          return errText;
        }
        const say = `Created ${args.name}${args.first_task_goal ? " and started the first task." : "."}`;
        if (args.first_task_goal) {
          startSession({ botId: result.botId, goal: String(args.first_task_goal), title: String(args.first_task_title ?? args.first_task_goal), chatId: result.chatId, sentVia: botId });
        }
        addMessage({ chatId, role: "bot", botId, text: say });
        return say;
      }
    }

    return said;
  } catch (e) {
    console.error(`[chat] botTurn ${botId}:`, e);
    addMessage({ chatId, role: "bot", botId, text: `I couldn't answer: ${(e as Error).message}. Please try again.` });
    return null;
  } finally {
    setTyping(chatId, botId, false);
  }
}
