import "@/lib/server/routines";
import "@/lib/server/attention";
import { getState, getVersion } from "@/lib/server/store";
import {recoverQueuedSessions} from '@/lib/server/sessions';
import {refreshApplications} from '@/lib/server/application-health';

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  recoverQueuedSessions();
  void refreshApplications().catch(()=>{});
  const have = new URL(request.url).searchParams.get("v");
  const version = getVersion();
  if (have !== null && Number(have) === version) return Response.json({ version });
  return Response.json({ version, state: getState() });
}

export async function POST(request: Request) {
  const { owner } = (await request.json().catch(() => ({}))) as { owner?: { name?: string; about?: string } };
  if (owner) {
    const { update } = await import("@/lib/server/store");
    update((s) => {
      s.owner = { name: owner.name ?? s.owner?.name ?? "", about: owner.about ?? s.owner?.about };
    });
  }
  return Response.json({ ok: true });
}
