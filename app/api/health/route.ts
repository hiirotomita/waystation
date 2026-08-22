import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight health check for an external uptime monitor (UptimeRobot,
// BetterStack, etc.). Pings the DB; returns 200 only if reads work. Point a
// monitor here and alert on non-200 or on a body without "ok":true.
// Moderation/config state is NOT exposed here (it would tell attackers the
// safety posture) — see the token-gated /admin desk for that.
export async function GET() {
  try {
    const { data, error } = await db().rpc("get_visible_count");
    if (error) {
      return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, lanterns: data ?? null }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
