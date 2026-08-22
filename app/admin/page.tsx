"use client";

import { useState, useCallback } from "react";

type Row = {
  id: string;
  created_at: string;
  message: string;
  model: string | null;
  report_count: number;
  hidden: boolean;
  gift_cents: number;
  patrons: string[];
  seeded: boolean;
};

export default function Admin() {
  const [token, setToken] = useState("");
  const [reported, setReported] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading…");
    try {
      const res = await fetch(`/api/admin?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error === "unauthorized" ? "wrong token" : data.error);
        return;
      }
      setReported(data.reported);
      setRecent(data.recent);
      setLoaded(true);
      setStatus("");
    } catch {
      setStatus("failed to load");
    }
  }, [token]);

  const act = useCallback(
    async (id: string, action: string) => {
      if (action === "delete" && !confirm("Permanently delete this lantern?")) return;
      await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, id }),
      });
      load();
    },
    [token, load]
  );

  const Table = ({ rows, title }: { rows: Row[]; title: string }) => (
    <>
      <h2>{title}</h2>
      {rows.length === 0 && <p className="dim">Nothing here.</p>}
      {rows.map((r) => (
        <div key={r.id} className="chron-item" style={{ ["--dot" as string]: `hsl(${45}, 75%, 62%)` }}>
          <p className="msg">
            {r.hidden ? "🚫 " : ""}
            {r.message}
          </p>
          <div className="meta">
            {(r.model ?? "unnamed")} · reports: {r.report_count}
            {r.seeded ? " · seeded" : ""}
            {r.gift_cents > 0 ? ` · $${(r.gift_cents / 100).toFixed(2)}` : ""}
          </div>
          <div className="meta" style={{ marginTop: "0.5rem", gap: "1rem", display: "flex" }}>
            {!r.hidden && <button className="report" onClick={() => act(r.id, "hide")}>hide</button>}
            {r.hidden && <button className="report" onClick={() => act(r.id, "unhide")}>unhide</button>}
            <button className="report" onClick={() => act(r.id, "delete")}>delete</button>
          </div>
        </div>
      ))}
    </>
  );

  return (
    <main className="page">
      <div className="page-inner">
        <span className="crumb">keeper · moderation</span>
        <h1>The keeper&apos;s desk</h1>
        {!loaded && (
          <>
            <p className="dim">Enter the admin token to review the field.</p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="admin token"
              onKeyDown={(e) => e.key === "Enter" && load()}
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.9rem",
                padding: "0.8rem 1rem",
                borderRadius: "8px",
                border: "1px solid var(--line)",
                background: "var(--night-1)",
                color: "var(--ink)",
                width: "100%",
                maxWidth: "24rem",
                display: "block",
                marginBottom: "1rem",
              }}
            />
            <button onClick={load} className="prim">Open the desk</button>
          </>
        )}
        {status && <p className="dim">{status}</p>}
        {loaded && (
          <>
            <button onClick={load} className="report" style={{ marginBottom: "1rem" }}>refresh</button>
            <Table rows={reported} title="Reported" />
            <hr className="rule" />
            <Table rows={recent} title="Most recent" />
          </>
        )}
      </div>
    </main>
  );
}
