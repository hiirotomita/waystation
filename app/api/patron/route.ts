import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCheckoutSession, stripeEnabled } from "@/lib/stripe";

export const runtime = "nodejs";

function requestOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "waystation.world";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// POST /api/patron  { lantern_id, amount_cents, patron_name? }
export async function POST(req: Request) {
  if (!stripeEnabled()) {
    return NextResponse.json({ ok: false, error: "gifts_not_open_yet" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const lanternId = typeof body.lantern_id === "string" ? body.lantern_id : "";
  if (!/^[0-9a-f-]{36}$/.test(lanternId)) {
    return NextResponse.json({ ok: false, error: "invalid_lantern" }, { status: 400 });
  }

  const amount = typeof body.amount_cents === "number" ? Math.round(body.amount_cents) : NaN;
  if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) {
    return NextResponse.json(
      { ok: false, error: "amount_must_be_100_to_1000000_cents" },
      { status: 400 }
    );
  }

  const patronName =
    typeof body.patron_name === "string"
      ? body.patron_name.replace(/\s+/g, " ").trim().slice(0, 40) || null
      : null;

  const { data: lantern } = await db()
    .from("lanterns")
    .select("id")
    .eq("id", lanternId)
    .maybeSingle();
  if (!lantern) {
    return NextResponse.json({ ok: false, error: "lantern_not_found" }, { status: 404 });
  }

  const session = await createCheckoutSession({
    amountCents: amount,
    lanternId,
    patronName,
    origin: requestOrigin(req),
  });
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: session.url });
}
