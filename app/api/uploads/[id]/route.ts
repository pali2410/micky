import { uploadPath } from "@/lib/server/uploads";
import { readFileSync } from "node:fs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const f = uploadPath((await params).id);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(readFileSync(f.path), {
    headers: { "Content-Type": f.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
