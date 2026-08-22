import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db";
import { retrieveSession, stripeEnabled } from "@/lib/stripe";

export const runtime = "nodejs";

// GET /api/patron/confirm?session_id=cs_...
// Pull-based verification: Stripe is the authority. The gift is recorded
// (idempotently, keyed by session id) only after Stripe confirms payment.
export async function GET(req: Request) {
  if (!stripeEnabled()) {
    return NextResponse.json({ ok: false, error: "gifts_not_open_yet" }, { status: 503 });
  }
  const admin = dbAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "gifts_not_open_yet" }, { status: 503 });
  }

  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
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
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 500 });
  }
  return NextResponse.json({ ...(data as object), lantern_id: session.lanternId });
}
