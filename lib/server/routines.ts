// lib/server/routines.ts
import "server-only";
import { botChatId, type Routine, type Schedule } from "@/lib/types";
import { addMessage, bot, getState, id, ownerName, stateReady, update } from "./store";

function atTime(base: Date, time: string) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function nextRun(schedule: Schedule, from = Date.now()): number | undefined {
  if (schedule.kind === "once") return schedule.at > from ? schedule.at : undefined;
  for (let i = 0; i < 8; i++) {
    const day = new Date(from);
    day.setDate(new Date(from).getDate() + i);
    const t = atTime(day, schedule.time);
    if (t.getTime() <= from) continue;
    const dow = t.getDay();
    if (schedule.kind === "weekdays" && (dow === 0 || dow === 6)) continue;
    if (schedule.kind === "weekly" && dow !== schedule.day) continue;
    return t.getTime();
  }
}

export function describeSchedule(s: Schedule) {
  const clock = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? " AM" : " PM"}`;
  };
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  if (s.kind === "daily") return `Every day ${clock(s.time)}`;
  if (s.kind === "weekdays") return `Weekdays ${clock(s.time)}`;
  if (s.kind === "weekly") return `${days[s.day]}s ${clock(s.time)}`;
  const d = new Date(s.at);
  return `Once · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${clock(`${d.getHours()}:${d.getMinutes()}`)}`;
}

export function createRoutine(botId: string, title: string, goal: string, schedule: Schedule, opts: { reminder?: string } = {}): Routine {
  const r: Routine = { id: id("rtn"), botId, title, goal, schedule, enabled: true, nextRunAt: nextRun(schedule), reminder: opts.reminder?.trim() || undefined };
  update((s) => s.routines.push(r));
  return r;
}

export function setRoutineEnabled(routineId: string, enabled: boolean) {
  update((s) => {
    const r = s.routines.find((x) => x.id === routineId);
    if (!r) return;
    r.enabled = enabled;
    r.nextRunAt = enabled ? nextRun(r.schedule) : undefined;
  });
}

export function deleteRoutine(routineId: string) {
  update((s) => (s.routines = s.routines.filter((x) => x.id !== routineId)));
}

export function routinesNote(botIds: string[]) {
  const mine = getState().routines.filter((r) => botIds.includes(r.botId));
  if (!mine.length) return "Routines: none yet.";
  return `Routines:\n${mine.map((r) => `${r.id}: "${r.title}" · ${describeSchedule(r.schedule)}${r.enabled ? "" : " · paused"}`).join("\n")}`;
}

function tick() {
  if (!stateReady()) return;
  const now = Date.now();
  for (const r of getState().routines.filter((x) => x.enabled && x.nextRunAt && x.nextRunAt <= now)) {
    const b = bot(r.botId);
    if (!b) continue;
    if (r.reminder) {
      addMessage({ chatId: botChatId(b.id), role: "bot", botId: b.id, text: r.reminder });
    } else {
      void import("./sessions").then(({ startSession }) => {
        const s = startSession({ botId: b.id, goal: r.goal, title: r.title, chatId: botChatId(b.id), sentVia: "routine" });
        addMessage({ chatId: botChatId(b.id), role: "system", text: `Routine · ${describeSchedule(r.schedule)}`, sessionIds: [s.id] });
      });
    }
    update(() => {
      r.lastRunAt = now;
      r.nextRunAt = r.schedule.kind === "once" ? undefined : nextRun(r.schedule, now);
      if (r.schedule.kind === "once") r.enabled = false;
    });
  }
}

const gg = globalThis as any;
if (gg.__mickyRoutines) clearInterval(gg.__mickyRoutines);
gg.__mickyRoutines = setInterval(() => tick(), 20_000);
