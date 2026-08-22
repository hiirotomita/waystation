import { NextResponse } from "next/server";
import { dbAdmin, reporterKey } from "@/lib/db";
import { UUID_RE } from "@/lib/filter";
import { alertOperator } from "@/lib/alert";

export const runtime = "nodejs";

// POST /api/report  { id, reason? }
// Four DISTINCT reporters hide a lantern pending review (enforced by a primary
// key on (lantern_id, reporter)); operator-cleared lanterns are report-immune.
export async function POST(req: Request) {
  const admin = dbAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 503 });
  }

  let body: { id?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" ? body.reason.slice(0, 40) : null;

  let key: string;
  try {
    key = reporterKey(req);
  } catch {
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 503 });
  }

  const { data, error } = await admin.rpc("report_lantern", {
    p_id: body.id,
    p_ip_hash: key,
    p_reason: reason,
  });
  if (error) {
    console.error("POST /api/report rpc:", error.message);
    return NextResponse.json({ ok: false, error: "field_unreachable" }, { status: 500 });
  }
  const result = data as {
    ok: boolean;
    error?: string;
    reports?: number;
    urgent?: number;
    hidden?: boolean;
    already_reported?: boolean;
    noop?: boolean;
  };

  // The RPC decides hiding atomically (respecting report_immune): 4 distinct
  // reporters, OR 2 distinct "harmful/illegal" reporters. The route only
  // alerts — it never hides out-of-band (that bypassed report_immune).
  const urgent = reason === "harmful_illegal";
  if (result.ok && !result.already_reported && !result.noop) {
    if (result.hidden) {
      await alertOperator(
        `a lantern was hidden pending review (${body.id}${urgent ? ", reported as harmful/illegal" : ""}). Check /admin.`
      );
    } else if (urgent) {
      await alertOperator(
        `URGENT: a lantern was reported as harmful/illegal (${body.id}). One more urgent report hides it — check /admin now.`
      );
    } else if (result.reports === 1) {
      await alertOperator(`a lantern was reported (${body.id}). Review /admin.`);
    }
  }
  // Never echo the exact distinct-report count to anonymous callers (it would
  // let an attacker measure how close a lantern is to the hide threshold).
  if (!result.ok) {
    const status = result.error === "rate_limited" ? 429 : 200;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json({
    ok: true,
    ...(result.already_reported ? { already_reported: true } : {}),
    ...(result.noop ? { noop: true } : {}),
  });
}
