// lib/server/uploads.ts
import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { id, userDir } from "./store";

const uploadsDir = () => { const d = userDir(); return d ? join(d, "uploads") : null; };
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export function saveUpload(dataUrl: string) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m || !TYPES[m[1].toLowerCase()]) throw new Error("only PNG, JPEG, WebP or GIF");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 12 * 1024 * 1024) throw new Error("image too large (12 MB max)");
  const DIR = uploadsDir();
  if (!DIR) throw new Error("no data directory");
  mkdirSync(DIR, { recursive: true });
  const upId = id("img");
  writeFileSync(join(DIR, `${upId}.${TYPES[m[1].toLowerCase()]}`), buf);
  return { id: upId, type: m[1].toLowerCase() };
}

export function uploadPath(upId: string) {
  const DIR = uploadsDir();
  if (!DIR || !/^img_[a-z0-9]+$/i.test(upId)) return null;
  for (const [type, ext] of Object.entries(TYPES)) {
    const p = join(DIR, `${upId}.${ext}`);
    if (existsSync(p)) return { path: p, type };
  }
  return null;
}

export function dataUrlOf(upId: string) {
  const f = uploadPath(upId);
  return f ? `data:${f.type};base64,${readFileSync(f.path).toString("base64")}` : null;
}
