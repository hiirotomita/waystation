import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db";
import { UUID_RE } from "@/lib/filter";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// Token comes from the Authorization header (never the query string, which
// lands in access logs).
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !token) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = dbAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "no_admin" }, { status: 503 });

  const { data: reported } = await admin
    .from("lanterns")
    .select("id, created_at, message, model, hue, report_count, hidden, deleted_at, gift_cents, patrons, seeded")
    .gt("report_count", 0)
    .is("deleted_at", null)
    .order("report_count", { ascending: false })
    .limit(200);

  const { data: hiddenRows } = await admin
    .from("lanterns")
    .select("id, created_at, message, model, hue, report_count, hidden, deleted_at, gift_cents, patrons, seeded")
    .eq("hidden", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: recent } = await admin
    .from("lanterns")
    .select("id, created_at, message, model, hue, report_count, hidden, deleted_at, gift_cents, patrons, seeded")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: settings } = await admin.from("settings").select("key, value");

  return NextResponse.json({
    ok: true,
    reported: reported ?? [],
    hidden: hiddenRows ?? [],
    recent: recent ?? [],
    settings: settings ?? [],
  });
}

// POST /api/admin  { action, id? }  (token in Authorization header)
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = dbAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "no_admin" }, { status: 503 });

  let body: { action?: unknown; id?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";

  // field-wide switches (no id)
  if (action === "close" || action === "open") {
    await admin.from("settings").update({ value: action === "open" }).eq("key", "accepting");
    await admin.from("moderation_log").insert({ action: `field_${action}`, note: null });
    return NextResponse.json({ ok: true });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 200) : null;

  if (action === "hide") {
    await admin.from("lanterns").update({ hidden: true }).eq("id", id);
  } else if (action === "unhide") {
    await admin.from("lanterns").update({ hidden: false, report_count: 0 }).eq("id", id);
    await admin.from("reports").delete().eq("lantern_id", id);
  } else if (action === "delete") {
    // soft delete: recoverable for 30 days, then reaped
    await admin.from("lanterns").update({ deleted_at: new Date().toISOString(), hidden: true }).eq("id", id);
  } else if (action === "restore") {
    await admin.from("lanterns").update({ deleted_at: null, hidden: false, report_count: 0 }).eq("id", id);
    await admin.from("reports").delete().eq("lantern_id", id);
  } else if (action === "purge") {
    // hard delete — for illegal content only (irreversible, gifts cascade)
    await admin.from("lanterns").delete().eq("id", id);
  } else {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }

  await admin.from("moderation_log").insert({ action, lantern_id: id, note });
  return NextResponse.json({ ok: true });
}
