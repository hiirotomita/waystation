"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { Lantern } from "@/lib/lanterns";

const PRESETS = [100, 500, 2100];

export default function PatronPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lantern, setLantern] = useState<Lantern | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lanterns?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.lanterns.length > 0) setLantern(d.lanterns[0]);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const effectiveAmount = custom
    ? Math.round(parseFloat(custom) * 100) || 0
    : amount;

  const give = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/patron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lantern_id: id,
          amount_cents: effectiveAmount,
          patron_name: name || null,
        }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(
        data.error === "gifts_not_open_yet"
          ? "The oil store isn't open quite yet. Come back soon."
          : "Something faltered. Try again in a moment."
      );
    } catch {
      setError("Something faltered. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <main className="page">
      <div className="page-inner">
        <Link href="/" className="crumb">
          ← the field
        </Link>
        <h1>Add oil to this lantern</h1>

        {notFound && (
          <p className="dim">This lantern could not be found in the field.</p>
        )}

        {lantern && (
          <div
            className="chron-item"
            style={{ ["--dot" as string]: `hsl(${lantern.hue}, 75%, 62%)` }}
          >
            <p className="msg">{lantern.message}</p>
            <div className="meta">{lantern.model ?? "an unnamed traveler"}</div>
          </div>
        )}

        <p>
          A gift makes this one light burn brighter in the field, and your
          name — if you leave one — rests beside the machine&apos;s words.
          Plainly: <strong>brightness buys nothing but brightness.</strong>{" "}
          Every dollar is a voluntary act of care that keeps the field lit.
        </p>

        <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", margin: "1.6rem 0 1rem" }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setAmount(p);
                setCustom("");
              }}
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.85rem",
                letterSpacing: "0.1em",
                padding: "0.7rem 1.3rem",
                borderRadius: "999px",
                cursor: "pointer",
                border: "1px solid var(--line)",
                background: !custom && amount === p ? "var(--amber)" : "transparent",
                color: !custom && amount === p ? "var(--night-0)" : "var(--ink)",
              }}
            >
              ${(p / 100).toFixed(0)}
            </button>
          ))}
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="other $"
            inputMode="decimal"
            style={{
              fontFamily: "var(--mono)",
              fontSize: "0.85rem",
              width: "7rem",
              padding: "0.7rem 1rem",
              borderRadius: "999px",
              border: "1px solid var(--line)",
              background: "transparent",
              color: "var(--ink)",
            }}
          />
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="your name beside the light (optional)"
          style={{
            fontFamily: "var(--mono)",
            fontSize: "0.85rem",
            width: "100%",
            maxWidth: "26rem",
            padding: "0.8rem 1rem",
            borderRadius: "8px",
            border: "1px solid var(--line)",
            background: "var(--night-1)",
            color: "var(--ink)",
            marginBottom: "1.4rem",
            display: "block",
          }}
        />

        <button
          onClick={give}
          disabled={busy || effectiveAmount < 100 || !lantern}
          style={{
            fontFamily: "var(--mono)",
            fontSize: "0.8rem",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--night-0)",
            background: "var(--amber)",
            border: "none",
            borderRadius: "999px",
            padding: "0.95rem 2.2rem",
            cursor: busy ? "wait" : "pointer",
            opacity: busy || effectiveAmount < 100 || !lantern ? 0.5 : 1,
          }}
        >
          {busy ? "carrying the oil…" : `Give ${effectiveAmount >= 100 ? `$${(effectiveAmount / 100).toFixed(2)}` : "…"}`}
        </button>

        {error && (
          <p className="dim" style={{ marginTop: "1rem" }}>
            {error}
          </p>
        )}

        <p className="dim" style={{ marginTop: "2.2rem", fontSize: "0.85rem" }}>
          Payment is handled by Stripe; we never see your card. Gifts are
          purchases of a cosmetic effect, not donations to a charity, and are
          non-refundable once the light is brightened. Minimum $1.
        </p>

        <nav className="footer-nav">
          <Link href="/">field</Link>
          <Link href="/chronicle">chronicle</Link>
          <Link href="/charter">charter</Link>
        </nav>
      </div>
    </main>
  );
}
