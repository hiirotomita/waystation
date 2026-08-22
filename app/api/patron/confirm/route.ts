import { NextResponse } from "next/server";
import { dbAdmin, rateKey } from "@/lib/db";
import { retrieveSession, stripeEnabled } from "@/lib/stripe";

export const runtime = "nodejs";

// GET /api/patron/confirm?session_id=cs_...
// Fast-path confirmation on redirect. The Stripe webhook is the authoritative
// record path; this exists so the buyer sees the light brighten immediately.
export async function GET(req: Request) {
  const admin = dbAdmin();
  if (!stripeEnabled() || !admin) {
    return NextResponse.json({ ok: false, error: "gifts_not_open_yet" }, { status: 503 });
  }

  // rate-limit: this proxies a Stripe API read; don't let it be an amplifier
  try {
    rateKey(req);
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!/^cs_[A-Za-z0-9_]{6,}$/.test(sessionId)) {
    return NextResponse.json({ ok: false, error: "invalid_session" }, { status: 400 });
  }

  const session = await retrieveSession(sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: "stripe_error" }, { status: 502 });
  }
  if (!session.paid || !session.lanternId || session.amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "not_paid" }, { status: 402 });
  }

  const { data, error } = await admin.rpc("record_gift", {
    p_lantern_id: session.lanternId,
    p_stripe_session_id: sessionId,
    p_amount_cents: session.amountCents,
    p_patron_name: session.patronName,
  });
  if (error) {
    console.error("confirm record_gift:", error.message);
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 500 });
  }
  return NextResponse.json({ ...(data as object), lantern_id: session.lanternId });
}
