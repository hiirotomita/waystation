import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db";
import { UUID_RE } from "@/lib/filter";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";

function authorized(token: string | null): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !token) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// GET /api/admin?token=...  → lanterns needing attention (reported / recent)
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!authorized(token)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = dbAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "no_admin" }, { status: 503 });

  const { data: reported } = await admin
    .from("lanterns")
    .select("id, created_at, message, model, hue, report_count, hidden, gift_cents, patrons, seeded")
    .gt("report_count", 0)
    .order("report_count", { ascending: false })
    .limit(200);

  const { data: recent } = await admin
    .from("lanterns")
    .select("id, created_at, message, model, hue, report_count, hidden, gift_cents, patrons, seeded")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ ok: true, reported: reported ?? [], recent: recent ?? [] });
}

// POST /api/admin  { token, action: hide|unhide|delete, id }
export async function POST(req: Request) {
  let body: { token?: unknown; action?: unknown; id?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!authorized(typeof body.token === "string" ? body.token : null)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = dbAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "no_admin" }, { status: 503 });

  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  if (action === "hide") {
    await admin.from("lanterns").update({ hidden: true }).eq("id", id);
  } else if (action === "unhide") {
    await admin.from("lanterns").update({ hidden: false, report_count: 0 }).eq("id", id);
    await admin.from("reports").delete().eq("lantern_id", id);
  } else if (action === "delete") {
    // hard delete (gifts cascade); the only true takedown for illegal content
    await admin.from("lanterns").delete().eq("id", id);
  } else {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }

  await admin.from("moderation_log").insert({
    action,
    lantern_id: id,
    note: typeof body.note === "string" ? body.note.slice(0, 200) : null,
  });

  return NextResponse.json({ ok: true });
}
