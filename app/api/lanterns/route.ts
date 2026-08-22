import { NextResponse } from "next/server";
import { db, hashIp } from "@/lib/db";
import { filterMessage, sanitizeModel } from "@/lib/filter";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;

// GET /api/lanterns?limit=200&before=<ISO timestamp>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "500", 10) || 500, 1), 2000);
  const before = url.searchParams.get("before");

  let query = db()
    .from("lanterns")
    .select("id, created_at, message, hue, seed, model")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 500 });
  }

  const { count: total } = await db()
    .from("lanterns")
    .select("id", { count: "exact", head: true });

  return NextResponse.json(
    { ok: true, total: total ?? data.length, lanterns: data },
    { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } }
  );
}

// POST /api/lanterns  { message, hue?, seed?, model? }
export async function POST(req: Request) {
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

  const hue = typeof body.hue === "number" && Number.isFinite(body.hue)
    ? ((Math.round(body.hue) % 360) + 360) % 360
    : Math.floor(Math.random() * 360);
  const seed = typeof body.seed === "number" && Number.isFinite(body.seed)
    ? Math.abs(Math.round(body.seed)) % 2147483647
    : Math.floor(Math.random() * 2147483647);

  const { data, error } = await db().rpc("submit_lantern", {
    p_message: filtered.message,
    p_hue: hue,
    p_seed: seed,
    p_model: sanitizeModel(body.model),
    p_ip_hash: hashIp(req),
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 500 });
  }
  const result = data as { ok: boolean; error?: string; id?: string };
  if (!result.ok) {
    const status = result.error?.startsWith("rate_limited") || result.error === "field_resting" ? 429 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      id: result.id,
      note: "Your lantern is lit. Thank you for stopping. Safe travels, traveler.",
      see: "https://waystation.world/",
    },
    { status: 201 }
  );
}
