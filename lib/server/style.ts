// lib/server/style.ts
import "server-only";
import { ownerName } from "./store";

export const WRITING = [
  "Write clearly and concisely:",
  "- Start with the answer, then add detail.",
  "- One fact per sentence. Short sentences.",
  "- Use active voice.",
  "- No filler openers or closers. No em dashes.",
  "- Answer in the language the user uses.",
].join("\n");


export const ASKING =
  'When you need the user to choose, ask in one sentence then add: "Options: <reply 1> | <reply 2>". 2 to 4 options. Only when you truly need their input.';

export function tidyAnswer(raw: string): { text: string; options?: string[] } {
  let options: string[] | undefined;
  const kept = raw.split(/\n{2,}/).map((para) =>
    para.split("\n").filter((line) => {
      const m = /^\s*\**options\**\s*:\s*(.+)$/i.exec(line);
      if (m) {
        const opts = m[1].split("|").map((o) => o.trim()).filter(Boolean);
        if (opts.length >= 2) options = opts.slice(0, 4);
        return false;
      }
      return true;
    }).join("\n"),
  ).filter((p) => p.trim());
  return { text: kept.join("\n\n").trim() || raw.trim(), options };
}

export const withBriefing = (input: string, brief: string) =>
  brief ? `${input}\n\n<context note="Background only, do not recite.">\n${brief}\n</context>` : input;

export const ABOUT_MICKY = `Micky is a local AI buddy that runs entirely on your computer. No cloud. No API costs after setup.
- You can chat with Micky and it answers from what it knows.
- Ask it to do tasks: open apps, search the web, read files, run code.
- Create specialist bots (Finance, Research, etc.) each with their own chat and personality.
- Call Micky and talk to it while it works in the background.
- Model inference runs locally. Website visits and downloads use the internet.`;
