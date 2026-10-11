import { saveUpload } from "@/lib/server/uploads";
import { notReady } from "@/lib/server/ready";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = notReady();
  if (blocked) return blocked;
  const { data } = await request.json();
  try {
    return Response.json(saveUpload(data));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
