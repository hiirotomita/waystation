import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db";
import { verifyWebhook } from "@/lib/stripe";
import { alertOperator } from "@/lib/alert";

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
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : null;
    if (paid && lanternId && amount > 0) {
      const { data, error } = await admin.rpc("record_gift", {
        p_lantern_id: lanternId,
        p_stripe_session_id: s.id,
        p_amount_cents: amount,
        p_patron_name: meta.patron_name ?? null,
        p_payment_intent: pi,
      });
      const result = data as { ok?: boolean; error?: string } | null;
      if (error || (result && result.ok === false)) {
        console.error("webhook record_gift:", error?.message ?? result?.error);
        await alertOperator(
          `a paid gift failed to record (session ${s.id}, ${error?.message ?? result?.error}). Reconcile in Stripe.`
        );
        return NextResponse.json({ error: "record_failed" }, { status: 500 });
      }
    }
  } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    // reflect reversals: reverse the gift by PaymentIntent and dim the lantern
    const ch = event.data?.object ?? {};
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : null;
    let reversed: { ok?: boolean; lantern_id?: string } | null = null;
    if (pi) {
      const { data } = await admin.rpc("reverse_gift_pi", { p_payment_intent: pi });
      reversed = data as { ok?: boolean; lantern_id?: string } | null;
    }
    await alertOperator(
      `a gift was refunded or disputed (${event.type})${
        reversed?.lantern_id ? `, lantern ${reversed.lantern_id} dimmed` : " — could not auto-match; verify on /admin"
      }.`
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
