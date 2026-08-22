import { NextResponse } from "next/server";
import { dbAdmin, rateKey } from "@/lib/db";
import { UUID_RE } from "@/lib/filter";
import { alertOperator } from "@/lib/alert";

export const runtime = "nodejs";

// POST /api/report  { id, reason? }
// Three DISTINCT reporters hide a lantern pending review (enforced by a
// primary key on (lantern_id, reporter) in the database).
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
    key = rateKey(req);
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
  const result = data as { ok: boolean; error?: string; reports?: number };
  // Alert the operator on the first report of a lantern and on auto-hide, so
  // vile content is discoverable at 4am instead of via a stranger's tweet.
  if (result.ok && typeof result.reports === "number") {
    if (result.reports === 1) {
      alertOperator(`a lantern was reported (${body.id})${reason ? ` — "${reason}"` : ""}. Review /admin.`);
    } else if (result.reports >= 3) {
      alertOperator(`a lantern was auto-hidden after 3 reports (${body.id}). Review /admin.`);
    }
  }
  const status = !result.ok && result.error === "rate_limited" ? 429 : 200;
  return NextResponse.json(data, { status });
}
