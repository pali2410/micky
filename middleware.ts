import { NextResponse, type NextRequest } from "next/server";

// Desktop control routes accept same-origin app requests and local command-line clients.
export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const target = new URL(request.url);
    const allowed = [`http://localhost:${target.port || "3000"}`, `http://127.0.0.1:${target.port || "3000"}`];
    if (!allowed.includes(origin)) return NextResponse.json({ error: "This request did not come from Micky" }, { status: 403 });
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
