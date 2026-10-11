import { patchSession, update } from "@/lib/server/store";
import { notReady } from "@/lib/server/ready";
import { replyToSession, cancelSession,pauseSession,resumeSession } from "@/lib/server/sessions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = notReady();
  if (blocked) return blocked;
  const req = await request.json();
  if(req.action==='pause'){pauseSession(req.id);
  }else if(req.action==='resume'){resumeSession(req.id);
  }else if (req.action === "dismiss") {
    patchSession(req.id, { dismissed: true });
  } else if (req.action === "cancel") {
    cancelSession(req.id);
  } else if (req.action === "reply") {
    replyToSession(req.id, req.text);
  }
  return Response.json({ ok: true });
}
