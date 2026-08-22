import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db";
import { verifyWebhook } from "@/lib/stripe";

export const runtime = "nodejs";

// POST /api/stripe/webhook — the authoritative gift-recording path.
// Stripe calls this on checkout.session.completed even if the buyer never
// returns to the site, so a captured payment always brightens its lantern.
// record_gift is idempotent by session id, so this composes safely with the
// redirect fast-path.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const admin = dbAdmin();
  if (!secret || !admin) {
    // Not configured yet — acknowledge so Stripe doesn't retry-storm, but
    // log loudly: without this, orphan payments are possible.
    console.error("stripe webhook hit but STRIPE_WEBHOOK_SECRET/service key missing");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verifyWebhook(payload, sig, secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data?.object ?? {};
    const paid = s.payment_status === "paid";
    const meta = (s.metadata ?? {}) as Record<string, string>;
    const lanternId = meta.lantern_id;
    const amount = typeof s.amount_total === "number" ? s.amount_total : 0;
    if (paid && lanternId && amount > 0) {
      const { error } = await admin.rpc("record_gift", {
        p_lantern_id: lanternId,
        p_stripe_session_id: s.id,
        p_amount_cents: amount,
        p_patron_name: meta.patron_name ?? null,
      });
      if (error) {
        console.error("webhook record_gift:", error.message);
        return NextResponse.json({ error: "record_failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
