// Minimal Stripe REST client. Patron lights are optional: if the env keys
// are absent, every gift endpoint reports the oil store as closed.
import { createHmac, timingSafeEqual } from "crypto";
import { alertOperator } from "./alert";

const API = "https://api.stripe.com/v1";

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` };
}

export async function createCheckoutSession(opts: {
  amountCents: number;
  lanternId: string;
  patronName: string | null;
  origin: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(opts.amountCents),
    "line_items[0][price_data][product_data][name]":
      "Lantern oil — Waystation patron light",
    "line_items[0][price_data][product_data][description]":
      "A gift that makes one lantern burn brighter. Brightness buys nothing but brightness.",
    // tax handling: Stripe Tax computes and collects where required
    "automatic_tax[enabled]": "true",
    "billing_address_collection": "required",
    success_url: `${opts.origin}/patron/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.origin}/patron/${opts.lanternId}`,
    "metadata[lantern_id]": opts.lanternId,
  });
  if (opts.patronName) body.set("metadata[patron_name]", opts.patronName);

  const res = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.url) {
    // automatic_tax requires an origin address configured in the Stripe
    // dashboard; if it isn't, retry once without tax so a launch isn't blocked
    // — but alert the operator loudly so tax-free selling is never SILENT.
    if (data?.error?.param?.includes("automatic_tax") || data?.error?.message?.toLowerCase?.().includes("tax")) {
      await alertOperator(
        "Stripe Tax is not configured — a gift was created WITHOUT tax collection. Configure an origin address + Stripe Tax in the Stripe dashboard before taking international gifts."
      );
      body.delete("automatic_tax[enabled]");
      const retry = await fetch(`${API}/checkout/sessions`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const rd = await retry.json();
      if (retry.ok && rd.url) return { ok: true, url: rd.url };
    }
    return { ok: false, error: "stripe_error" };
  }
  return { ok: true, url: data.url };
}

export async function retrieveSession(sessionId: string): Promise<{
  paid: boolean;
  amountCents: number;
  lanternId: string | null;
  patronName: string | null;
} | null> {
  const res = await fetch(
    `${API}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: authHeader() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return {
    paid: data.payment_status === "paid",
    amountCents: typeof data.amount_total === "number" ? data.amount_total : 0,
    lanternId: data.metadata?.lantern_id ?? null,
    patronName: data.metadata?.patron_name ?? null,
  };
}

// Verify a Stripe webhook signature (v1 scheme) without the SDK.
export function verifyWebhook(
  payload: string,
  sigHeader: string | null,
  secret: string
): boolean {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => kv.split("=") as [string, string])
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // reject stale timestamps (>5 min) to prevent replay
  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
