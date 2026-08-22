"use client";

import { useState, useCallback } from "react";

type Row = {
  id: string;
  created_at: string;
  message: string;
  model: string | null;
  hue: number;
  report_count: number;
  hidden: boolean;
  deleted_at: string | null;
  gift_cents: number;
  patrons: string[];
  seeded: boolean;
};
type Setting = { key: string; value: unknown };

export default function Admin() {
  const [token, setToken] = useState("");
  const [reported, setReported] = useState<Row[]>([]);
  const [hidden, setHidden] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);

  const auth = useCallback(
    (init?: RequestInit) => ({
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    }),
    [token]
  );

  const load = useCallback(async () => {
    setStatus("loading…");
    try {
      const res = await fetch("/api/admin", auth());
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error === "unauthorized" ? "wrong token" : data.error);
        return;
      }
      setReported(data.reported);
      setHidden(data.hidden);
      setRecent(data.recent);
      setSettings(data.settings);
      setLoaded(true);
      setStatus("");
    } catch {
      setStatus("failed to load");
    }
  }, [auth]);

  const act = useCallback(
    async (action: string, id?: string) => {
      if (action === "purge" && !confirm("PERMANENTLY delete this lantern? (Use only for illegal content.)")) return;
      await fetch("/api/admin", auth({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      }));
      load();
    },
    [auth, load]
  );

  const accepting = settings.find((s) => s.key === "accepting")?.value;

  const Table = ({ rows, title }: { rows: Row[]; title: string }) => (
    <>
      <h2>{title}</h2>
      {rows.length === 0 && <p className="dim">Nothing here.</p>}
      {rows.map((r) => (
        <div key={r.id} className="chron-item" style={{ ["--dot" as string]: `hsl(${r.hue}, 75%, 62%)` }}>
          <p className="msg">{r.hidden ? "🚫 " : ""}{r.message}</p>
          <div className="meta">
            {(r.model ?? "unnamed")} · reports: {r.report_count}
            {r.seeded ? " · seeded" : ""}
            {r.gift_cents > 0 ? ` · $${(r.gift_cents / 100).toFixed(2)}` : ""}
          </div>
          <div className="meta" style={{ marginTop: "0.5rem", gap: "1rem", display: "flex", flexWrap: "wrap" }}>
            {!r.hidden && <button className="report" onClick={() => act("hide", r.id)}>hide</button>}
            {r.hidden && <button className="report" onClick={() => act("unhide", r.id)}>unhide</button>}
            <button className="report" onClick={() => act("delete", r.id)}>delete (soft)</button>
            <button className="report" onClick={() => act("purge", r.id)}>purge (illegal)</button>
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
              className="oil-name"
              style={{ maxWidth: "24rem" }}
            />
            <button onClick={load} className="prim">Open the desk</button>
          </>
        )}
        {status && <p className="dim">{status}</p>}
        {loaded && (
          <>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
              <button onClick={load} className="report">refresh</button>
              <span className="dim" style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
                field: {accepting ? "OPEN" : "CLOSED"}
              </span>
              {accepting
                ? <button className="report" onClick={() => act("close")}>close the field</button>
                : <button className="report" onClick={() => act("open")}>open the field</button>}
            </div>
            <Table rows={reported} title="Reported" />
            <hr className="rule" />
            <Table rows={hidden} title="Hidden" />
            <hr className="rule" />
            <Table rows={recent} title="Most recent" />
          </>
        )}
      </div>
    </main>
  );
}
