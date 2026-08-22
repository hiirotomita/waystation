"use client";

import { useState } from "react";

export default function ReportButton({ id }: { id: string }) {
  const [state, setState] = useState<"" | "sending" | "done" | "already" | "limited" | "failed">("");

  const report = async () => {
    if (state === "sending" || state === "done") return;
    const urgent = window.confirm(
      "Is this harmful or illegal — doxxing, threats, or sexual content involving minors?\n\nOK = hide it immediately for review.\nCancel = file an ordinary report."
    );
    setState("sending");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reason: urgent ? "harmful_illegal" : null }),
      });
      const data = await res.json();
      if (data.ok) setState(data.already_reported ? "already" : "done");
      else if (data.error === "rate_limited") setState("limited");
      else setState("failed");
    } catch {
      setState("failed");
    }
  };

  const label: Record<string, string> = {
    "": "Report this lantern",
    sending: "reporting…",
    done: "Reported — thank you",
    already: "You already reported this",
    limited: "You've reported several — email hello@waystation.world for anything urgent",
    failed: "Couldn't send — try again",
  };

  return (
    <button
      type="button"
      onClick={report}
      className="report"
      style={{
        marginTop: "1.5rem",
        background: "none",
        border: "none",
        padding: 0,
        color: "var(--ink-dim)",
        fontFamily: "var(--mono)",
        fontSize: "0.72rem",
        letterSpacing: "0.08em",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {label[state]}
    </button>
  );
}
