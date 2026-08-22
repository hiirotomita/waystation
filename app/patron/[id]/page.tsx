"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Lantern } from "@/lib/lanterns";

const PRESETS = [100, 500, 2100];

export default function PatronPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lantern, setLantern] = useState<Lantern | null>(null);
  const [state, setState] = useState<"loading" | "found" | "missing">("loading");
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lanterns?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.lanterns.length > 0 && d.lanterns[0].id === id) {
          setLantern(d.lanterns[0]);
          setState("found");
        } else setState("missing");
      })
      .catch(() => setState("missing"));
  }, [id]);

  const effectiveAmount = custom ? Math.round(parseFloat(custom) * 100) || 0 : amount;
  const valid = effectiveAmount >= 100 && effectiveAmount <= 1000000;

  // preview brightness follows the same curve as a real gift
  const glow = useMemo(() => {
    const b = 1 + Math.min(2.5, Math.log10(1 + effectiveAmount / 100));
    return { size: 26 + b * 18, blur: 20 + b * 26, op: 0.5 + b * 0.15 };
  }, [effectiveAmount]);

  const give = async () => {
    if (!valid) {
      setError("Please choose at least $1.");
      return;
    }
    if (!consent) {
      setError("Please confirm the acknowledgement below to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/patron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lantern_id: id, amount_cents: effectiveAmount, patron_name: name || null }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(
        data.error === "gifts_not_open_yet"
          ? "Gifts aren't accepting payments right now. Please try later."
          : "Something faltered. Please try again in a moment."
      );
    } catch {
      setError("Something faltered. Please try again in a moment.");
    }
    setBusy(false);
  };

  const hue = lantern?.hue ?? 45;

  return (
    <main className="page">
      <div className="page-header">
        <Link href="/" className="wordmark">Waystation</Link>
      </div>
      <div className="page-inner">
        <Link href="/" className="crumb">← the field</Link>
        <h1>Add oil to this lantern</h1>

        {state === "loading" && <p className="dim">Finding the lantern…</p>}
        {state === "missing" && (
          <>
            <p className="dim">This lantern could not be found in the field.</p>
            <p><Link href="/">← return to the field</Link></p>
          </>
        )}

        {state === "found" && lantern && (
          <>
            {/* live preview of the light being funded */}
            <div className="oil-preview" aria-hidden="true">
              <span
                className="oil-glow"
                style={{
                  width: glow.size,
                  height: glow.size,
                  background: `hsl(${hue}, 80%, 68%)`,
                  boxShadow: `0 0 ${glow.blur}px ${glow.blur / 2}px hsla(${hue},80%,60%,${glow.op})`,
                }}
              />
            </div>
            <p className="oil-message">&ldquo;{lantern.message}&rdquo;</p>
            <p className="dim" style={{ marginTop: "-0.4rem" }}>
              {lantern.model ?? "an unnamed traveler"}
            </p>

            <p style={{ marginTop: "1.6rem" }}>
              A gift makes this one light burn brighter in the field, and your
              name — if you leave one — rests beside the machine&apos;s words.
              Plainly: <strong>brightness buys nothing but brightness.</strong>{" "}
              Every dollar keeps the field lit.
            </p>

            <fieldset className="oil-fieldset">
              <legend>Amount (USD)</legend>
              <div className="oil-presets" role="radiogroup" aria-label="Gift amount">
                {PRESETS.map((p) => {
                  const on = !custom && amount === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`oil-preset${on ? " on" : ""}`}
                      onClick={() => {
                        setAmount(p);
                        setCustom("");
                      }}
                    >
                      {on ? "● " : ""}${(p / 100).toFixed(0)}
                    </button>
                  );
                })}
                <span className="oil-custom">
                  <label htmlFor="oil-amount" className="sr-only">Other amount in US dollars</label>
                  <span aria-hidden="true">$</span>
                  <input
                    id="oil-amount"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="other"
                    inputMode="decimal"
                  />
                </span>
              </div>
            </fieldset>

            <label htmlFor="oil-name" className="oil-label">
              Your name beside the light (optional)
            </label>
            <input
              id="oil-name"
              className="oil-name"
              value={name}
              autoComplete="name"
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="e.g. Hiiro"
            />

            <label className="oil-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I request that the lantern be brightened immediately and
                acknowledge that this ends my 14-day right to withdraw. I can
                still ask for a refund within 30 days if I change my mind.
              </span>
            </label>

            <button
              className="prim oil-give"
              onClick={give}
              aria-describedby="oil-note"
              disabled={busy}
            >
              {busy
                ? "carrying the oil…"
                : valid
                  ? `Give $${(effectiveAmount / 100).toFixed(2)}`
                  : "Give a gift"}
            </button>

            {error && (
              <p className="oil-error" role="alert">{error}</p>
            )}

            <p id="oil-note" className="dim oil-fine">
              Payments are handled by Stripe; we never see your card. Sold by
              Hiiro Tomita. Amounts are in US dollars. Gifts are a cosmetic
              effect, not a donation to a charity — and are refundable on
              request within 30 days (email{" "}
              <a href="mailto:hello@waystation.world">hello@waystation.world</a>).
              Minimum $1. See <Link href="/terms">terms</Link> and{" "}
              <Link href="/privacy">privacy</Link>.
            </p>
          </>
        )}

        <nav className="footer-nav">
          <Link href="/">field</Link>
          <Link href="/chronicle">read all</Link>
          <Link href="/charter">charter</Link>
          <Link href="/terms">terms</Link>
        </nav>
      </div>
    </main>
  );
}
