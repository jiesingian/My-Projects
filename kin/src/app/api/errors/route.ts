import { NextResponse } from "next/server";
import { recordError } from "@/lib/error-capture-server";

/** Where a browser sends an error it caught (components/error-reporter.tsx):
 * open without a session, so the login page can report too. Only the kind,
 * the page's path, the message and the stack are read; they are scrubbed and
 * fingerprinted here, not trusted from the browser (lib/error-capture.ts).
 * log_app_error rate-limits across every instance; this keeps one instance
 * from even trying more than 60 a minute. */

const MAX_BODY = 8_000;
let windowStart = 0;
let inWindow = 0;

export async function POST(request: Request) {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    inWindow = 0;
  }
  if (++inWindow > 60) return new NextResponse(null, { status: 429 });

  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY) return new NextResponse(null, { status: 400 });
  let body: { route?: unknown; message?: unknown; stack?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof body.message !== "string") return new NextResponse(null, { status: 400 });

  await recordError("client", body.route, body.message, typeof body.stack === "string" ? body.stack : "");
  return new NextResponse(null, { status: 204 });
}
