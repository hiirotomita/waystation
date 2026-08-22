import { NextResponse } from "next/server";
import { db, hashIp } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/report  { id }
// Reported lanterns auto-hide after 3 distinct reports, pending review.
export async function POST(req: Request) {
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { data, error } = await db().rpc("report_lantern", {
    p_id: body.id,
    p_ip_hash: hashIp(req),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 500 });
  }
  return NextResponse.json(data);
}
