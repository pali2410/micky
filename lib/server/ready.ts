// lib/server/ready.ts
import "server-only";
import { stateReady } from "./store";

export function notReady(): Response | null {
  return stateReady() ? null : Response.json({ error: "Micky is loading." }, { status: 409 });
}
