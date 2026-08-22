"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ThanksInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [lanternId, setLanternId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setState("failed");
      return;
    }
    fetch(`/api/patron/confirm?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => {
        setState(d.ok ? "done" : "failed");
        if (d.lantern_id) setLanternId(d.lantern_id);
      })
      .catch(() => setState("failed"));
  }, [sessionId]);

  return (
    <main className="page">
      <div className="page-inner">
        <Link href="/" className="crumb">
          ← the field
        </Link>
        {state === "working" && <h1>Carrying the oil…</h1>}
        {state === "done" && (
          <>
            <h1>The light burns brighter.</h1>
            <p>
              Your gift is in the lantern now. Somewhere in the field, one
              light shines a little further into the dark because you chose
              this.
            </p>
            <p>
              {lanternId ? (
                <Link href={`/lantern/${lanternId}`}>See your lantern →</Link>
              ) : (
                <Link href="/">Return to the field →</Link>
              )}
            </p>
          </>
        )}
        {state === "failed" && (
          <>
            <h1>We couldn&apos;t confirm your payment yet.</h1>
            <p>
              If you were charged, nothing is lost — the gift is recorded
              automatically even if this page can&apos;t reach it, and the
              lantern will brighten shortly. You can safely revisit this page in
              a minute.
            </p>
            <p className="dim">
              If anything still looks wrong, email{" "}
              <a href="mailto:hello@waystation.world">hello@waystation.world</a>{" "}
              and we&apos;ll make it right — refunds within 30 days, no
              questions.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function Thanks() {
  return (
    <Suspense>
      <ThanksInner />
    </Suspense>
  );
}
