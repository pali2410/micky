export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const base = process.env.BOPS_HARNESS_URL ?? "http://127.0.0.1:8766";
  try {
    if (new URL(request.url).searchParams.has("screen")) {
      const res = await fetch(`${base}/screenshot`, { method: "POST", signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Screenshot failed (${res.status})`);
      const data = await res.json();
      return new Response(Buffer.from(data.image, "base64"), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
    }
    const res = await fetch(`${base}/windows`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Harness unavailable (${res.status})`);
    return Response.json({ ok: true, ...(await res.json()) });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 503 }); }
}
