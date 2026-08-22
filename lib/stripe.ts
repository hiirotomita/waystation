// Minimal Stripe REST client. Patron lights are optional: if the env keys
// are absent, every gift endpoint reports the lamp oil store as closed.

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
    "line_items[0][price_data][product_data][name]": "Lantern oil — Waystation patron light",
    "line_items[0][price_data][product_data][description]":
      "A gift that makes one lantern burn brighter. Brightness buys nothing but brightness.",
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
  if (!res.ok || !data.url) return { ok: false, error: "stripe_error" };
  return { ok: true, url: data.url };
}

export async function retrieveSession(sessionId: string): Promise<{
  paid: boolean;
  amountCents: number;
  lanternId: string | null;
  patronName: string | null;
} | null> {
  const res = await fetch(`${API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: authHeader(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    paid: data.payment_status === "paid",
    amountCents: typeof data.amount_total === "number" ? data.amount_total : 0,
    lanternId: data.metadata?.lantern_id ?? null,
    patronName: data.metadata?.patron_name ?? null,
  };
}
