"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Bot, Chat, Message, Session } from "@/lib/types";
import { botChatId, live } from "@/lib/types";
import { isTaskBot, rootTaskChat, tasksInChat } from "@/lib/task-chats";
import { MickyFace, type FaceState } from "@/components/micky/face";
import dynamic from 'next/dynamic';
const NativeIntegrations = dynamic(()=>import('./native-integrations').then(m=>m.NativeIntegrations),{ssr:false});
const RobotStudio = dynamic(() => import('./robot-studio').then(m => m.RobotStudio), {ssr:false});
const VoiceControl = dynamic(() => import('./voice-control').then(m=>m.VoiceControl),{ssr:false});
const BrainPanel = dynamic(() => import('./brain-panel').then(m=>m.BrainPanel),{ssr:false});
const SystemVisualization = dynamic(() => import('./system-visualization').then(m => m.SystemVisualization), { ssr:false });

// ── State polling ─────────────────────────────────────────────────────────────

function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const versionRef = useRef<number>(-1);
  const pending=useRef<Promise<void>|null>(null);
  const busy=useRef(false);

  const refresh = useCallback(() => {
    if(pending.current)return pending.current;
    pending.current=(async()=>{
    try {
      const res = await fetch(`/api/state?v=${versionRef.current}`, { cache: "no-store",signal:AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as { version: number; state?: AppState };
        versionRef.current = data.version;
        if (data.state) {busy.current=data.state.sessions.some(live);setState(data.state);}
      }
    } catch { /* ignore */ }
    })().finally(()=>{pending.current=null;});
    return pending.current;
  }, []);

  useEffect(() => {
    let active = true;
    let timer:ReturnType<typeof setTimeout>;
    let sequence=0;
    const poll = async () => {
      const current=++sequence;
      if(!document.hidden)await refresh();
      if (active&&current===sequence) timer=setTimeout(poll,document.hidden?10000:busy.current?1000:3000);
    };
    const visible=()=>{if(!document.hidden){clearTimeout(timer);void poll();}};
    document.addEventListener('visibilitychange',visible);
    const events=new EventSource('/api/events');
    events.onmessage=()=>{if(!document.hidden)void refresh();};
    poll();
    return () => { active = false;events.close();clearTimeout(timer);document.removeEventListener('visibilitychange',visible); };
  }, [refresh]);

  return { state, refresh };
}

// ── Chat view ─────────────────────────────────────────────────────────────────

function ChatView({ chatId, state, botColor, onRefresh }: { chatId: string; state: AppState; botColor: string; onRefresh?: () => void }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const [visibleCount,setVisibleCount]=useState(80);
  useEffect(()=>setVisibleCount(80),[chatId]);

  // Clear optimistic messages once server state includes them
  useEffect(() => {
    setOptimistic((prev) => {
      if(!prev.length)return prev;
      const next=prev.filter((opt) => !state.messages.some((m) => m.chatId === chatId && m.text === opt.text && m.role === "user" && m.at >= opt.at - 3000));
      return next.length===prev.length?prev:next;
    });
  }, [state.messages, chatId]);

  // Combine server messages with instant optimistic messages
  const allMessages = useMemo(() => {
    const serverMsgs = state.messages.filter((m) => m.chatId === chatId);
    return [...serverMsgs, ...optimistic].sort((a, b) => a.at - b.at);
  }, [state.messages, optimistic, chatId]);

  const sessions = useMemo(()=>tasksInChat(state,chatId).filter(live),[state.sessions,state.bots,chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || sendLock.current) return;
    sendLock.current = true; setSendError(null);

    // Instant optimistic update (0ms delay)
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      chatId,
      role: "user",
      text,
      at: Date.now(),
    };
    setOptimistic((prev) => [...prev, tempMsg]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(`Send failed (${response.status})`);
      void fetch(`/api/chats/${chatId}/read`, { method: "POST" });
      if (onRefresh) onRefresh();
    } catch (e) {
      setSendError((e as Error).message);
      setOptimistic(prev => prev.filter(m => m.id !== tempMsg.id));
      setInput(text);
    } finally {
      sendLock.current = false;
      setSending(false);
      if (onRefresh) onRefresh();
    }
  };

  const botTyping = state.chats.find((c) => c.id === chatId)?.typing ?? [];
  const isTyping = sending || botTyping.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#141416]">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 overscroll-contain">
        {allMessages.length>visibleCount&&<button className="block mx-auto text-xs text-zinc-400 py-2" onClick={()=>setVisibleCount(count=>count+80)}>Load earlier messages ({allMessages.length-visibleCount})</button>}
        {allMessages.slice(-visibleCount).map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[#27272a] text-[#f4f4f5] border border-[#3f3f46]/70 shadow-sm"
                  : m.role === "system"
                  ? "text-[#71717a] text-xs px-2 py-1 italic"
                  : "bg-[#1c1c20] text-[#f4f4f5] border border-[#2e2e34] shadow-sm"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.options && m.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {m.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setInput(opt)}
                      className="text-xs bg-[#27272a] text-[#e4e4e7] border border-[#3f3f46] rounded-full px-3 py-1 hover:bg-[#3f3f46] transition-colors"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Live Running Sessions */}
        {sessions.length > 1 && <p className="text-xs text-[#a1a1aa]">{sessions.length} tasks running</p>}
        {sessions.map((s) => (
          <div key={s.id} data-running-task={s.id} className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed border border-[#3b82f6]/40 bg-[#171c26] text-[#93c5fd]">
              <div className="font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse" />
                {s.title}
              </div>
              <div className="text-[#bfdbfe] mt-1">{s.activity ?? s.status}</div>
              <button className="mt-2 text-[#d4d4d8] hover:text-white" onClick={() => void fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", id: s.id }) }).then(() => onRefresh?.())}>Stop this task</button>
              {s.steps.slice(-2).map((step, i) => (
                <div key={i} className="opacity-70 truncate mt-0.5 text-[#93c5fd]">
                  • {step.detail}
                </div>
              ))}
            </div>
          </div>
        ))}

        {sendError && <p role="alert" className="text-sm text-red-400">{sendError}</p>}
        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-[#1c1c20] border border-[#2e2e34]">
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#E9FF3B] animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Bar */}
      {state.chats.find(c=>c.id===chatId)?.botIds.includes("micky")&&<VoiceControl state={state} chatId={chatId} onRefresh={()=>{void onRefresh?.();}}/>}
      <div className="p-4 border-t border-[#27272a] bg-[#18181b]">
        <div className="flex gap-2.5 items-end max-w-4xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Message ${
              state.chats.find((c) => c.id === chatId)?.botIds.map((id) => state.bots.find((b) => b.id === id)?.name ?? id).join(", ") ?? "Micky"
            }…`}
            className="flex-1 resize-none rounded-2xl bg-[#141416] text-[#f4f4f5] border border-[#2e2e34] px-4 py-3 text-sm leading-relaxed outline-none focus:border-[#E9FF3B] placeholder-[#71717a] min-h-[48px] max-h-[140px] transition-colors"
            rows={1}
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || sending}
            className="h-11 w-11 rounded-2xl bg-[#E9FF3B] text-black font-bold flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#d8ed30] transition-transform active:scale-95 shadow-md flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M8 13V3M3 8l5-5 5 5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bot list item ─────────────────────────────────────────────────────────────

function BotItem({
  bot,
  state,
  selected,
  onClick,
}: {
  bot: Bot;
  state: AppState;
  selected: boolean;
  onClick: () => void;
}) {
  const chatId = botChatId(bot.id);
  const lastMsg = [...state.messages].reverse().find((m) => m.chatId === chatId && m.role !== "system");
  const unread =
    !state.chats.find((c) => c.id === chatId)?.readAt ||
    (lastMsg && lastMsg.at > (state.chats.find((c) => c.id === chatId)?.readAt ?? 0));
  const typing = state.chats.find((c) => c.id === chatId)?.typing?.length ?? 0;
  const runningSessions = tasksInChat(state, chatId).filter(live);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors rounded-xl mx-auto my-1 ${
        selected ? "bg-[#27272a] text-white" : "text-[#d4d4d8] hover:bg-[#1f1f23]"
      }`}
      style={{ width: "calc(100% - 16px)" }}
    >
      <div className="relative flex-shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
          style={{ background: `color-mix(in oklab, ${bot.color} 25%, #18181b)` }}
        >
          <MickyFace state={runningSessions.length ? "working" : "idle"} size={36} color={bot.color} />
        </div>
        {runningSessions.length > 0 && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#E9FF3B] border-2 border-[#18181b] animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-sm truncate ${unread ? "font-bold text-white" : "font-medium text-[#f4f4f5]"}`}>
            {bot.name}
          </span>
          {lastMsg && (
            <span className="text-[11px] text-[#71717a] ml-1 flex-shrink-0">
              {new Date(lastMsg.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className={`text-xs truncate mt-0.5 ${unread ? "text-[#E9FF3B] font-semibold" : "text-[#a1a1aa]"}`}>
          {typing ? "typing…" : lastMsg?.text.slice(0, 60) ?? bot.role}
        </div>
      </div>
    </button>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────

export function MickyApp() {
  const { state, refresh } = useAppState();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [module, setModule] = useState<'chat'|'openmaus'|'visualization'|'robot'|'brain'|'maus-monitor'|'rakazo-monitor'|'bigfoot'|'heyjev'>('chat');
  const [showNewBot, setShowNewBot] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [newBotRole, setNewBotRole] = useState("");

  // Select main bot chat on first load
  useEffect(() => {
    if (!state) return;
    if (selectedChatId) {
      const root = rootTaskChat(state, selectedChatId);
      if (root !== selectedChatId) setSelectedChatId(root);
      return;
    }
    const main = state.bots.find((b) => b.isMain);
    if (main) setSelectedChatId(botChatId(main.id));
  }, [state, selectedChatId]);

  if (!state)
    return (
      <div className="flex h-screen items-center justify-center bg-[#141416] text-[#a1a1aa]">
        <div className="flex flex-col items-center gap-4">
          <div style={{ animation: "bob 2s ease-in-out infinite" }}>
            <MickyFace state="thinking" size={80} color="#E9FF3B" />
          </div>
          <span className="text-sm font-medium text-[#f4f4f5]">Starting Micky…</span>
        </div>
      </div>
    );

  const selectedBot = state.bots.find((b) => botChatId(b.id) === selectedChatId);
  const owner = state.owner?.name || "You";

  const createBot = async () => {
    if (!newBotName.trim()) return;
    await fetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBotName, role: newBotRole }),
    });
    setShowNewBot(false);
    setNewBotName("");
    setNewBotRole("");
  };

  return (
    <div className="flex h-screen bg-[#141416] text-[#f4f4f5] overflow-hidden select-none">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-[#27272a] bg-[#18181b] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MickyFace state="idle" size={28} color="#E9FF3B" />
            <span className="font-bold text-sm tracking-wide text-white">Micky</span>
          </div>
          <button
            onClick={() => setShowNewBot(true)}
            className="w-7 h-7 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] flex items-center justify-center text-[#d4d4d8] transition-colors"
            title="Create specialist bot"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 1v10M1 6h10" />
            </svg>
          </button>
        </div>

        {/* Bot list */}
        <div className="px-3 py-3 border-b border-[#27272a] flex flex-col gap-1">
          {([['chat','Micky chats'],['maus-monitor','Maus monitoring'],['rakazo-monitor','Rakazo monitoring'],['brain','Super Brain'],['bigfoot','Bigfoot desktop'],['heyjev','HeyJev voice'],['openmaus','Switch to Maus'],['rakazo','Rakazo workspace'],['visualization','Visualization'],['robot','Robot studio']] as const).map(([id,label])=><button key={id} onClick={()=>{
            if (['openmaus','rakazo'].includes(id)) {
              const bridge = (window as any).mickyElectron;
              if (bridge?.switchApp) void bridge.switchApp(id==='openmaus'?'maus':id).catch((error:Error)=>window.alert(error.message));
              else window.location.assign(id==='openmaus'?'http://127.0.0.1:8799':'http://127.0.0.1:5173');
            } else setModule(id as typeof module);
          }} className={`text-left px-3 py-2 rounded-lg text-xs font-medium ${module===id?'bg-[#303425] text-[#E9FF3B]':'text-[#a1a1aa] hover:bg-[#27272a]'}`}>{label}</button>)}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {state.bots.filter(bot => !isTaskBot(state, bot)).map((bot) => (
            <BotItem
              key={bot.id}
              bot={bot}
              state={state}
              selected={selectedChatId === botChatId(bot.id)}
              onClick={() => {
                setModule('chat');
                setSelectedChatId(botChatId(bot.id));
                void fetch(`/api/chats/${botChatId(bot.id)}/read`, { method: "POST" });
              }}
            />
          ))}
        </div>

        {/* Owner profile footer */}
        <div className="px-4 py-3 border-t border-[#27272a] text-xs text-[#71717a] flex items-center justify-between">
          <span>{owner !== "you" ? `Buddy to ${owner}` : "Local Desktop Buddy"}</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Connected" />
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#141416]">
        {module==='bigfoot'||module==='heyjev'?<NativeIntegrations mode={module}/>:module === 'brain'||module.endsWith('-monitor') ? <BrainPanel state={state} applicationId={module.endsWith('-monitor')?module.replace('-monitor','') as 'maus'|'rakazo':undefined} onRefresh={refresh}/> : module === 'robot' ? <RobotStudio/> : module === 'visualization' ? <SystemVisualization /> : module === 'openmaus' ? <div className="flex flex-col h-full"><div className="px-6 py-3 border-b border-[#27272a]"><h1 className="font-semibold">OpenMausBot workspace</h1><p className="text-xs text-[#a1a1aa]">Teams, memory, skills, schedules and connected apps · shared local models</p></div><iframe title="OpenMausBot integrated workspace" src="http://127.0.0.1:8799" className="flex-1 w-full border-0" allow="clipboard-write" /></div> : selectedChatId && selectedBot ? (
          <>
            {/* Chat header (fixed, never scrolls) */}
            <div className="flex-shrink-0 px-6 py-3.5 border-b border-[#27272a] bg-[#18181b] flex items-center justify-between z-20">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden"
                  style={{ background: `color-mix(in oklab, ${selectedBot.color} 25%, #18181b)` }}
                >
                  <MickyFace state="idle" size={32} color={selectedBot.color} />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">{selectedBot.name}</div>
                  <div className="text-xs text-[#a1a1aa]">{selectedBot.role}</div>
                </div>
              </div>
            </div>


            <ChatView chatId={selectedChatId} state={state} botColor={selectedBot.color} onRefresh={refresh} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#71717a]">
            <div className="text-center">
              <div className="mb-4" style={{ animation: "bob 3s ease-in-out infinite" }}>
                <MickyFace state="idle" size={80} color="#E9FF3B" />
              </div>
              <p className="text-sm">Select a bot to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {/* New Bot Modal */}
      {showNewBot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowNewBot(false)}>
          <div className="bg-[#1c1c20] border border-[#2e2e34] rounded-2xl p-6 w-84 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-base text-white mb-4">Create Specialist Bot</h2>
            <div className="space-y-3.5">
              <div>
                <label className="text-xs text-[#a1a1aa] mb-1.5 block">Bot Name</label>
                <input
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="e.g. Nova, Atlas, Jarvis"
                  className="w-full bg-[#141416] border border-[#2e2e34] rounded-xl px-3.5 py-2 text-sm text-white outline-none focus:border-[#E9FF3B]"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-[#a1a1aa] mb-1.5 block">Role / Specialization</label>
                <input
                  value={newBotRole}
                  onChange={(e) => setNewBotRole(e.target.value)}
                  placeholder="e.g. Researcher, Code Reviewer, Secretary"
                  className="w-full bg-[#141416] border border-[#2e2e34] rounded-xl px-3.5 py-2 text-sm text-white outline-none focus:border-[#E9FF3B]"
                />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => setShowNewBot(false)}
                  className="flex-1 rounded-xl border border-[#2e2e34] bg-[#27272a] py-2 text-sm text-[#d4d4d8] hover:bg-[#3f3f46] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void createBot()}
                  disabled={!newBotName.trim()}
                  className="flex-1 rounded-xl bg-[#E9FF3B] text-black font-semibold py-2 text-sm disabled:opacity-40 hover:bg-[#d8ed30] transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

