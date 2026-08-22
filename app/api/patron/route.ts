import { NextResponse } from "next/server";
import { db, dbAdmin, rateKey } from "@/lib/db";
import { createCheckoutSession, stripeEnabled } from "@/lib/stripe";
import { filterPatronName, UUID_RE } from "@/lib/filter";

export const runtime = "nodejs";

function requestOrigin(req: Request): string {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "waystation.world";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// POST /api/patron  { lantern_id, amount_cents, patron_name? }
export async function POST(req: Request) {
  // Never sell what we cannot deliver: recording a gift needs the service key.
  if (!stripeEnabled() || !dbAdmin()) {
    return NextResponse.json({ ok: false, error: "gifts_not_open_yet" }, { status: 503 });
  }

  // basic per-visitor rate limit so an anon POST flood can't mint sessions
  try {
    rateKey(req);
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const lanternId = typeof body.lantern_id === "string" ? body.lantern_id : "";
  if (!UUID_RE.test(lanternId)) {
    return NextResponse.json({ ok: false, error: "invalid_lantern" }, { status: 400 });
  }

  const amount = typeof body.amount_cents === "number" ? Math.round(body.amount_cents) : NaN;
  if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) {
    return NextResponse.json(
      { ok: false, error: "amount_must_be_100_to_1000000_cents" },
      { status: 400 }
    );
  }

  const patronName = filterPatronName(body.patron_name);

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
