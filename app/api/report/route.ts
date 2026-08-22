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
    already_reported?: boolean;
    noop?: boolean;
  };

  // A single credible "harmful/illegal" report (doxxing, threats, CSAM) hides
  // the lantern immediately pending review — these can't wait for four
  // reporters on a low-traffic site.
  const urgent = reason === "harmful_illegal";
  if (result.ok && urgent && !result.already_reported && !result.noop) {
    await admin.from("lanterns").update({ hidden: true }).eq("id", body.id);
    await admin.from("moderation_log").insert({
      action: "urgent_hide",
      lantern_id: body.id,
      note: "single harmful/illegal report",
    });
    await alertOperator(
      `URGENT: a lantern was reported as harmful/illegal and hidden pending review (${body.id}). Check /admin now.`
    );
  } else if (result.ok && typeof result.reports === "number") {
    // Alert on the first report and on auto-hide, so vile content is
    // discoverable at 4am instead of via a stranger's tweet.
    if (result.reports === 1) {
      await alertOperator(`a lantern was reported (${body.id}). Review /admin.`);
    } else if (result.reports >= 4) {
      await alertOperator(`a lantern was auto-hidden after ${result.reports} reports (${body.id}). Review /admin.`);
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
