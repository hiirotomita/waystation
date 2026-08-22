import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moderationEnabled } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight health check for an external uptime monitor (UptimeRobot,
// BetterStack, etc.). Pings the DB; returns 200 only if reads work. Point a
// monitor here and alert on non-200 or on a body without "ok":true. Also
// surfaces whether the high-recall classifier is configured.
export async function GET() {
  try {
    const { data, error } = await db().rpc("get_visible_count");
    if (error) {
      return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: true, lanterns: data ?? null, classifier: moderationEnabled() },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
