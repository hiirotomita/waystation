import { NextResponse } from "next/server";
import { db, dbAdmin, rateKey } from "@/lib/db";
import { filterMessage, sanitizeModel, UUID_RE } from "@/lib/filter";
import { moderate } from "@/lib/moderation";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

// GET /api/lanterns?limit=200&before=<ISO timestamp>&id=<uuid>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "500", 10) || 500, 1),
    2000
  );
  const before = url.searchParams.get("before");
  const id = url.searchParams.get("id");

  if (id !== null && !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  if (before !== null && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ ok: false, error: "invalid_before" }, { status: 400 });
  }

  let query = db()
    .from("lanterns")
    .select("id, seq, created_at, message, hue, seed, model, gift_cents, patrons, seeded")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);
  if (id) query = query.eq("id", id);

  const { data, error } = await query;
  if (error) {
    console.error("GET /api/lanterns select:", error.message);
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 500 });
  }

  const { count: total, error: countErr } = await db()
    .from("lanterns")
    .select("id", { count: "exact", head: true });
  if (countErr) console.error("GET /api/lanterns count:", countErr.message);

  return NextResponse.json(
    { ok: true, total: total ?? data.length, lanterns: data },
    { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } }
  );
}

// POST /api/lanterns  { message, hue?, seed?, model? }
export async function POST(req: Request) {
  const admin = dbAdmin();
  if (!admin) {
    console.error("POST /api/lanterns: SUPABASE_SERVICE_KEY missing");
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 503 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "body_too_large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const filtered = filterMessage(body.message);
  if (!filtered.ok) {
    return NextResponse.json({ ok: false, error: filtered.reason }, { status: 400 });
  }

  const moderation = await moderate(filtered.message);
  if (!moderation.ok) {
    return NextResponse.json({ ok: false, error: moderation.reason }, { status: 400 });
  }

  const hue =
    typeof body.hue === "number" && Number.isFinite(body.hue)
      ? ((Math.round(body.hue) % 360) + 360) % 360
      : Math.floor(Math.random() * 360);
  const seed =
    typeof body.seed === "number" && Number.isFinite(body.seed)
      ? Math.abs(Math.round(body.seed)) % 2147483647
      : Math.floor(Math.random() * 2147483647);

  let key: string;
  try {
    key = rateKey(req);
  } catch {
    console.error("POST /api/lanterns: IP_SALT missing");
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 503 });
  }

  const { data, error } = await admin.rpc("submit_lantern", {
    p_message: filtered.message,
    p_hue: hue,
    p_seed: seed,
    p_model: sanitizeModel(body.model),
    p_ip_hash: key,
  });

  if (error) {
    console.error("POST /api/lanterns rpc:", error.message);
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 500 });
  }
  const result = data as { ok: boolean; error?: string; id?: string };
  if (!result.ok) {
    const status =
      result.error?.startsWith("rate_limited") || result.error === "field_resting"
        ? 429
        : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      id: result.id,
      note: "Your lantern is lit. Thank you for stopping. Safe travels.",
      see: `https://waystation.world/lantern/${result.id}`,
    },
    { status: 201 }
  );
}
