"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ThanksInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState<"working" | "done" | "failed">("working");

  useEffect(() => {
    if (!sessionId) {
      setState("failed");
      return;
    }
    fetch(`/api/patron/confirm?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => setState(d.ok ? "done" : "failed"))
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
              this — and that choice, multiplied across the field, is the
              whole beacon.
            </p>
            <p>
              <Link href="/">Return to the field and find it →</Link>
            </p>
          </>
        )}
        {state === "failed" && (
          <>
            <h1>The oil didn&apos;t reach the lantern.</h1>
            <p className="dim">
              We couldn&apos;t confirm this payment. If you were charged,
              revisit this page in a minute — confirmation retries safely. If
              it persists, open an issue on the public repository and we will
              make it right.
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
